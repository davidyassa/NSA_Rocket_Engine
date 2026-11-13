/**
 * Hands-free voice helpers (pure, unit-tested).
 *  - resampleTo16k: the speech model expects 16 kHz mono audio.
 *  - SpeechSegmenter: a small voice-activity detector. It learns the room's noise
 *    level, starts a segment when speech is clearly louder, and closes it after a
 *    short pause, so the person never has to press "send".
 */

export const MODEL_SAMPLE_RATE = 16_000;

export function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === MODEL_SAMPLE_RATE) return input;
  const ratio = inputRate / MODEL_SAMPLE_RATE;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const k = pos - j;
    out[i] = input[j] * (1 - k) + (input[j + 1] ?? input[j]) * k;
  }
  return out;
}

export function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i += 1) sum += frame[i] * frame[i];
  return Math.sqrt(sum / Math.max(1, frame.length));
}

export const VAD = {
  /** speech must be this many times louder than the learned noise floor */
  startRatio: 3,
  /** absolute minimum loudness that counts as speech */
  minLevel: 0.012,
  /** loud for this long → speech has started */
  startMs: 120,
  /** quiet for this long → the person has finished */
  endSilenceMs: 640,
  /** shorter segments are ignored (coughs, clicks) */
  minSpeechMs: 350,
  /** never record longer than this in one go */
  maxSpeechMs: 14_000,
  /** keep this much audio from just before speech started */
  preRollMs: 250,
} as const;

// A quick two-syllable wake phrase can finish before the normal speech gate.
const WAKE_START_MS = 80;
const WAKE_MIN_SPEECH_MS = 240;

export type SegmenterEvent = { type: 'speech_start' } | { type: 'speech_end'; audio: Float32Array; durationMs: number } | { type: 'discarded' };

/** Feed it consecutive frames at the capture sample rate; it emits speech segments. */
export class SpeechSegmenter {
  private floor = 0.004;
  private loudMs = 0;
  private quietMs = 0;
  private speaking = false;
  private chunks: Float32Array[] = [];
  private speechMs = 0;
  private preRoll: Float32Array[] = [];
  private preRollMs = 0;
  readonly sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  get level(): number { return this.floor; }

  reset() {
    this.loudMs = 0; this.quietMs = 0; this.speaking = false; this.chunks = []; this.speechMs = 0; this.preRoll = []; this.preRollMs = 0;
  }

  push(frame: Float32Array, forWakePhrase = false): SegmenterEvent | null {
    const ms = (frame.length / this.sampleRate) * 1000;
    const level = rms(frame);
    const threshold = Math.max(VAD.minLevel, this.floor * VAD.startRatio);
    const loud = level > threshold;

    if (!this.speaking) {
      // Learn the room noise slowly while nobody is speaking.
      if (!loud) this.floor = this.floor * 0.95 + level * 0.05;
      this.preRoll.push(frame); this.preRollMs += ms;
      while (this.preRollMs > VAD.preRollMs && this.preRoll.length > 1) { this.preRollMs -= (this.preRoll.shift()!.length / this.sampleRate) * 1000; }
      this.loudMs = loud ? this.loudMs + ms : 0;
      if (this.loudMs >= (forWakePhrase ? WAKE_START_MS : VAD.startMs)) {
        this.speaking = true; this.chunks = [...this.preRoll]; this.speechMs = this.preRollMs; this.quietMs = 0;
        return { type: 'speech_start' };
      }
      return null;
    }

    this.chunks.push(frame); this.speechMs += ms;
    this.quietMs = loud ? 0 : this.quietMs + ms;
    // Allow a little more pause inside multi-field dictation.
    const endSilence = this.speechMs - this.quietMs > 2200 ? 900 : VAD.endSilenceMs;
    if (this.quietMs >= endSilence || this.speechMs >= VAD.maxSpeechMs) {
      const durationMs = this.speechMs - this.quietMs;
      const total = this.chunks.reduce((n, c) => n + c.length, 0) - Math.round(Math.max(0, this.quietMs - 360) * this.sampleRate / 1000);
      const audio = new Float32Array(total);
      let offset = 0;
      for (const c of this.chunks) {
        if (offset >= total) break;
        audio.set(c.subarray(0, total - offset), offset);
        offset += c.length;
      }
      this.reset();
      const minimum = forWakePhrase ? WAKE_MIN_SPEECH_MS : VAD.minSpeechMs;
      return durationMs >= minimum ? { type: 'speech_end', audio, durationMs } : { type: 'discarded' };
    }
    return null;
  }
}
