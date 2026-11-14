import { Keyboard, Mic, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MoodMcqAnswers } from '../checkin/moodAssessment';
import type { KnowledgeIndex } from './knowledge';
import { MOOD_QUESTIONS, moodQuestionSpeech, moodReply, parseMoodAnswer } from './mood';
import { type AssistantContext, type AssistantReply } from './respond';
import { converse, newDialogue, speculateIntent, type DialogueAction } from './dialogue';
import { ReplySteps } from './ReplySteps';
import { spokenText } from './spoken';
import { SolBubble } from './SolBubble';
import { setVoiceModeOpen } from './solListener';
import { speechToText } from './speechToText';
import { SpeechSegmenter, resampleTo16k } from './voiceAudio';
import { isSpeaking, prepareVoice, speak, stopSpeaking, triggerBargeIn } from './voiceOutput';
import { createVocalDetector, type VocalDetectorNode } from './bargeInWorklet';
import './voiceMode.css';

type Phase = 'loading' | 'listening' | 'hearing' | 'thinking' | 'speaking' | 'error';

const PHASE_TEXT: Record<Phase, string> = {
  loading: 'Getting ready…',
  listening: 'Listening',
  hearing: 'I hear you…',
  thinking: 'Thinking…',
  speaking: 'Speaking',
  error: 'Voice is not available',
};

/** Whisper sometimes "hears" these in silence; never treat them as a question. */
const NOISE = /^\s*(\[.*\]|\(.*\)|you[.!?]?|thanks for watching[.!?]?|[.,])?\s*$/i;
const CLOSE = /^\s*(?:(?:stop|close|exit)(?: (?:the )?(?:call|conversation|voice mode))?|end (?:the )?(?:call|conversation))[.!?]*\s*$/i;

export function VoiceMode({ ctx, index, onExchange, onClose, onAction }: {
  ctx: AssistantContext;
  index: KnowledgeIndex;
  onExchange: (question: string, reply: AssistantReply) => void;
  onClose: (typeInstead?: boolean) => void;
  onAction: (action: DialogueAction) => void;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [progress, setProgress] = useState(0);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [error, setError] = useState('');
  const busy = useRef(true);
  const mood = useRef<{ step: number; answers: MoodMcqAnswers } | null>(null);
  const ctxRef = useRef(ctx);
  const actionRef = useRef(onAction);
  const dialogue = useRef(newDialogue());
  ctxRef.current = ctx;
  actionRef.current = onAction;

  useEffect(() => {
    setVoiceModeOpen(true);
    let cancelled = false;
    let startupFailed = false;
    let stream: MediaStream | null = null;
    let audio: AudioContext | null = null;
    let vocalDetector: VocalDetectorNode | null = null;
    const playback = new AbortController();
    busy.current = true;
    prepareVoice();

    const answer = async (text: string, segmenter: SpeechSegmenter) => {
      if (CLOSE.test(text)) { onClose(); return; }
      const turn = converse(text, dialogue.current, ctxRef.current, index, '/assistant');
      dialogue.current = turn.state;
      let next = turn.reply;
      let speech: string;
      const state = mood.current;
      if (next.kind === 'farewell' || next.kind === 'crisis' || next.kind === 'urgent') {
        mood.current = null;
        speech = spokenText(next);
      } else if (state) {
        const score = parseMoodAnswer(text, state.step);
        if (score === null) {
          next = { kind: 'help', text: 'Sorry, I didn’t catch that. Say a number from 1 to 5.', sources: [] };
          speech = spokenText(next);
        } else {
          const answers = { ...state.answers, [MOOD_QUESTIONS[state.step].id]: score };
          if (state.step + 1 < MOOD_QUESTIONS.length) {
            mood.current = { step: state.step + 1, answers };
            speech = moodQuestionSpeech(state.step + 1);
            next = { kind: 'help', text: speech, sources: [] };
          } else {
            mood.current = null;
            next = moodReply(answers);
            speech = spokenText(next);
          }
        }
      } else {
        speech = spokenText(next);
        if (next.kind === 'mood_start') { mood.current = { step: 0, answers: {} }; speech = `${next.text} ${moodQuestionSpeech(0)}`; }
      }
      onExchange(text, next);
      setReply(next);
      if (!state && turn.action && !turn.action.navigate) actionRef.current(turn.action);
      setPhase('speaking');
      await speak(speech, playback.signal, { urgent: next.kind === 'urgent' || next.kind === 'crisis' });
      if (cancelled) return;
      if (next.kind === 'farewell') { onClose(); return; }
      if (!state && turn.action?.navigate && turn.action.navigate !== '/assistant') {
        actionRef.current(turn.action);
        return;
      }
      segmenter.reset();
      busy.current = false;
      setPhase('listening');
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('NO_MIC');
        // Ask for the microphone and load the on-device model at the same time.
        await Promise.all([
          navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }).then((mic) => {
            if (cancelled || startupFailed) mic.getTracks().forEach((track) => track.stop());
            else stream = mic;
          }),
          speechToText.prepare((p) => !cancelled && setProgress(p)),
        ]);
        if (cancelled || !stream) return;
        audio = new AudioContext();
        await audio.resume();
        if (cancelled) return;
        const source = audio.createMediaStreamSource(stream);
        const processor = audio.createScriptProcessor(2048, 1, 1);
        const segmenter = new SpeechSegmenter(audio.sampleRate);
        const rate = audio.sampleRate;

        // Real-time AudioWorklet Vocal Barge-in: instant zero-click interruption of assistant speech
        try {
          vocalDetector = await createVocalDetector(audio, source, () => {
            // Only interrupt real speech; emergency steps ignore noise (a tap still stops them).
            if (busy.current && isSpeaking() && triggerBargeIn()) {
              busy.current = false;
              segmenter.reset();
              setPhase('hearing');
            }
          });
        } catch (detectorErr) {
          console.warn('[VoiceMode] Vocal barge-in detector failed to initialize:', detectorErr);
        }

        let lastSpeculativeMs = 0;
        let speculativePending = false;

        processor.onaudioprocess = (event) => {
          if (cancelled) return;
          if (busy.current) return;

          const data = new Float32Array(event.inputBuffer.getChannelData(0));
          const result = segmenter.push(data);

          // Pre-load the page a command is heading to while the person is still talking.
          // Only a hint: actions always come from the full, final transcript.
          if (segmenter.isSpeaking && !speculativePending) {
            const duration = segmenter.currentSpeechDurationMs;
            if (duration >= 700 && duration - lastSpeculativeMs >= 1200) {
              const snapshot = segmenter.getSnapshotAudio(600);
              if (snapshot) {
                lastSpeculativeMs = duration;
                speculativePending = true;
                speechToText.transcribeSpeculative(resampleTo16k(snapshot, rate)).then((partialText) => {
                  if (partialText && partialText.length > 3) speculateIntent(partialText, window.location.pathname);
                }).catch(() => undefined).finally(() => { speculativePending = false; });
              }
            }
          }

          if (!result) return;
          if (result.type === 'speech_start') {
            lastSpeculativeMs = 0;
            setPhase('hearing');
          } else if (result.type === 'discarded') {
            setPhase('listening');
          } else {
            busy.current = true;
            setPhase('thinking');
            speechToText.transcribe(resampleTo16k(result.audio, rate)).then((text) => {
              if (cancelled) return;
              if (!text || NOISE.test(text)) {
                segmenter.reset();
                busy.current = false;
                setPhase('listening');
                return;
              }
              setHeard(text);
              return answer(text, segmenter);
            }).catch(() => {
              if (cancelled) return;
              segmenter.reset();
              busy.current = false;
              setPhase('listening');
            });
          }
        };
        source.connect(processor);
        processor.connect(audio.destination);
        const first = ctxRef.current.crewName.split(' ')[0];
        const hello = `Hi ${first}, I'm listening.`;
        setReply({ kind: 'help', text: hello, sources: [] });
        setPhase('speaking');
        await speak(hello, playback.signal);
        if (cancelled) return;
        segmenter.reset();
        busy.current = false;
        setPhase('listening');
      } catch (err) {
        if (cancelled) return;
        startupFailed = true;
        (stream as MediaStream | null)?.getTracks().forEach((track) => track.stop());
        const name = (err as { name?: string }).name ?? '';
        setError(name === 'NotAllowedError' || name === 'SecurityError'
          ? 'The microphone is blocked for Sol Check. Allow the microphone in your browser’s site settings (or the app’s settings on a phone), then open voice again.'
          : (err as Error).message === 'NO_MIC'
            ? 'No microphone is available here. Phones and browsers only allow the microphone on https:// addresses or in the Sol Check app.'
            : `The on-device speech model could not start (${(err as Error).message}). You can still type your question.`);
        setPhase('error');
      }
    })();

    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      playback.abort();
      vocalDetector?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      void audio?.close().catch(() => undefined);
      setVoiceModeOpen(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="voice-mode" role="dialog" aria-modal="true" aria-label="Voice conversation with Sol">
      <button type="button" className="voice-close" aria-label="End voice conversation" onClick={() => onClose()}><X size={22} aria-hidden="true" /></button>

      <button type="button" className={`voice-orb-stage phase-${phase}`} disabled={phase !== 'speaking'} aria-label="Interrupt Sol" onClick={stopSpeaking}>
        <SolBubble speaking={phase === 'speaking'} />
      </button>

      <p className="voice-status" aria-live="polite">
        {phase === 'loading' && progress > 0 && progress < 1
          ? `Downloading the on-device voice model… ${Math.round(progress * 100)}% (one time, then it works offline)`
          : PHASE_TEXT[phase]}
      </p>

      <div className="voice-transcript" aria-live="polite">
        {phase === 'error' ? <p className="voice-error">{error}</p> : (
          <>
            {heard && <p className="voice-you"><span>You</span> {heard}</p>}
            {reply && (reply.steps?.length
              ? <ReplySteps reply={reply} className="voice-sol" />
              : <p className="voice-sol"><span>Sol</span> {reply.text}</p>)}
            {reply && reply.sources.length > 0 && <p className="voice-sources">From: {reply.sources.map((s) => s.label).join(' · ')}</p>}
          </>
        )}
      </div>

      <div className="voice-controls">
        <button type="button" className="button button-secondary" onClick={() => onClose(true)}><Keyboard size={18} aria-hidden="true" /> Type instead</button>
        <span className="voice-privacy"><Mic size={14} aria-hidden="true" /> Your voice is turned into text on this device. Say “goodbye” to end the call.</span>
      </div>
    </div>
  );
}
