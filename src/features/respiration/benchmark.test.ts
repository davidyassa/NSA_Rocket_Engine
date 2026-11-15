/**
 * Validation benchmark on synthetic ground truth. Slow, so it only runs on request:
 *   RESP_BENCH=1 npx vitest run src/features/respiration/benchmark.test.ts
 * Writes results to RESP_BENCH_OUT (JSON) for docs/RESPIRATORY_VALIDATION_REPORT.md.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RespiratoryEngine } from './engine';
import { renderScene, SCENE_REGIONS, type Scene } from './synthetic';
import type { ProcessingProfile } from './types';
import { PROFILES } from './types';

const RATES = [6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36];
const SEEDS = [1, 2];
const CONDITIONS: [string, Partial<Scene>][] = [
  ['baseline (σ=2, 20 fps)', {}],
  ['irregular timing ±15 ms + 10% drops', { timingJitterMs: 15, dropFraction: 0.1 }],
  ['heavy noise σ=8', { noise: 8 }],
  ['irregular breathing ±15%', { rateJitter: 0.15 }],
  ['striped clothing', { texture: 'stripes' }],
  ['posture change at 20 s', { postureChange: { atS: 20, durationS: 0.6, px: 6 } }],
  ['camera shake at 15 s', { cameraShake: { atS: 15, durationS: 1.5, px: 3 } }],
  ['dim, drifting light', { lighting: [0.5, 0.35] }],
  ['shallow breathing 0.5 px', { amplitudePx: 0.5 }],
];

function run(scene: Scene, profile: ProcessingProfile = 'standard') {
  const scaled = { ...scene, width: PROFILES[profile].width, height: Math.round(PROFILES[profile].width * 0.75), amplitudePx: scene.amplitudePx * PROFILES[profile].width / 192 };
  const { frames } = renderScene(scaled);
  const e = new RespiratoryEngine(profile);
  e.setRegions(SCENE_REGIONS);
  const t0 = performance.now();
  for (const f of frames) e.push(f.gray, f.t);
  const pushMs = (performance.now() - t0) / frames.length;
  const t1 = performance.now();
  const r = e.result();
  const resultMs = performance.now() - t1;
  return { r, pushMs, resultMs };
}

function stats(pairs: { est: number; ref: number }[]) {
  if (!pairs.length) return null;
  const d = pairs.map((p) => p.est - p.ref);
  const mae = d.reduce((s, v) => s + Math.abs(v), 0) / d.length;
  const rmse = Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length);
  const mape = (pairs.reduce((s, p) => s + Math.abs(p.est - p.ref) / p.ref, 0) / pairs.length) * 100;
  const bias = d.reduce((s, v) => s + v, 0) / d.length;
  const sd = Math.sqrt(d.reduce((s, v) => s + (v - bias) ** 2, 0) / Math.max(1, d.length - 1));
  return { n: pairs.length, mae, rmse, mape, bias, loa: [bias - 1.96 * sd, bias + 1.96 * sd], maxAbs: Math.max(...d.map(Math.abs)) };
}

describe.runIf(process.env.RESP_BENCH)('respiratory validation benchmark', () => {
  it('runs', () => {
    const base: Scene = { width: 192, height: 144, fps: 20, durationS: 40, brpm: 14, amplitudePx: 1.5, noise: 2 };
    const out: Record<string, unknown> = { generatedAt: new Date().toISOString(), node: process.version, conditions: {} };
    const conditions: Record<string, unknown> = {};
    for (const [name, over] of CONDITIONS) {
      const pairs: { est: number; ref: number }[] = [];
      let rejected = 0; let total = 0; const ms: number[] = [];
      for (const brpm of RATES) for (const seed of SEEDS) {
        const { r, pushMs } = run({ ...base, ...over, brpm, seed });
        total += 1; ms.push(pushMs);
        if (r.metrics.rate.value === null) rejected += 1; else pairs.push({ est: r.metrics.rate.value, ref: brpm });
      }
      conditions[name] = { ...stats(pairs), coverage: pairs.length / total, rejected, total, msPerFrame: ms.reduce((s, v) => s + v, 0) / ms.length };
    }
    out.conditions = conditions;

    // Negative controls: any reported rate is a false report.
    const negatives: Record<string, unknown> = {};
    for (const [name, over, seeds] of [
      ['no breathing', { amplitudePx: 0 }, 40],
      ['no breathing, heavy noise σ=8', { amplitudePx: 0, noise: 8 }, 20],
      ['no breathing, posture change', { amplitudePx: 0, postureChange: { atS: 20, durationS: 0.6, px: 6 } }, 10],
      ['featureless clothing', { texture: 'flat' as const }, 10],
      ['15 s only', { durationS: 15 }, 10],
    ] as const) {
      let reported = 0;
      for (let seed = 1; seed <= seeds; seed += 1) if (run({ ...base, ...over, seed }).r.metrics.rate.value !== null) reported += 1;
      negatives[name] = { runs: seeds, falseReports: reported };
    }
    out.negatives = negatives;

    // Timing metrics against ground truth (I:E 1:1.5).
    const timing: { brpm: number; ti: number | null; te: number | null; tiRef: number; teRef: number }[] = [];
    for (const brpm of [8, 12, 16, 24]) {
      const { r } = run({ ...base, brpm, inspirationFraction: 0.4 });
      timing.push({ brpm, ti: r.metrics.inspiration.value, te: r.metrics.expiration.value, tiRef: 0.4 * 60 / brpm, teRef: 0.6 * 60 / brpm });
    }
    out.timing = timing;

    // Processing profiles: accuracy and per-frame cost on the baseline scene.
    const profiles: Record<string, unknown> = {};
    for (const profile of ['lightweight', 'standard', 'enhanced'] as ProcessingProfile[]) {
      const pairs: { est: number; ref: number }[] = []; const push: number[] = []; const result: number[] = []; let rejected = 0;
      for (const brpm of [8, 14, 24, 32]) {
        const { r, pushMs, resultMs } = run({ ...base, brpm, noise: 3 }, profile);
        push.push(pushMs); result.push(resultMs);
        if (r.metrics.rate.value === null) rejected += 1; else pairs.push({ est: r.metrics.rate.value, ref: brpm });
      }
      const w = PROFILES[profile].width; const h = Math.round(w * 0.75);
      profiles[profile] = {
        width: w, height: h, ...stats(pairs), rejected,
        msPerFrame: push.reduce((s, v) => s + v, 0) / push.length,
        msPerAnalysis: result.reduce((s, v) => s + v, 0) / result.length,
        // Working set: two pyramids (2 levels, Float32) + 60 s of samples per source.
        approxWorkingSetKB: Math.round((2 * w * h * 4 * 1.25 + 4 * 60 * 30 * 16) / 1024),
      };
    }
    out.profiles = profiles;
    if (process.env.RESP_BENCH_OUT) writeFileSync(process.env.RESP_BENCH_OUT, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    expect(Object.keys(conditions).length).toBe(CONDITIONS.length);
  }, 1_800_000);
});
