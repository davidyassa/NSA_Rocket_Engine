import { describe, expect, it } from 'vitest';
import { beatFeatures, estimateBreathing, explainBreathing, type BeatEvent, type BvpSample } from './breathingRate';

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) - 0.5;
}

/**
 * Synthetic camera pulse wave: heartbeats at `bpm` whose timing, strength and
 * midline are all modulated by breathing at `brpm`, plus noise and frame jitter.
 */
function synthetic(bpm: number, brpm: number, seconds: number, { noise = 0.04, seed = 5, modulation = 1 } = {}) {
  const rand = rng(seed);
  const beats: BeatEvent[] = [];
  let t = 400;
  while (t < seconds * 1000) {
    const breath = Math.sin((2 * Math.PI * brpm * t) / 60000);
    const ibi = (60000 / bpm) * (1 + 0.06 * modulation * breath) + 8 * rand();
    t += ibi;
    beats.push({ t, ibi });
  }
  const bvp: BvpSample[] = [];
  for (let s = 0; s <= seconds * 1000; s += 1000 / 30 + 4 * rand()) {
    const breath = Math.sin((2 * Math.PI * brpm * s) / 60000);
    // distance to nearest beat → pulse shape
    let phase = 1;
    for (let k = 0; k < beats.length; k += 1) {
      if (beats[k].t >= s) { const prev = k > 0 ? beats[k - 1].t : 0; phase = (s - prev) / (beats[k].t - prev); break; }
    }
    const pulse = Math.exp(-((phase - 0.15) ** 2) / 0.02) + 0.3 * Math.exp(-((phase - 0.5) ** 2) / 0.03);
    bvp.push({ t: s, v: pulse * (1 + 0.15 * modulation * breath) + 0.25 * modulation * breath + noise * rand() });
  }
  return { bvp, beats };
}

describe('breathing rate from the camera pulse wave', () => {
  it.each([10, 15, 22])('measures %i breaths/min within ±2 by fusing BW, AM and FM', (brpm) => {
    const { bvp, beats } = synthetic(70, brpm, 45);
    const result = estimateBreathing(beatFeatures(bvp, beats));
    expect(result.ready).toBe(true);
    expect(Math.abs((result.brpm ?? 0) - brpm)).toBeLessThanOrEqual(2);
  });

  it('waits for at least 30 seconds before giving a number', () => {
    const { bvp, beats } = synthetic(70, 15, 20);
    const result = estimateBreathing(beatFeatures(bvp, beats));
    expect(result.ready).toBe(false);
    expect(result.reason).toBe('collecting');
  });

  it('refuses to guess when there is no breathing modulation (noise only)', () => {
    const { bvp, beats } = synthetic(70, 15, 45, { modulation: 0, noise: 0.3, seed: 11 });
    const result = estimateBreathing(beatFeatures(bvp, beats));
    expect(result.ready).toBe(false);
    expect(result.brpm).toBeNull();
  });

  it('still measures through missed and extra beats from the camera detector', () => {
    const { bvp, beats } = synthetic(72, 14, 50, { seed: 9 });
    const damaged = beats.filter((_, i) => i % 17 !== 5).map((b, i) => (i % 23 === 7 ? { ...b, ibi: b.ibi * 0.45 } : b));
    const result = estimateBreathing(beatFeatures(bvp, damaged));
    expect(result.ready).toBe(true);
    expect(Math.abs((result.brpm ?? 0) - 14)).toBeLessThanOrEqual(2);
  });

  it('explains results in everyday words', () => {
    expect(explainBreathing(15).verdict).toBe('usual');
    expect(explainBreathing(8).verdict).toBe('low');
    expect(explainBreathing(26).verdict).toBe('high');
  });
});
