import { describe, expect, it } from 'vitest';
import type { BvpSample } from './breathingRate';
import { estimateBvpBreathing } from './bvpBreathingRate';

function waveform(brpm: number, seconds: number, phase = 0, heartHz = 1.25): BvpSample[] {
  const samples: BvpSample[] = [];
  for (let t = 0; t <= seconds * 1000; t += 1000 / 27 + 3 * Math.sin(t)) {
    const s = t / 1000;
    const breathing = brpm > 0 ? 0.24 * Math.sin(2 * Math.PI * brpm * s / 60 + phase) : 0;
    const pulse = Math.sin(2 * Math.PI * heartHz * s) + 0.2 * Math.sin(4 * Math.PI * heartHz * s);
    samples.push({ t: 10_000 + t, v: 2 + 0.04 * s + pulse + breathing });
  }
  return samples;
}

describe('respiratory rate from timestamped camera BVP', () => {
  it.each([6, 12, 18, 24, 30])('recovers %i breaths/min from jittered BVP with pulse and drift', (brpm) => {
    for (const phase of [0, 1.1, 2.2, 3.3, 4.4, 5.5]) {
      const result = estimateBvpBreathing(waveform(brpm, 30, phase));
      expect(result?.brpm).toBe(brpm);
      expect(result?.seconds).toBeGreaterThanOrEqual(25);
      expect(result?.seconds).toBeLessThanOrEqual(30);
    }
  });

  it('uses the latest window and refuses to bridge a recent gap', () => {
    const samples = waveform(16, 50);
    expect(estimateBvpBreathing(samples.filter(({ t }) => t < 20_000 || t > 22_000))?.brpm).toBe(16);
    expect(estimateBvpBreathing(samples.filter(({ t }) => t < 48_000 || t > 50_000))).toBeNull();
  });

  it.each([0.75, 1.25, 2.3, 3])('rejects a %f Hz pulse without a breathing component', (heartHz) => {
    expect(estimateBvpBreathing(waveform(0, 30, 0, heartHz))).toBeNull();
  });

  it('rejects a short window and a flat signal', () => {
    expect(estimateBvpBreathing(waveform(15, 24))).toBeNull();
    expect(estimateBvpBreathing(waveform(15, 30).map(({ t }) => ({ t, v: 3 })))).toBeNull();
  });
});
