import { describe, expect, it } from 'vitest';
import { assessSpectralHistory, finalHeartRate, PULSE_FINE_ALGORITHM, spectralHeartRate, type SpectralHistoryEntry } from './pulseSpectrum';
import type { BvpSample } from './breathingRate';

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) - 0.5;
}

/** Camera pulse wave at `bpm`, sampled at `fps` with frame-time jitter, drift and noise. */
function pulse(bpm: number, fps: number, seconds: number, { noise = 0.2, seed = 3 } = {}): BvpSample[] {
  const rand = rng(seed);
  const out: BvpSample[] = [];
  let t = 1000;
  while (t < 1000 + seconds * 1000) {
    const phase = (2 * Math.PI * bpm * t) / 60000;
    const v = Math.sin(phase) + 0.35 * Math.sin(2 * phase + 0.8) + 0.4 * Math.sin((2 * Math.PI * 0.25 * t) / 1000) + noise * rand() * 2;
    out.push({ t, v });
    t += 1000 / fps + 6 * rand();
  }
  return out;
}

describe('fine-resolution camera heart rate', () => {
  it.each([[82, 30], [82, 24], [67, 15], [118, 30]])('reads %i bpm at %i fps within 0.5 bpm', (bpm, fps) => {
    const result = spectralHeartRate(pulse(bpm, fps, 18));
    expect(result).not.toBeNull();
    expect(Math.abs(result!.bpm - bpm)).toBeLessThanOrEqual(0.5);
    expect(result!.snrDb).toBeGreaterThan(3);
  });

  it('does not round 82 down to a 4-bpm grid value', () => {
    expect(Math.round(spectralHeartRate(pulse(82, 30, 18))!.bpm)).toBe(82);
  });

  it('reports low quality for noise without a pulse', () => {
    const rand = rng(7);
    const noise = Array.from({ length: 400 }, (_, i) => ({ t: 1000 + i * 33.3, v: rand() }));
    expect(spectralHeartRate(noise)!.snrDb).toBeLessThan(3);
  });

  it('skips the 5 s start-up and then needs 7 s of settled signal', () => {
    expect(spectralHeartRate(pulse(82, 30, 11))).toBeNull();
    expect(spectralHeartRate(pulse(82, 30, 12.5))).not.toBeNull();
  });

  it('ignores a biased start-up stretch (as the camera model produces)', () => {
    const wave = pulse(82, 24, 17).map((s) => (s.t < 5000 ? { ...s, v: Math.sin((2 * Math.PI * 86 * s.t) / 60000) * 2 } : s));
    expect(Math.abs(spectralHeartRate(wave)!.bpm - 82)).toBeLessThanOrEqual(0.5);
  });
});

describe('early finish (fast path)', () => {
  const steady = (bpm: number, snrDb = 6): SpectralHistoryEntry[] =>
    Array.from({ length: 6 }, (_, i) => ({ bpm: bpm + (i % 2 ? 0.3 : -0.2), snrDb, seconds: 7.5 + i * 0.5 }));

  it('finishes when ~3 s of clean estimates agree with each other and with the camera model', () => {
    const result = assessSpectralHistory(steady(82), 80);
    expect(result).toMatchObject({ ready: true, bpm: 82 });
  });

  it('waits when the signal is noisy, unsteady, or disagrees with the camera model', () => {
    expect(assessSpectralHistory(steady(82, 1.5), 80).ready).toBe(false);
    expect(assessSpectralHistory([...steady(82).slice(0, 5), { bpm: 90, snrDb: 6, seconds: 13 }], 80).ready).toBe(false);
    expect(assessSpectralHistory(steady(82), 70).ready).toBe(false);
    expect(assessSpectralHistory(steady(82), null).ready).toBe(false);
  });

  it('stands alone without the camera model only when the signal is very clean', () => {
    expect(assessSpectralHistory(steady(82, 9.5), null)).toMatchObject({ ready: true, bpm: 82 });
    expect(assessSpectralHistory(steady(82, 8), null).ready).toBe(false);
    // A model reading that disagrees still blocks, however clean our signal is.
    expect(assessSpectralHistory(steady(82, 12), 70).ready).toBe(false);
    const drifting = Array.from({ length: 6 }, (_, i) => ({ bpm: 85 - i * 0.25, snrDb: 8, seconds: 8 + i * 0.5 }));
    expect(assessSpectralHistory(drifting, 84).ready).toBe(false);
  });
});

describe('final number shown', () => {
  const info = { sqi: 0.7, sampleCount: 6, capturedAt: new Date('2039-01-01T00:00:00Z') };
  const model = { bpm: 80, sqi: 0.7, capturedAtUtc: '2039-01-01T00:00:00.000Z', sampleCount: 6, algorithm: 'model' };
  const clean = Array.from({ length: 6 }, (_, i) => ({ bpm: 82 + (i % 2) * 0.3, snrDb: 6, seconds: 7.5 + i * 0.5 }));

  it('replaces the coarse model reading with the clean fine-resolution one', () => {
    expect(finalHeartRate(model, clean, info)).toMatchObject({ bpm: 82, algorithm: PULSE_FINE_ALGORITHM });
  });

  it('keeps the model reading when the fine estimate is noisy or disagrees', () => {
    expect(finalHeartRate(model, clean.map((e) => ({ ...e, snrDb: 1 })), info)?.bpm).toBe(80);
    expect(finalHeartRate(model, clean.map((e) => ({ ...e, bpm: 95 })), info)?.bpm).toBe(80);
  });

  it('uses the fast path before the model gate is ready, if the running model HR agrees', () => {
    expect(finalHeartRate(null, clean, { ...info, modelHr: 80 })).toMatchObject({ bpm: 82 });
    expect(finalHeartRate(null, clean, { ...info, modelHr: 70 })).toBeNull();
  });

  it('never invents a number with neither source ready', () => {
    expect(finalHeartRate(null, clean.slice(0, 3), info)).toBeNull();
  });
});
