/**
 * Foreground "Hey Sol" listener. Everything stays on the device:
 *  - 'wake'   : phrases are transcribed and checked for "Hey Sol" (or a clear
 *               emergency call such as "fire!" or "he's not breathing");
 *  - 'active' : every phrase is a question, until a long silence;
 *  - 'paused' : while Sol speaks, so it never hears itself.
 * The microphone keeps recording while a phrase is being transcribed, and phrases
 * are handled in order, so "Hey Sol … I cut my hand" is never cut in half.
 * It releases the microphone when full-screen voice mode opens or the tab is hidden.
 */
import { speechToText } from './speechToText';
import { SpeechSegmenter, resampleTo16k, rms } from './voiceAudio';
import { enableVoiceAudio, isSpeaking, triggerBargeIn } from './voiceOutput';
import { createVocalDetector, type VocalDetectorNode } from './bargeInWorklet';
import { speculateIntent, type SpeculativeIntent } from './dialogue';
import { isEmergencyCall } from './emergency';

const KEY = 'sol-check:hey-sol';
const preferenceSubscribers = new Set<() => void>();
let wanted = true;
try { wanted = localStorage.getItem(KEY) !== 'off'; } catch { /* session only */ }

export const heySolWanted = () => wanted;
export function setHeySolWanted(on: boolean) {
  wanted = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* session only */ }
  preferenceSubscribers.forEach((fn) => fn());
}
export function onHeySolChange(fn: () => void) {
  preferenceSubscribers.add(fn);
  return () => { preferenceSubscribers.delete(fn); };
}

// Whisper can treat Sol as a name or place, or join a fast greeting into one word.
const WAKE = /^\W*(?:(?:um+|uh+|okay|ok|so|oh)\W+){0,2}(?:(?:hey|hay|hi|a|okay|ok|hello|yo|heya)[\s,.:!?–—-]+(?:there[\s,]+)?(?:sol|soul|saul|seoul|sole|sal|solle|sorl|sell)|hey(?:sol|soul|saul|seoul)|taysol)\b[\s,.:!?–—-]*([\s\S]*)$/i;

// A phonetic second pass for everything the strict pattern misses. Whisper-tiny
// hears a quick "Hey Sol" in many ways ("yo sol", "heya sole", "ey saul"), so we
// accept a greeting followed by a word that *sounds* like "Sol" — while still
// rejecting look-alikes like "Hey Solar" or "Hey, solve this".
const GREET = new Set(['hey', 'hay', 'heya', 'hiya', 'hi', 'hello', 'hullo', 'hallo', 'ay', 'ey', 'yo', 'a', 'ok', 'okay']);
const FILLER = new Set(['um', 'umm', 'uh', 'uhm', 'uhh', 'erm', 'er', 'well', 'so', 'okay', 'ok', 'hmm', 'mm']);
const GLUED = ['hey', 'hay', 'ha', 'ay', 'a', 'ok', 'okay', 'yo', 'tay', 'he'];

const edges = /^[\W_]+|[\W_]+$/g;
const bare = (word: string) => word.replace(edges, '').toLowerCase();
/** Consonant skeleton: sol/soul/saul/seoul → "sl"; solar → "slr"; so → "s". */
const skeleton = (word: string) => word.replace(/[aeiou]/g, '').replace(/[^a-z]/g, '');
/** True for a token that sounds like "Sol": s + vowels + l, nothing after. */
const soundsLikeSol = (word: string) =>
  (/^[sz][aeiouwy]+l{1,2}[aeiouy]?$/.test(word) && skeleton(word.replace(/[wy]/g, '').replace(/^z/, 's').replace(/ll/, 'l')) === 'sl')
  && !/^(?:sally|sully|silly|selly|sallie)$/.test(word)
  || word === 'seoul' || word === 'zol' || word === 'sul' || word === 'saul';

const restFrom = (words: string[], from: number) => words.slice(from).join(' ').replace(/^[\s\W_]+/, '').trim();

function fuzzyWake(text: string): { woke: boolean; rest: string } {
  const raw = text.trim().split(/\s+/).filter(Boolean);
  const words = raw.map(bare);
  // The greeting must open the phrase: allow only one throwaway filler before it.
  for (let g = 0; g <= 1 && g < words.length; g += 1) {
    if (g === 1 && !FILLER.has(words[0])) break;
    const head = words[g];
    if (!head) continue;
    if (GREET.has(head) && soundsLikeSol(words[g + 1] ?? '')) return { woke: true, rest: restFrom(raw, g + 2) };
    for (const pre of GLUED) {
      if (head.length > pre.length && head.startsWith(pre) && soundsLikeSol(head.slice(pre.length))) {
        return { woke: true, rest: restFrom(raw, g + 1) };
      }
    }
  }
  return { woke: false, rest: '' };
}

export function matchWake(text: string): { woke: boolean; rest: string } {
  const m = text.trim().match(WAKE);
  if (m) return { woke: true, rest: m[1].trim() };
  return fuzzyWake(text);
}

/** Lets full-screen voice mode borrow the microphone from the listener. */
type Listener = (open: boolean) => void;
const voiceModeSubscribers = new Set<Listener>();
let voiceModeOpen = false;
export function setVoiceModeOpen(open: boolean) { voiceModeOpen = open; voiceModeSubscribers.forEach((fn) => fn(open)); }
export function onVoiceModeChange(fn: Listener) { voiceModeSubscribers.add(fn); return () => { voiceModeSubscribers.delete(fn); }; }
export const isVoiceModeOpen = () => voiceModeOpen;

export type ListenerMode = 'wake' | 'active' | 'paused';

export interface ListenerHandlers {
  onWake: (rest: string) => void;
  onUtterance: (text: string) => void;
  onSpeculativeIntent?: (intent: SpeculativeIntent) => void;
  onBargeIn?: () => void;
  onSpeechStart?: () => void;
  onBusy?: (busy: boolean) => void;
  onLevel?: (level: number) => void;
  onAudioReady: (ready: boolean) => void;
  onError: (message: string) => void;
}

const NOISE = /^\s*(\[.*\]|\(.*\)|you|thank you\.?|thanks for watching\.?|\.|,)?\s*$/i;

// Give Whisper/Moonshine a slower second pass when a short utterance missed the wake phrase.
const WAKE_RETRY_MAX_MS = 5000;
const WAKE_RETRY_RATE = 0.8;

export class SolListener {
  private currentMode: ListenerMode = 'wake';
  private modeRevision = 0;
  private segmenter: SpeechSegmenter | null = null;
  private vocalDetector: VocalDetectorNode | null = null;
  private stream: MediaStream | null = null;
  private audio: AudioContext | null = null;
  private queue: Promise<void> = Promise.resolve();
  private pendingPhrases = 0;
  private hasFrames = false;
  private handlers: ListenerHandlers;
  private stopped = true;
  private resumeTimer: ReturnType<typeof setInterval> | undefined;

  constructor(handlers: ListenerHandlers) { this.handlers = handlers; }

  get running() { return !this.stopped; }
  get ready() { return this.audio?.state === 'running' && this.hasFrames; }
  enableAudio() {
    if (this.audio && this.audio.state !== 'running') void this.audio.resume().catch(() => undefined);
    if (this.stream?.active) enableVoiceAudio();
  }
  get mode() { return this.currentMode; }
  set mode(mode: ListenerMode) {
    if (mode === this.currentMode) return;
    this.currentMode = mode;
    this.modeRevision += 1;
    this.segmenter?.reset();
  }

  async start(onModelProgress?: (fraction: number) => void) {
    if (!this.stopped) return;
    this.stopped = false;
    let audio: AudioContext | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('NO_MIC');
      audio = new AudioContext();
      this.audio = audio;
      this.enableAudio();
      const session = audio;
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (this.audio !== session) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = mic;
      // An active, permitted microphone can unlock Web Audio without a page gesture.
      this.enableAudio();
      await speechToText.prepare((progress) => { if (this.audio === session) onModelProgress?.(progress); });
      if (this.audio !== session) return;
      const source = session.createMediaStreamSource(mic);
      const processor = session.createScriptProcessor(2048, 1, 1);
      const muted = session.createGain();
      muted.gain.value = 0;
      const rate = session.sampleRate;
      const segmenter = new SpeechSegmenter(rate);
      this.segmenter = segmenter;

      // Real-time AudioWorklet Vocal Barge-in: cuts assistant speech on human voice frequencies (> 85Hz)
      try {
        this.vocalDetector = await createVocalDetector(session, source, () => {
          // Emergency steps are not interruptible by sound (alarms, fans): only a tap stops them.
          if (isSpeaking() && triggerBargeIn()) {
            this.handlers.onBargeIn?.();
            if (this.currentMode === 'paused') {
              this.currentMode = 'active';
              this.modeRevision += 1;
              this.segmenter?.reset();
              this.handlers.onSpeechStart?.();
            }
          }
        });
      } catch (detectorErr) {
        console.warn('[SolListener] Vocal barge-in detector failed to initialize:', detectorErr);
      }

      session.onstatechange = () => {
        if (this.audio !== session || session.state === 'running') return;
        this.hasFrames = false;
        segmenter.reset();
        this.handlers.onAudioReady(false);
        // The browser suspended us (tab blur, phone lock, autoplay policy). Keep
        // trying to come back so "Hey Sol" stays hands-free without a tap.
        void session.resume().catch(() => undefined);
      };
      this.stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (this.audio !== session) return;
        this.stop();
        this.handlers.onError('The microphone disconnected. Select Retry microphone to reconnect.');
      });

      let lastSpeculativeMs = 0;
      let speculativePending = false;

      /** Transcribe finished phrases one at a time, in the order they were spoken. */
      const handlePhrase = async (audio: Float32Array, durationMs: number, revision: number) => {
        const current = () => this.audio === session && revision === this.modeRevision && this.currentMode !== 'paused' && !isSpeaking();
        if (!current()) return;
        const text = await speechToText.transcribe(resampleTo16k(audio, rate));
        if (!current()) return;
        if (this.currentMode === 'wake') {
          let wake = matchWake(text);
          // A clear emergency ("fire!", "he's not breathing") needs no wake phrase.
          if (!wake.woke && isEmergencyCall(text)) wake = { woke: true, rest: text };
          if (!wake.woke && !NOISE.test(text) && durationMs <= WAKE_RETRY_MAX_MS && text.split(/\s+/).length <= 6) {
            // A quick "Hey Sol" is often misheard: try again with the audio slowed down.
            const slower = await speechToText.transcribe(resampleTo16k(audio, rate * WAKE_RETRY_RATE));
            if (!current()) return;
            wake = matchWake(slower);
          }
          if (!wake.woke) return;
          // Switch to listening without resetting the recorder, so whatever is said
          // right after "Hey Sol" is kept and answered.
          this.currentMode = 'active';
          this.handlers.onWake(wake.rest);
        } else if (this.currentMode === 'active' && !NOISE.test(text)) {
          this.handlers.onUtterance(text);
        }
      };
      const enqueue = (audio: Float32Array, durationMs: number) => {
        const revision = this.modeRevision;
        this.pendingPhrases += 1;
        this.handlers.onBusy?.(true);
        this.queue = this.queue
          .then(() => handlePhrase(audio, durationMs, revision))
          .catch(() => {
            if (this.audio !== session) return;
            this.stop();
            this.handlers.onError('The offline speech model stopped. Select Retry microphone to restart it.');
          })
          .finally(() => {
            if (this.audio !== session) return;
            this.pendingPhrases -= 1;
            if (this.pendingPhrases === 0) this.handlers.onBusy?.(false);
          });
      };

      processor.onaudioprocess = (event) => {
        if (this.audio !== session) return;
        if (!this.hasFrames) {
          this.hasFrames = true;
          this.handlers.onAudioReady(true);
        }
        // Never transcribe Sol's own voice. Real interruptions come from the vocal detector.
        if (this.mode === 'paused' || isSpeaking()) return;
        const data = new Float32Array(event.inputBuffer.getChannelData(0));
        this.handlers.onLevel?.(rms(data));
        const result = segmenter.push(data, this.mode === 'wake');

        // Pre-load the page a command is heading to while the person is still talking.
        // Only a hint: the action itself always comes from the full, final transcript.
        if (this.mode === 'active' && segmenter.isSpeaking && !speculativePending && this.pendingPhrases === 0) {
          const duration = segmenter.currentSpeechDurationMs;
          if (duration >= 700 && duration - lastSpeculativeMs >= 1200) {
            const snapshot = segmenter.getSnapshotAudio(600);
            if (snapshot) {
              lastSpeculativeMs = duration;
              speculativePending = true;
              speechToText.transcribeSpeculative(resampleTo16k(snapshot, rate)).then((partialText) => {
                if (partialText && partialText.length > 3) {
                  const intent = speculateIntent(partialText, window.location.pathname);
                  if (intent.isActionable) this.handlers.onSpeculativeIntent?.(intent);
                }
              }).catch(() => undefined).finally(() => { speculativePending = false; });
            }
          }
        }

        if (!result) return;
        if (result.type === 'speech_start') {
          lastSpeculativeMs = 0;
          this.handlers.onSpeechStart?.();
          return;
        }
        if (result.type === 'discarded') {
          if (this.pendingPhrases === 0) this.handlers.onBusy?.(false);
          return;
        }
        enqueue(result.audio, result.durationMs);
      };
      source.connect(processor);
      processor.connect(muted);
      muted.connect(session.destination);
      if (!this.hasFrames) this.handlers.onAudioReady(false);
      // A freshly loaded AudioContext starts suspended under the browser's
      // autoplay policy, so the one resume() above can silently no-op after a
      // hard refresh. A live, permitted microphone lets most browsers resume
      // without a tap — poll until it actually starts (and recover if it is
      // suspended again), so the mic opens by itself. iOS Safari still needs
      // one real gesture; the dock's "resume" prompt covers that case.
      clearInterval(this.resumeTimer);
      this.resumeTimer = setInterval(() => {
        if (this.audio !== session) { clearInterval(this.resumeTimer); return; }
        if (session.state !== 'running') { this.enableAudio(); void session.resume().catch(() => undefined); }
      }, 500);
    } catch (error) {
      if (audio && this.audio !== audio) return;
      this.stop();
      const name = (error as { name?: string }).name ?? '';
      this.handlers.onError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Microphone is blocked. Allow it in the browser’s site settings (or the app settings on a phone).'
        : error instanceof Error && error.message === 'NO_MIC'
          ? 'Microphone access needs HTTPS, localhost, or the Sol Check phone app.'
          : 'The offline speech model or microphone could not start. Select Retry microphone to try again.');
    }
  }

  stop() {
    this.stopped = true;
    clearInterval(this.resumeTimer);
    this.resumeTimer = undefined;
    this.vocalDetector?.disconnect();
    this.vocalDetector = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.audio?.close().catch(() => undefined);
    this.audio = null;
    this.hasFrames = false;
    this.segmenter = null;
    this.queue = Promise.resolve();
    this.pendingPhrases = 0;
  }
}
