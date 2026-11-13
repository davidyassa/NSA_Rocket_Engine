import { Mic, MicOff, Settings2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { converse, newDialogue, type DialogueAction } from './dialogue';
import { KnowledgeIndex } from './knowledge';
import { guideFor } from './pageGuides';
import type { AssistantContext, AssistantReply } from './respond';
import { SolBubble } from './SolBubble';
import { SolListener, heySolWanted, isVoiceModeOpen, onHeySolChange, onVoiceModeChange, setHeySolWanted } from './solListener';
import { prepareVoice, speak } from './voiceOutput';
import './solDock.css';

/** Back to waiting for "Hey Sol" after this much quiet in a conversation. */
const IDLE_MS = 25_000;
type DockState = 'idle' | 'starting' | 'resume' | 'waiting' | 'listening' | 'thinking' | 'speaking' | 'error';
const STATUS: Record<DockState, string> = {
  idle: 'Tap the mic to talk',
  starting: 'Starting “Hey Sol”…',
  resume: 'Microphone paused by browser',
  waiting: 'Listening for “Hey Sol”',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking',
  error: 'Voice is not available',
};

/** Sol on every tab: tap the bubble or say "Hey Sol". Knows which tab you are on. */
export function SolDock({ ctx, onAction }: {
  ctx: AssistantContext; onAction: (action: DialogueAction) => void;
}) {
  const { pathname, search } = useLocation();
  const index = useRef<KnowledgeIndex | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DockState>('idle');
  const heySol = useSyncExternalStore(onHeySolChange, heySolWanted);
  const voiceModeOpen = useSyncExternalStore(onVoiceModeChange, isVoiceModeOpen);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const listener = useRef<SolListener | null>(null);
  const playback = useRef<AbortController | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const dialogue = useRef(newDialogue());
  const idleTimer = useRef<number | undefined>(undefined);
  const live = useRef({ pathname, search, ctx, onAction });
  live.current = { pathname, search, ctx, onAction };

  const stopListener = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    playback.current?.abort();
    playback.current = null;
    listener.current?.stop();
    listener.current = null;
    dialogue.current = newDialogue();
  }, []);

  const backToWaiting = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    playback.current?.abort();
    playback.current = null;
    dialogue.current = newDialogue();
    const l = listener.current;
    if (l && l.running && heySolWanted() && !document.hidden && !isVoiceModeOpen()) {
      l.mode = 'wake';
      setState(l.ready ? 'waiting' : 'resume');
    } else {
      stopListener();
      setState('idle');
    }
  }, [stopListener]);

  const armIdle = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(backToWaiting, IDLE_MS);
  }, [backToWaiting]);

  const say = useCallback(async (text: string, farewell = false) => {
    const l = listener.current;
    if (!l) return;
    l.mode = 'paused';
    const speech = new AbortController();
    playback.current = speech;
    setState('speaking');
    await speak(text, speech.signal);
    if (playback.current !== speech || listener.current !== l) return;
    playback.current = null;
    if (farewell && !speech.signal.aborted) {
      backToWaiting();
      return;
    }
    l.mode = 'active';
    setState(l.ready ? 'listening' : 'resume');
    if (l.ready) armIdle();
  }, [armIdle, backToWaiting]);

  const answer = useCallback((text: string) => {
    window.clearTimeout(idleTimer.current);
    setHeard(text);
    const { ctx, pathname: page, search, onAction: apply } = live.current;
    index.current ??= new KnowledgeIndex();
    const turn = converse(text, dialogue.current, ctx, index.current, page, search);
    dialogue.current = turn.state;
    let next = turn.reply;
    if (turn.action) apply(turn.action);
    if (next.kind === 'mood_start') {
      apply({ navigate: '/assistant' });
      next = { ...next, text: 'To start your mood check, tap Talk to Sol on the Ask Sol page and say “start a mood check”.' };
    }
    setReply(next);
    void say(next.text, next.kind === 'farewell');
  }, [say]);

  const ensureListener = useCallback((mode: 'wake' | 'active') => {
    if (document.hidden || isVoiceModeOpen()) return;
    let l = listener.current;
    if (!l) {
      const created = new SolListener({
        onWake: (rest) => {
          setOpen(true);
          setHeard('');
          if (rest) answer(rest);
          else {
            const text = `Yes? You’re on ${guideFor(live.current.pathname).name}.`;
            setReply({ kind: 'help', text, sources: [] });
            void say(text);
          }
        },
        onUtterance: answer,
        onAudioReady: (ready) => {
          if (created.mode === 'paused') return;
          window.clearTimeout(idleTimer.current);
          if (!ready) setState('resume');
          else if (created.mode === 'wake') setState('waiting');
          else { setState('listening'); armIdle(); }
        },
        onSpeechStart: () => {
          if (created.mode === 'active') window.clearTimeout(idleTimer.current);
        },
        onBusy: (busy) => {
          if (created.mode !== 'active') return;
          setState(busy ? 'thinking' : 'listening');
          if (!busy) armIdle();
        },
        onError: (message) => {
          stopListener();
          setError(message);
          setState('error');
        },
      });
      listener.current = l = created;
      l.mode = mode;
      setProgress(0);
      setState('starting');
      // Warm the on-device voice while the mic/model load, so the first reply
      // after "Hey Sol" speaks immediately instead of paying a cold start.
      prepareVoice();
      void l.start((p) => setProgress(p));
      return;
    }
    l.mode = mode;
    l.enableAudio();
    if (l.ready) {
      setState(mode === 'wake' ? 'waiting' : 'listening');
      if (mode === 'active') armIdle();
    }
  }, [answer, armIdle, say, stopListener]);

  useEffect(() => {
    const suspend = () => {
      stopListener();
      setState('idle');
    };
    const resume = () => {
      if (heySolWanted() && !listener.current) void ensureListener('wake');
    };
    const onVisibility = () => { if (document.hidden) suspend(); else resume(); };
    const offPreference = onHeySolChange(() => { if (heySolWanted()) resume(); else suspend(); });
    const offVoiceMode = onVoiceModeChange((active) => {
      if (active) { suspend(); setOpen(false); }
      else resume();
    });
    // Let React complete its development effect cleanup before requesting permission.
    const start = window.setTimeout(onVisibility, 0);
    const onInteraction = (event: Event) => {
      if (event.isTrusted && listener.current && !listener.current.ready) listener.current.enableAudio();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    window.addEventListener('pointerup', onInteraction, true);
    window.addEventListener('keydown', onInteraction, true);
    return () => {
      window.clearTimeout(start);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener('pointerup', onInteraction, true);
      window.removeEventListener('keydown', onInteraction, true);
      offPreference();
      offVoiceMode();
      stopListener();
    };
  }, [ensureListener, stopListener]);

  function talk() {
    if (state === 'starting') return;
    if (state === 'resume') { listener.current?.enableAudio(); return; }
    if (state === 'error' && heySol) { ensureListener('wake'); return; }
    if (busy) { backToWaiting(); return; }
    dialogue.current = newDialogue();
    setHeard('');
    void ensureListener('active');
    const g = guideFor(pathname);
    setReply({ kind: 'help', text: `I’m listening. You’re on ${g.name}: ask me how to use it, or anything about your health.`, sources: [] });
  }

  function closePanel() {
    setOpen(false);
    if (state === 'starting') {
      if (listener.current?.mode === 'active') {
        stopListener();
        setState('idle');
      }
    } else if (busy) backToWaiting();
  }

  function tapBubble() {
    if (playback.current) {
      playback.current.abort();
      return;
    }
    if (state === 'resume') {
      setOpen(true);
      listener.current?.enableAudio();
      return;
    }
    if (open) closePanel();
    else setOpen(true);
  }

  const busy = state === 'starting' || state === 'listening' || state === 'thinking' || state === 'speaking';
  if (voiceModeOpen) return null;

  return (
    <div className="sol-dock" data-open={open} onKeyDown={(event) => {
      if (open && event.key === 'Escape') { closePanel(); button.current?.focus(); }
    }}>
      <button ref={button} type="button" className="sol-dock-button" aria-label={state === 'speaking' ? 'Interrupt Sol' : state === 'resume' ? 'Resume Sol microphone' : open ? 'Hide Sol' : 'Open Sol, your health helper'}
        aria-expanded={open} aria-controls="sol-dock-panel" onClick={tapBubble}>
        <SolBubble speaking={state === 'speaking'} />
        {state === 'waiting' && <span className="sol-dock-live" aria-hidden="true" />}
      </button>
      {!open && (state === 'starting' || state === 'waiting' || state === 'resume' || state === 'error') && <span className="sol-dock-wake" role="status">{STATUS[state]}</span>}
      {open && (
        <section id="sol-dock-panel" className="sol-dock-panel" aria-label="Sol, your health helper">
          <div className="sol-dock-head">
            <button type="button" className="sol-dock-orb" disabled={state !== 'speaking'} aria-label="Interrupt Sol’s reply" onClick={tapBubble}>
              <SolBubble speaking={state === 'speaking'} />
            </button>
            <div className="sol-dock-title">
              <strong>Sol</strong>
              <span aria-live="polite">{state === 'starting' && progress > 0 && progress < 1 ? `Downloading voice model… ${Math.round(progress * 100)}%` : STATUS[state]}</span>
            </div>
            <button type="button" className="sol-dock-icon" aria-label="Close Sol" onClick={() => { closePanel(); button.current?.focus(); }}><X size={18} aria-hidden="true" /></button>
          </div>
          <div className="sol-dock-body" aria-live="polite">
            {state === 'error' ? <p className="sol-dock-error">{error}</p> : (
              <>
                {heard && <p className="sol-dock-you"><span className="sr-only">You said </span>{heard}</p>}
                <p className="sol-dock-sol"><span className="sr-only">Sol said </span>{reply?.text ?? `You’re on ${guideFor(pathname).name}. Select Talk or say “Hey Sol” if listening is on.`}</p>
                {reply && reply.sources.length > 0 && (
                  <p className="sol-dock-sources">From: {reply.sources.map((s, i) => (
                    <span key={`${s.label}-${i}`}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.route ? <Link to={s.route}>{s.label}</Link> : s.label}</span>
                  ))}</p>
                )}
              </>
            )}
          </div>
          <div className="sol-dock-actions">
            <button type="button" className={`button ${busy ? 'button-secondary' : 'button-primary'}`} onClick={talk} disabled={state === 'starting'}>
              {busy ? <><MicOff size={18} aria-hidden="true" /> Stop</> : <><Mic size={18} aria-hidden="true" /> {state === 'resume' ? 'Resume microphone' : state === 'error' ? 'Retry microphone' : 'Talk'}</>}
            </button>
            <Link to="/assistant#voice-settings" className="sol-dock-settings" onClick={closePanel}><Settings2 size={16} aria-hidden="true" /> Voice settings</Link>
          </div>
          <label className="voice-setting-row sol-dock-switch">
            <input type="checkbox" role="switch" checked={heySol} onChange={(event) => setHeySolWanted(event.target.checked)} />
            <span>Listen for “Hey Sol”</span>
          </label>
          <p className="sol-dock-privacy">Speech is transcribed on this device while Sol Check is visible.</p>
        </section>
      )}
    </div>
  );
}
