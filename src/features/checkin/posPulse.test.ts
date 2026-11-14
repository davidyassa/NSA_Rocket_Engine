import { describe, expect, it } from 'vitest';
import { isSkin, posHeartRate, regionColour, skinRegions, type ColourSample, type Rgb } from './posPulse';

/** Mulberry32 PRNG for deterministic noise. */
function prng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Synthetic face colours: a pulse that changes skin colour (strongest in green, as blood
 * absorbs green most), plus light changes shared with the background.
 */
function scene(o: { bpm: number; seconds?: number; fps?: number; flickerHz?: number; flicker?: number; drift?: number; noise?: number; jitterMs?: number; shadowLeft?: boolean; seed?: number; tint?: number; noBackground?: boolean }): ColourSample[] {
  const rand = prng(o.seed ?? 1);
  const fps = o.fps ?? 30;
  const out: ColourSample[] = [];
  const skin: Rgb = [185, 130, 105];
  const pulseDir = [0.33, 0.77, 0.53]; // relative pulsatile strength per channel (Wang et al.)
  for (let k = 0; k < (o.seconds ?? 20) * fps; k += 1) {
    const t = (k * 1000) / fps + (o.jitterMs ? (rand() * 2 - 1) * o.jitterMs : 0);
    const s = t / 1000;
    const pulse = 0.006 * Math.sin(2 * Math.PI * (o.bpm / 60) * s);
    const light = 1 + (o.flicker ?? 0) * Math.sin(2 * Math.PI * (o.flickerHz ?? 0) * s) + (o.drift ?? 0) * s;
    // Two independent colour flickers of the light (e.g. mixed LED and screen light).
    const a = o.tint ?? 0;
    const tint = [1 + a * Math.sin(2 * Math.PI * 1.5 * s), 1 + a * 0.5 * Math.sin(2 * Math.PI * 1.9 * s + 1), 1 + a * Math.sin(2 * Math.PI * 1.9 * s)];
    const colour = (gain: number): Rgb => skin.map((c, i) => c * light * tint[i] * gain * (1 + pulse * pulseDir[i]) + (o.noise ? (rand() - 0.5) * 2 * o.noise : 0)) as Rgb;
    out.push({
      t,
      regions: { forehead: colour(1), cheekImageLeft: o.shadowLeft ? colour(0.25).map((v) => v + (rand() - 0.5) * 6) as Rgb : colour(0.95), cheekImageRight: colour(0.95) },
      background: o.noBackground ? null : ([120, 120, 125] as Rgb).map((c, i) => c * light * tint[i]) as Rgb,
      glare: 0,
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

describe('independent multi-region POS pulse', () => {
  it.each([48, 60, 72, 90, 110, 140])('reads %i bpm', (bpm) => {
    const est = posHeartRate(scene({ bpm, noise: 0.3 }))!;
    expect(Math.abs(est.bpm - bpm)).toBeLessThan(1.5);
    expect(est.snrDb).toBeGreaterThan(3);
  });

  it('ignores light flicker that the background also shows', () => {
    // A strong 1.5 Hz (90/min) flicker, far larger than the pulse, with the pulse at 66.
    const est = posHeartRate(scene({ bpm: 66, flicker: 0.03, flickerHz: 1.5, noise: 0.3 }))!;
    expect(Math.abs(est.bpm - 66)).toBeLessThan(1.5);
  });

  it('removes two independent colour flickers using the background, which POS alone cannot', () => {
    const lights = { bpm: 66, tint: 0.05, noise: 0.3 };
    const withBackground = posHeartRate(scene(lights))!;
    expect(Math.abs(withBackground.bpm - 66)).toBeLessThan(1.5);
    // Without the background reference, POS alone gives no reading or the wrong one.
    const without = posHeartRate(scene({ ...lights, noBackground: true }));
    expect(without === null || Math.abs(without.bpm - 66) > 5).toBe(true);
  });

  it('ignores slow brightness drift and uneven frame timing', () => {
    const est = posHeartRate(scene({ bpm: 75, drift: 0.01, jitterMs: 8, noise: 0.3 }))!;
    expect(Math.abs(est.bpm - 75)).toBeLessThan(1.5);
  });

  it('down-weights a shadowed cheek instead of failing', () => {
    const est = posHeartRate(scene({ bpm: 80, shadowLeft: true, noise: 0.3 }))!;
    expect(Math.abs(est.bpm - 80)).toBeLessThan(1.5);
    expect(est.regionSnr.cheekImageLeft ?? -Infinity).toBeLessThan(est.regionSnr.forehead!);
  });

  it('returns nothing without enough skin signal', () => {
    expect(posHeartRate(scene({ bpm: 70, seconds: 4 }))).toBeNull();
  });
});

describe('skin regions and skin pixels', () => {
  it('places forehead above and cheeks below the eyes', () => {
    const r = skinRegions([{ x: 0.42, y: 0.4 }, { x: 0.58, y: 0.4 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.6 }])!;
    expect(r.forehead.y + r.forehead.h).toBeLessThan(0.4);
    expect(r.cheekImageLeft.y).toBeGreaterThan(0.4);
    expect(r.cheekImageLeft.x).toBeLessThan(r.cheekImageRight.x);
  });

  it('counts skin, not hair, background or shine', () => {
    expect(isSkin(190, 135, 110)).toBe(true); // light skin
    expect(isSkin(110, 70, 50)).toBe(true); // dark skin
    expect(isSkin(40, 35, 30)).toBe(false); // dark hair
    expect(isSkin(90, 120, 200)).toBe(false); // blue background
    expect(isSkin(252, 250, 248)).toBe(false); // glare
  });

  it('reports glare and needs a third of the region to be skin', () => {
    const w = 10; const h = 10; const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) data.set(i < 20 ? [255, 255, 255, 255] : [190, 135, 110, 255], i * 4);
    const c = regionColour(data, w, h, { x: 0, y: 0, w: 1, h: 1 });
    expect(c.glare).toBeCloseTo(0.2, 5);
    expect(c.rgb![1]).toBeCloseTo(135, 5);
  });
});
