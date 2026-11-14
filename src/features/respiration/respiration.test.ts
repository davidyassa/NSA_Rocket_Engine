import { describe, expect, it } from 'vitest';
import { ANALYSIS_HZ, autocorrelation, bandpass, cycles, detrend, resample, retime, spectrum, std, type Cycle } from './dsp';
import { RespiratoryEngine } from './engine';
import { fuse } from './fusion';
import { respiratoryMetrics } from './metrics';
import { signalQuality, videoQuality } from './quality';
import { DEFAULT_REGIONS, rectFromDrag, regionsFromFace } from './roi';
import { prng, renderScene, SCENE_REGIONS, type Scene } from './synthetic';
import type { QualityState, SourceEstimate } from './types';
import { corners, profileShift, pyramid, trackPoints, type Gray } from './vision';

/** A breathing-like waveform on irregular timestamps (ms). */
function breathingSamples(brpm: number, seconds: number, opts: { fps?: number; jitterMs?: number; drift?: number; noise?: number; seed?: number } = {}) {
  const rand = prng(opts.seed ?? 3);
  const fps = opts.fps ?? 15;
  const out: { t: number; v: number }[] = [];
  for (let k = 0; k < seconds * fps; k += 1) {
    const t = (k * 1000) / fps + (opts.jitterMs ? (rand() * 2 - 1) * opts.jitterMs : 0);
    const v = Math.sin((2 * Math.PI * brpm * t) / 60000) + (opts.drift ?? 0) * (t / 1000) + (opts.noise ? (rand() - 0.5) * 2 * opts.noise : 0);
    out.push({ t, v });
  }
  return out.sort((a, b) => a.t - b.t);
}

describe('signal processing', () => {
  it('resamples irregular timestamps and marks real gaps', () => {
    const s = [{ t: 0, v: 0 }, { t: 100, v: 1 }, { t: 1000, v: 10 }, { t: 1100, v: 11 }];
    const u = resample(s, 10)!;
    expect(u.values.length).toBe(12);
    expect(u.values[1]).toBeCloseTo(1);
    expect(u.values[5]).toBeCloseTo(5); // interpolated…
    expect(u.gap[5]).toBe(1); // …but flagged: 900 ms is longer than MAX_GAP_S
    expect(u.gap[0]).toBe(0);
  });

  it('band-pass keeps breathing, removes drift and fast motion', () => {
    const n = 600;
    const x = Float64Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 0.25 * i / ANALYSIS_HZ) + 0.05 * i + 0.8 * Math.sin(2 * Math.PI * 1.6 * i / ANALYSIS_HZ));
    const y = bandpass(detrend(x));
    const mid = y.slice(100, 500);
    expect(std(mid) / (1 / Math.SQRT2)).toBeGreaterThan(0.85); // the 0.25 Hz tone survives
    expect(std(mid) / (1 / Math.SQRT2)).toBeLessThan(1.1); // 1.6 Hz and the ramp are gone
  });

  it.each([6, 8, 12, 16, 20, 28, 36])('spectrum finds %i breaths/min within 0.3', (brpm) => {
    const u = resample(breathingSamples(brpm, 40, { jitterMs: 20, drift: 0.02, noise: 0.3 }))!;
    const spec = spectrum(bandpass(detrend(u.values)));
    expect(spec.peakHz! * 60).toBeCloseTo(brpm, 0);
    expect(Math.abs(spec.peakHz! * 60 - brpm)).toBeLessThan(0.3);
    expect(spec.snrDb).toBeGreaterThan(5);
  });

  it('autocorrelation returns the period, not a multiple of it', () => {
    const u = resample(breathingSamples(16, 40))!;
    const acf = autocorrelation(bandpass(detrend(u.values)));
    expect(60 / acf.periodS!).toBeCloseTo(16, 0);
    expect(acf.strength).toBeGreaterThan(0.8);
  });

  it('cycles: one per breath, skipping blocked samples, timed on the wide-band signal', () => {
    const hz = ANALYSIS_HZ; const n = 400; const period = 4; const insp = 0.4;
    const shape = (p: number) => (p < insp ? 0.5 - 0.5 * Math.cos(Math.PI * p / insp) : 0.5 + 0.5 * Math.cos(Math.PI * (p - insp) / (1 - insp)));
    const x = Float64Array.from({ length: n }, (_, i) => shape(((i / hz) / period) % 1));
    const u = { t0: 0, hz };
    const narrow = bandpass(detrend(x));
    const all = retime(cycles(narrow, u), bandpass(detrend(x), hz, 0.05, 2), u);
    expect(all.length).toBeGreaterThanOrEqual(8);
    for (const c of all) {
      expect((c.end - c.start) / 1000).toBeCloseTo(period, 0);
      expect((c.peak - c.start) / 1000).toBeCloseTo(insp * period, 0); // 1.6 s in, 2.4 s out
    }
    const blocked = new Uint8Array(n); blocked.fill(1, 150, 230);
    expect(cycles(narrow, u, blocked).length).toBeLessThan(cycles(narrow, u).length);
  });
});

describe('vision', () => {
  const tex = (w: number, h: number, dy = 0, kind: 'rich' | 'stripes' = 'rich'): Gray => {
    const data = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const yy = y + dy;
      data[y * w + x] = 128 + 30 * Math.sin(yy * 0.7) + (kind === 'rich' ? 25 * Math.sin(x * 0.55 + yy * 0.3) + 20 * Math.cos(x * 0.31 - yy * 0.9) : 0);
    }
    return { width: w, height: h, data };
  };

  it('Lucas–Kanade recovers a known sub-pixel shift, forward–backward checked', () => {
    const a = tex(80, 60); const b = tex(80, 60, 0.35); // content moved up 0.35 px
    const pts = corners(a, { x: 10, y: 10, w: 60, h: 40 }, 20).points;
    expect(pts.length).toBeGreaterThan(10);
    const r = trackPoints(pyramid(a), pyramid(b), pts, a);
    expect(r.kept.length).toBeGreaterThan(pts.length * 0.8);
    const dys = r.kept.map((k) => k.to.y - k.from.y).sort((p, q) => p - q);
    expect(dys[dys.length >> 1]).toBeCloseTo(-0.35, 1);
  });

  it('finds no corners in one-directional texture (stripes), where the profile works instead', () => {
    const a = tex(80, 60, 0, 'stripes'); const b = tex(80, 60, 0.4, 'stripes');
    expect(corners(a, { x: 10, y: 10, w: 60, h: 40 }, 20).points.length).toBe(0);
    const p = profileShift(a, b, { x: 10, y: 10, w: 60, h: 40 });
    expect(p.shift).toBeCloseTo(-0.4, 1);
    expect(p.correlation).toBeGreaterThan(0.9);
  });

  it('places torso regions under a detected face and maps drags on a mirrored preview', () => {
    const r = regionsFromFace({ cx: 0.5, cy: 0.25, size: 0.18 }, 4 / 3);
    expect(r.chest!.y).toBeGreaterThan(0.25);
    expect(r.chest!.x + r.chest!.w / 2).toBeCloseTo(0.5, 2);
    expect(rectFromDrag({ x: 0.1, y: 0.5 }, { x: 0.3, y: 0.7 }, true)).toEqual({ x: 0.7, y: 0.5, w: expect.closeTo(0.2, 5), h: expect.closeTo(0.2, 5) });
    expect(DEFAULT_REGIONS.chest.y).toBeLessThan(DEFAULT_REGIONS.abdomen.y);
  });
});

describe('fusion', () => {
  const src = (id: SourceEstimate['id'], brpm: number | null, score: number, state: QualityState = score >= 0.75 ? 'GOOD' : score >= 0.5 ? 'ACCEPTABLE' : 'POOR'): SourceEstimate => ({
    id, label: id, modality: id === 'pulse' ? 'face-pulse' : 'torso-motion', brpm, quality: { state, score, reasons: [] },
  });

  it('averages agreeing sources by quality and rewards independent agreement', () => {
    const one = fuse([src('chest', 15, 0.8)]);
    const two = fuse([src('chest', 15, 0.8), src('pulse', 16, 0.7)]);
    expect(two.brpm).toBeCloseTo((15 * 0.8 + 16 * 0.7) / 1.5, 5);
    expect(two.confidence.score).toBeGreaterThan(one.confidence.score);
    expect(two.method).toMatch(/independent methods agree/);
  });

  it('never averages contradictory sources: strong disagreement returns no rate', () => {
    const r = fuse([src('chest', 15, 0.85), src('pulse', 24, 0.85)]);
    expect(r.brpm).toBeNull();
    expect(r.confidence.state).toBe('POOR');
    expect(r.method).toMatch(/disagree/);
  });

  it('flags a face-pulse rate at twice the torso rate as a harmonic', () => {
    const r = fuse([src('chest', 15, 0.8), src('pulse', 30, 0.9)]);
    expect(r.brpm).toBeCloseTo(15);
    expect(r.rejected).toContainEqual({ id: 'pulse', reason: expect.stringMatching(/harmonic/) });
  });

  it('lets a clearly stronger source outvote a weak outlier, with lower confidence', () => {
    const r = fuse([src('chest', 15, 0.9), src('abdomen', 15.5, 0.8), src('pulse', 22, 0.5)]);
    expect(r.brpm).toBeGreaterThan(14.9);
    expect(r.rejected.find((x) => x.id === 'pulse')?.reason).toMatch(/outvoted/);
  });

  it('ignores sources below ACCEPTABLE', () => {
    expect(fuse([src('chest', 15, 0.3)]).brpm).toBeNull();
  });
});

describe('metrics', () => {
  const cyc = (start: number, ti: number, te: number, amp = 2): Cycle => ({ start, peak: start + ti, end: start + ti + te, amplitude: amp });

  it('computes timing, I:E, regularity and variability exactly from known cycles', () => {
    const cs = [0, 1, 2, 3, 4, 5].map((k) => cyc(k * 4000, 1600, 2400));
    const m = respiratoryMetrics({ rateBrpm: 15, cycles: cs, amplitudes: { chest: { cycles: cs, roiHeight: 40 } } });
    expect(m.cycleDuration.value).toBe(4);
    expect(m.inspiration.value).toBe(1.6);
    expect(m.expiration.value).toBe(2.4);
    expect(m.ieRatio.value).toBe(0.67);
    expect(m.regularity.value).toBe(0);
    expect(m.variability.value).toBe(0);
    expect(m.chestAmplitude).toMatchObject({ value: 5, kind: 'estimated' });
    expect(m.abdomenAmplitude.kind).toBe('unavailable');
  });

  it('marks metrics unavailable instead of guessing from too few breaths', () => {
    const m = respiratoryMetrics({ rateBrpm: 15, cycles: [cyc(0, 1500, 2500), cyc(4000, 1500, 2500)], amplitudes: {} });
    expect(m.inspiration.kind).toBe('unavailable');
    expect(m.regularity.kind).toBe('unavailable');
    expect(m.rate.kind).toBe('observed');
  });
});

describe('quality gates', () => {
  it('rejects a numerically fine but too-short or interrupted signal', () => {
    const good = { durationS: 40, snrDb: 12, prominence: 6, periodicity: 0.9, artifactFraction: 0, cycles: 9, internalSpreadBrpm: 0.2 };
    expect(signalQuality(good).state).toBe('GOOD');
    expect(signalQuality({ ...good, durationS: 12 }).state).toBe('INSUFFICIENT');
    expect(signalQuality({ ...good, artifactFraction: 0.5 }).state).toBe('INSUFFICIENT');
    expect(signalQuality({ ...good, cycles: 2 }).state).toBe('INSUFFICIENT');
  });

  it('rates a too-dark image as not usable', () => {
    expect(videoQuality({ brightness: 20, contrast: 30, fps: 30, intervalCv: 0.05, gapFraction: 0 }).state).toMatch(/^(POOR|INSUFFICIENT)$/);
    expect(videoQuality({ brightness: 120, contrast: 30, fps: 30, intervalCv: 0.05, gapFraction: 0 }).state).toBe('GOOD');
  });
});

describe('engine on synthetic video with known ground truth', () => {
  const base: Scene = { width: 192, height: 144, fps: 20, durationS: 40, brpm: 14, amplitudePx: 1.5, noise: 2 };
  const run = (scene: Partial<Scene>, setup?: (e: RespiratoryEngine) => void) => {
    const { frames } = renderScene({ ...base, ...scene });
    const e = new RespiratoryEngine('standard');
    e.setRegions(SCENE_REGIONS);
    setup?.(e);
    for (const f of frames) e.push(f.gray, f.t);
    return e.result();
  };
  const accepted = (state: QualityState) => state === 'GOOD' || state === 'ACCEPTABLE';

  it.each([6, 10, 14, 20, 28, 36])('measures %i breaths/min within 1', (brpm) => {
    const r = run({ brpm });
    expect(accepted(r.quality.final.state)).toBe(true);
    expect(Math.abs(r.metrics.rate.value! - brpm)).toBeLessThan(1);
  }, 30000);

  it('times inspiration and expiration (I:E 1:1.5 at 12/min)', () => {
    const r = run({ brpm: 12, inspirationFraction: 0.4 });
    expect(r.metrics.inspiration.value!).toBeCloseTo(2, 0);
    expect(r.metrics.expiration.value!).toBeCloseTo(3, 0);
  }, 30000);

  it.each<[string, Partial<Scene>]>([
    ['irregular frame timing and 10 % dropped frames', { timingJitterMs: 15, dropFraction: 0.1 }],
    ['camera shake', { cameraShake: { atS: 15, durationS: 1.5, px: 3 } }],
    ['a posture change', { postureChange: { atS: 20, durationS: 0.6, px: 6 } }],
    ['dim, drifting light', { lighting: [0.5, 0.35] }],
    ['heavy sensor noise', { noise: 8 }],
    ['striped clothing (profile fallback)', { texture: 'stripes' }],
    ['very shallow breathing (0.3 px)', { amplitudePx: 0.3 }],
  ])('stays accurate with %s', (_, scene) => {
    const r = run(scene);
    expect(accepted(r.quality.final.state)).toBe(true);
    expect(Math.abs(r.metrics.rate.value! - 14)).toBeLessThan(1);
  }, 30000);

  it('flags body movement and uses the profile fallback where they apply', () => {
    expect(run({ postureChange: { atS: 20, durationS: 0.6, px: 6 } }).waveform.artifacts.length).toBeGreaterThan(0);
    expect(run({ texture: 'stripes' }).strategy.profileFallback).toBe(true);
    expect(run({ cameraShake: { atS: 15, durationS: 1.5, px: 3 } }).strategy.cameraMotionCompensated).toBe(true);
  }, 60000);

  it.each<[string, Partial<Scene>]>([
    ['no breathing at all', { amplitudePx: 0 }],
    ['featureless clothing', { texture: 'flat' }],
    ['a measurement that is too short', { durationS: 15 }],
  ])('reports no rate for %s', (_, scene) => {
    const r = run(scene);
    expect(r.metrics.rate.value).toBeNull();
    expect(accepted(r.quality.final.state)).toBe(false);
  }, 30000);

  it('fuses an agreeing face-pulse estimate and refuses a strongly conflicting one', () => {
    const agree = run({}, (e) => e.setPulse({ brpm: 14, quality: 0.7, seconds: 30 }));
    expect(agree.fusion.used).toContain('pulse');
    const conflict = run({}, (e) => e.setPulse({ brpm: 20, quality: 0.95, seconds: 30 }));
    expect(conflict.metrics.rate.value).toBeNull();
    expect(conflict.fusion.method).toMatch(/disagree/);
  }, 60000);
});
