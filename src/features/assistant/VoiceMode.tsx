import { Keyboard, Mic, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MoodMcqAnswers } from '../checkin/moodAssessment';
import type { KnowledgeIndex } from './knowledge';
import { MOOD_QUESTIONS, moodQuestionSpeech, moodReply, parseMoodAnswer } from './mood';
import { respond, type AssistantContext, type AssistantReply } from './respond';
import { speechToText } from './speechToText';
import { SpeechSegmenter, resampleTo16k, rms } from './voiceAudio';
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
const NOISE = /^\s*(\[.*\]|\(.*\)|you|thank you\.?|thanks for watching\.?|\.|,)?\s*$/i;
const CLOSE = /^\s*(stop|goodbye|bye|close|exit|end (the )?(call|conversation))\b/i;

export function VoiceMode({ ctx, index, onExchange, onClose }: {
  ctx: AssistantContext;
  index: KnowledgeIndex;
  onExchange: (question: string, reply: AssistantReply) => void;
  onClose: (typeInstead?: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [progress, setProgress] = useState(0);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [error, setError] = useState('');
  const orbRef = useRef<HTMLDivElement>(null);
  const busy = useRef(true);
  const mood = useRef<{ step: number; answers: MoodMcqAnswers } | null>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let audio: AudioContext | null = null;
    let frame = 0;
    let level = 0;

    const speak = (text: string) => new Promise<void>((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth) { window.setTimeout(resolve, Math.min(8000, 400 + text.length * 45)); return; }
      synth.cancel();
      let done = false;
      const finish = () => { if (!done) { done = true; window.clearTimeout(timer); resolve(); } };
      // Some browsers never fire "end" (or have no voices): never get stuck in "Speaking".
      const timer = window.setTimeout(finish, 2500 + text.length * 75);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.onend = finish;
      utterance.onerror = finish;
      synth.speak(utterance);
    });

    const answer = async (text: string, segmenter: SpeechSegmenter) => {
      let next: AssistantReply;
      let speech: string;
      const state = mood.current;
      if (CLOSE.test(text)) { onClose(); return; }
      if (state) {
        const score = parseMoodAnswer(text, state.step);
        if (score === null) {
          next = { kind: 'help', text: 'Sorry, I didn’t catch that. Say a number from 1 to 5.', sources: [] };
          speech = next.text;
        } else {
          const answers = { ...state.answers, [MOOD_QUESTIONS[state.step].id]: score };
          if (state.step + 1 < MOOD_QUESTIONS.length) {
            mood.current = { step: state.step + 1, answers };
            speech = moodQuestionSpeech(state.step + 1);
            next = { kind: 'help', text: speech, sources: [] };
          } else {
            mood.current = null;
            next = moodReply(answers);
            speech = next.text;
          }
        }
      } else {
        next = respond(text, ctxRef.current, index);
        speech = next.text;
        if (next.kind === 'mood_start') { mood.current = { step: 0, answers: {} }; speech = `${next.text} ${moodQuestionSpeech(0)}`; }
      }
      onExchange(text, next);
      setReply(next);
      setPhase('speaking');
      await speak(speech);
      if (cancelled) return;
      segmenter.reset();
      busy.current = false;
      setPhase('listening');
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('NO_MIC');
        // Ask for the microphone and load the on-device model at the same time.
        const [mic] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }),
          speechToText.load((p) => !cancelled && setProgress(p)),
        ]);
        if (cancelled) { mic.getTracks().forEach((t) => t.stop()); return; }
        stream = mic;
        audio = new AudioContext();
        await audio.resume();
        const source = audio.createMediaStreamSource(mic);
        const processor = audio.createScriptProcessor(2048, 1, 1);
        const segmenter = new SpeechSegmenter(audio.sampleRate);
        const rate = audio.sampleRate;
        processor.onaudioprocess = (event) => {
          const data = new Float32Array(event.inputBuffer.getChannelData(0));
          level = rms(data);
          if (busy.current) return;
          const result = segmenter.push(data);
          if (!result) return;
          if (result.type === 'speech_start') setPhase('hearing');
          else if (result.type === 'discarded') setPhase('listening');
          else {
            busy.current = true;
            setPhase('thinking');
            speechToText.transcribe(resampleTo16k(result.audio, rate)).then((text) => {
              if (cancelled) return;
              if (!text || NOISE.test(text)) { segmenter.reset(); busy.current = false; setPhase('listening'); return; }
              setHeard(text);
              void answer(text, segmenter);
            }).catch(() => { segmenter.reset(); busy.current = false; setPhase('listening'); });
          }
        };
        source.connect(processor);
        processor.connect(audio.destination);
        const animate = () => {
          orbRef.current?.style.setProperty('--level', Math.min(1, level * 12).toFixed(3));
          frame = requestAnimationFrame(animate);
        };
        animate();
        const first = ctxRef.current.crewName.split(' ')[0];
        const hello = `Hi ${first}, I'm listening. Ask me about your health, your check-in, or the mission.`;
        setReply({ kind: 'help', text: hello, sources: [] });
        setPhase('speaking');
        await speak(hello);
        if (cancelled) return;
        segmenter.reset();
        busy.current = false;
        setPhase('listening');
      } catch (err) {
        if (cancelled) return;
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
      cancelAnimationFrame(frame);
      window.speechSynthesis?.cancel();
      stream?.getTracks().forEach((track) => track.stop());
      void audio?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="voice-mode" role="dialog" aria-modal="true" aria-label="Voice conversation with Sol">
      <button type="button" className="voice-close" aria-label="End voice conversation" onClick={() => onClose()}><X size={22} aria-hidden="true" /></button>

      <div className={`voice-orb-stage phase-${phase}`}>
        <div className="voice-orb" ref={orbRef} aria-hidden="true">
          <div className="voice-orb-surface" />
          <div className="voice-orb-shade" />
        </div>
        <div className="voice-orb-ring" aria-hidden="true" />
      </div>

      <p className="voice-status" aria-live="polite">
        {phase === 'loading' && progress > 0 && progress < 1
          ? `Downloading the on-device voice model… ${Math.round(progress * 100)}% (one time, then it works offline)`
          : PHASE_TEXT[phase]}
      </p>

      <div className="voice-transcript" aria-live="polite">
        {phase === 'error' ? <p className="voice-error">{error}</p> : (
          <>
            {heard && <p className="voice-you"><span>You</span> {heard}</p>}
            {reply && <p className="voice-sol"><span>Sol</span> {reply.text}</p>}
            {reply && reply.sources.length > 0 && <p className="voice-sources">From: {reply.sources.map((s) => s.label).join(' · ')}</p>}
          </>
        )}
      </div>

      <div className="voice-controls">
        <button type="button" className="button button-secondary" onClick={() => onClose(true)}><Keyboard size={18} aria-hidden="true" /> Type instead</button>
        <span className="voice-privacy"><Mic size={14} aria-hidden="true" /> Your voice is turned into text on this device. Say “stop” to finish.</span>
      </div>
    </div>
  );
}
