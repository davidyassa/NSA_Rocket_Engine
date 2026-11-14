import { describe, expect, it } from 'vitest';
import { SpeechSegmenter, resampleTo16k, type SegmenterEvent } from './voiceAudio';

const RATE = 48_000;
const FRAME = 1024;
function frames(seconds: number, amplitude: number, freq = 220): Float32Array[] {
  const out: Float32Array[] = [];
  const total = Math.floor((seconds * RATE) / FRAME);
  for (let f = 0; f < total; f += 1) {
    const frame = new Float32Array(FRAME);
    for (let i = 0; i < FRAME; i += 1) {
      const t = (f * FRAME + i) / RATE;
      frame[i] = amplitude * Math.sin(2 * Math.PI * freq * t) + 0.002 * Math.sin(2 * Math.PI * 3000 * t);
    }
    out.push(frame);
  }
  return out;
}
function run(seg: SpeechSegmenter, input: Float32Array[], forWakePhrase = false): SegmenterEvent[] {
  return input.map((f) => seg.push(f, forWakePhrase)).filter((e): e is SegmenterEvent => e !== null);
}

describe('hands-free voice detection', () => {
  it('resamples 48 kHz to 16 kHz', () => {
    expect(resampleTo16k(new Float32Array(48_000), 48_000).length).toBe(16_000);
  });

  it('keeps speech-band tones and filters hiss above 8 kHz when downsampling', () => {
    const tone = (freq: number) => Float32Array.from({ length: 48_000 }, (_, i) => Math.sin(2 * Math.PI * freq * i / 48_000));
    const level = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
    expect(level(resampleTo16k(tone(300), 48_000))).toBeGreaterThan(0.68);
    expect(level(resampleTo16k(tone(15_000), 48_000))).toBeLessThan(0.2);
  });

  it('ignores room noise, then captures one spoken phrase after a short pause', () => {
    const seg = new SpeechSegmenter(RATE);
    const events = run(seg, [...frames(1, 0.003), ...frames(1.5, 0.2), ...frames(1.2, 0.003)]);
    expect(events.map((e) => e.type)).toEqual(['speech_start', 'speech_end']);
    const end = events[1] as Extract<SegmenterEvent, { type: 'speech_end' }>;
    expect(end.durationMs).toBeGreaterThan(1300);
    expect(end.audio.length / RATE).toBeGreaterThan(1.5); // speech + pre-roll + trailing pause
    expect(end.audio.length / RATE - end.durationMs / 1000).toBeCloseTo(0.36, 1);
  });

  it('discards a short click or cough', () => {
    const seg = new SpeechSegmenter(RATE);
    const events = run(seg, [...frames(1, 0.003), ...frames(0.15, 0.3), ...frames(1.2, 0.003)]);
    expect(events.map((e) => e.type)).toEqual(['speech_start', 'discarded']);
  });

  it('captures a wake phrase with two short syllables', () => {
    const syllables = [...frames(0.11, 0.2), ...frames(0.065, 0.003), ...frames(0.11, 0.2), ...frames(1.2, 0.003)];
    expect(run(new SpeechSegmenter(RATE), syllables, true).map((event) => event.type)).toEqual(['speech_start', 'speech_end']);
    expect(run(new SpeechSegmenter(RATE), syllables)).toEqual([]);
  });

  it('adapts to a noisier room instead of treating the noise as speech', () => {
    const seg = new SpeechSegmenter(RATE);
    expect(run(seg, frames(3, 0.01))).toEqual([]);
  });

  it('provides Aegis-Zero mid-speech snapshots for speculative streaming', () => {
    const seg = new SpeechSegmenter(RATE);
    // 0.5s room noise followed by 0.6s speech
    for (const f of frames(0.5, 0.003)) seg.push(f);
    expect(seg.isSpeaking).toBe(false);
    expect(seg.getSnapshotAudio(200)).toBeNull();

    for (const f of frames(0.6, 0.2)) seg.push(f);
    expect(seg.isSpeaking).toBe(true);
    expect(seg.currentSpeechDurationMs).toBeGreaterThan(500);

    const snapshot = seg.getSnapshotAudio(200);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.length).toBeGreaterThan(0.5 * RATE);
  });
});
