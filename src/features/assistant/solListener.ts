/**
 * Foreground "Hey Sol" listener. Everything stays on the device:
 *  - 'wake'   : short phrases are transcribed and checked for "Hey Sol";
 *  - 'active' : every phrase is a question, until a long silence;
 *  - 'paused' : while Sol speaks, so it never hears itself.
 * It releases the microphone when full-screen voice mode opens or the tab is hidden.
 */
import { speechToText } from './speechToText';
import { SpeechSegmenter, resampleTo16k, rms } from './voiceAudio';
import { enableVoiceAudio, isSpeaking } from './voiceOutput';

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
const WAKE = /^\W*(?:(?:um+|uh+|okay|ok|so)\W+)?(?:(?:hey|hay|hi|a|okay|ok|hello)[\s,.:!?–—-]+(?:sol|soul|saul|seoul|sole|sal|solle|sorl)|hey(?:sol|soul|saul|seoul)|taysol)\b[\s,.:!?–—-]*([\s\S]*)$/i;

export function matchWake(text: string): { woke: boolean; rest: string } {
  const m = text.trim().match(WAKE);
  return m ? { woke: true, rest: m[1].trim() } : { woke: false, rest: '' };
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
  onSpeechStart?: () => void;
  onBusy?: (busy: boolean) => void;
  onLevel?: (level: number) => void;
  onAudioReady: (ready: boolean) => void;
  onError: (message: string) => void;
}

const NOISE = /^\s*(\[.*\]|\(.*\)|you|thank you\.?|thanks for watching\.?|\.|,)?\s*$/i;

// Give Whisper a slower second pass when a short utterance missed the wake phrase.
const WAKE_RETRY_MAX_MS = 5000;
const WAKE_RETRY_RATE = 0.8;

export class SolListener {
  private currentMode: ListenerMode = 'wake';
  private modeRevision = 0;
  private segmenter: SpeechSegmenter | null = null;
  private stream: MediaStream | null = null;
  private audio: AudioContext | null = null;
  private transcribing = false;
  private hasFrames = false;
  private handlers: ListenerHandlers;
  private stopped = true;

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
      await speechToText.load((progress) => { if (this.audio === session) onModelProgress?.(progress); });
      if (this.audio !== session) return;
      const source = session.createMediaStreamSource(mic);
      const processor = session.createScriptProcessor(2048, 1, 1);
      const muted = session.createGain();
      muted.gain.value = 0;
      const rate = session.sampleRate;
      const segmenter = new SpeechSegmenter(rate);
      this.segmenter = segmenter;
      session.onstatechange = () => {
        if (this.audio !== session || session.state === 'running') return;
        this.hasFrames = false;
        segmenter.reset();
        this.handlers.onAudioReady(false);
      };
      this.stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (this.audio !== session) return;
        this.stop();
        this.handlers.onError('The microphone disconnected. Select Retry microphone to reconnect.');
      });
      processor.onaudioprocess = (event) => {
        if (this.audio !== session) return;
        if (!this.hasFrames) {
          this.hasFrames = true;
          this.handlers.onAudioReady(true);
        }
        if (this.mode === 'paused' || this.transcribing) return;
        if (isSpeaking()) { segmenter.reset(); return; }
        const data = new Float32Array(event.inputBuffer.getChannelData(0));
        this.handlers.onLevel?.(rms(data));
        const result = segmenter.push(data, this.mode === 'wake');
        if (!result) return;
        if (result.type === 'speech_start') { this.handlers.onSpeechStart?.(); return; }
        if (result.type === 'discarded') { this.handlers.onBusy?.(false); return; }
        const revision = this.modeRevision;
        this.transcribing = true;
        this.handlers.onBusy?.(true);
        const stillListening = () => this.audio === session && revision === this.modeRevision && !isSpeaking();
        speechToText.transcribe(resampleTo16k(result.audio, rate)).then(async (text) => {
          if (!stillListening()) return;
          if (this.mode === 'wake') {
            let wake = matchWake(text);
            if (!wake.woke && !NOISE.test(text) && result.durationMs <= WAKE_RETRY_MAX_MS) {
              const slower = await speechToText.transcribe(resampleTo16k(result.audio, rate * WAKE_RETRY_RATE));
              wake = matchWake(slower);
            }
            if (wake.woke && stillListening()) this.handlers.onWake(wake.rest);
          } else if (this.mode === 'active' && !NOISE.test(text)) {
            this.handlers.onUtterance(text);
          }
        }).catch(() => {
          if (!stillListening()) return;
          this.stop();
          this.handlers.onError('The offline speech model stopped. Select Retry microphone to restart it.');
        }).finally(() => {
          if (this.audio !== session) return;
          this.transcribing = false;
          this.handlers.onBusy?.(false);
          segmenter.reset();
        });
      };
      source.connect(processor);
      processor.connect(muted);
      muted.connect(session.destination);
      if (!this.hasFrames) this.handlers.onAudioReady(false);
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
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.audio?.close().catch(() => undefined);
    this.audio = null;
    this.hasFrames = false;
    this.segmenter = null;
    this.transcribing = false;
  }
}
