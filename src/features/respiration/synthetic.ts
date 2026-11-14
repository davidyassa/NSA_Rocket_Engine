/**
 * Deterministic synthetic camera for validation (used by tests and the benchmark).
 * Renders a static textured background and a textured torso that moves up on each
 * in-breath with a known rate, inspiration/expiration ratio and amplitude, plus
 * optional sensor noise, irregular frame timing, dropped frames, camera shake, a
 * posture change, lighting drift and low-texture clothing. Ground truth is exact.
 */
import type { Gray } from './vision';

export interface Scene {
  width: number;
  height: number;
  fps: number;
  durationS: number;
  brpm: number;
  /** chest displacement at peak inspiration, pixels at this resolution (0 = no breathing) */
  amplitudePx: number;
  /** abdomen amplitude relative to chest */
  abdomenGain?: number;
  /** inspiration fraction of each cycle (0.4 = I:E of 1:1.5) */
  inspirationFraction?: number;
  /** breath-to-breath rate variation, fraction (0.1 = ±10 %) */
  rateJitter?: number;
  /** sensor noise standard deviation, grey levels */
  noise?: number;
  /** frame timestamp jitter, ms (uniform ±) */
  timingJitterMs?: number;
  /** drop this fraction of frames */
  dropFraction?: number;
  texture?: 'rich' | 'stripes' | 'flat';
  cameraShake?: { atS: number; durationS: number; px: number };
  postureChange?: { atS: number; durationS: number; px: number };
  /** overall brightness multiplier from start to end */
  lighting?: [number, number];
  seed?: number;
}

/** Mulberry32: small deterministic PRNG. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth random texture: a sum of oriented sinusoids (continuous, so sub-pixel shifts are exact). */
function textureFn(rand: () => number, kind: 'rich' | 'stripes' | 'flat') {
  const waves = Array.from({ length: kind === 'rich' ? 14 : 6 }, () => {
    const wavelength = 5 + rand() * 14;
    const angle = kind === 'stripes' ? Math.PI / 2 : rand() * Math.PI;
    const k = (2 * Math.PI) / wavelength;
    return { kx: k * Math.cos(angle), ky: k * Math.sin(angle), phase: rand() * 2 * Math.PI, amp: kind === 'flat' ? 0.4 : 8 + rand() * 10 };
  });
  return (x: number, y: number) => {
    let v = 128;
    for (const w of waves) v += w.amp * Math.sin(w.kx * x + w.ky * y + w.phase);
    return v;
  };
}

/** Breathing displacement (0..1) over one cycle with the given inspiration fraction. */
function breathShape(phase: number, insp: number): number {
  const p = phase - Math.floor(phase);
  return p < insp ? 0.5 - 0.5 * Math.cos((Math.PI * p) / insp) : 0.5 + 0.5 * Math.cos((Math.PI * (p - insp)) / (1 - insp));
}

/** Torso layout used by the scene (frame fractions), for setting test regions. */
export const SCENE_REGIONS = {
  chest: { x: 0.3, y: 0.45, w: 0.4, h: 0.25 },
  abdomen: { x: 0.3, y: 0.72, w: 0.4, h: 0.2 },
} as const;

export interface SceneFrame { gray: Gray; t: number }

/** All frames of a scene, plus the exact breath times (ms) of each inspiration start. */
export function renderScene(s: Scene): { frames: SceneFrame[]; breaths: number[] } {
  const rand = prng(s.seed ?? 1);
  const bg = textureFn(rand, 'rich');
  const torso = textureFn(rand, s.texture ?? 'rich');
  const insp = s.inspirationFraction ?? 0.42;
  const abGain = s.abdomenGain ?? 1.3;
  const { width: W, height: H } = s;
  const torsoX0 = Math.round(W * 0.22); const torsoX1 = Math.round(W * 0.78);
  const torsoY0 = Math.round(H * 0.4);
  const chestEnd = H * 0.71;
  // Pre-sample textures on a 4× vertical grid for fast sub-pixel rendering.
  const SUB = 4;
  const rows = (H + 40) * SUB;
  const tex = new Float32Array(W * rows);
  for (let r = 0; r < rows; r += 1) for (let x = 0; x < W; x += 1) tex[r * W + x] = torso(x, r / SUB - 20);
  const back = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) back[y * W + x] = bg(x, y);

  // Breath phase with optional cycle-to-cycle rate jitter (piecewise constant per breath).
  const breaths: number[] = [];
  const cycleStarts: { t: number; period: number }[] = [];
  let tc = 0;
  while (tc < s.durationS * 1000 + 20000) {
    const jitter = s.rateJitter ? 1 + (rand() * 2 - 1) * s.rateJitter : 1;
    const period = 60000 / (s.brpm * jitter);
    cycleStarts.push({ t: tc, period });
    if (tc <= s.durationS * 1000) breaths.push(tc);
    tc += period;
  }
  const phaseAt = (t: number) => {
    let i = 0;
    while (i + 1 < cycleStarts.length && cycleStarts[i + 1].t <= t) i += 1;
    return i + (t - cycleStarts[i].t) / cycleStarts[i].period;
  };
  const ramp = (t: number, ev?: { atS: number; durationS: number; px: number }) => {
    if (!ev) return 0;
    const u = (t / 1000 - ev.atS) / ev.durationS;
    return u <= 0 ? 0 : u >= 1 ? ev.px : ev.px * u;
  };

  const frames: SceneFrame[] = [];
  const n = Math.floor(s.durationS * s.fps);
  for (let k = 0; k < n; k += 1) {
    if (s.dropFraction && rand() < s.dropFraction) continue;
    const t = (k * 1000) / s.fps + (s.timingJitterMs ? (rand() * 2 - 1) * s.timingJitterMs : 0);
    const d = s.amplitudePx * breathShape(phaseAt(t), insp);
    const shake = s.cameraShake && t / 1000 >= s.cameraShake.atS && t / 1000 < s.cameraShake.atS + s.cameraShake.durationS
      ? s.cameraShake.px * Math.sin((2 * Math.PI * (t / 1000 - s.cameraShake.atS)) / 0.25) : 0;
    const posture = ramp(t, s.postureChange);
    const gain = s.lighting ? s.lighting[0] + (s.lighting[1] - s.lighting[0]) * (k / n) : 1;
    const data = new Float32Array(W * H);
    for (let y = 0; y < H; y += 1) {
      const ys = y - shake; // camera shake moves the whole image
      for (let x = 0; x < W; x += 1) {
        let v: number;
        const yy = Math.round(ys) < 0 ? 0 : Math.min(H - 1, Math.round(ys));
        if (x >= torsoX0 && x < torsoX1 && ys >= torsoY0 + posture) {
          const disp = ys < chestEnd ? d : d * abGain;
          // The torso moves up by `disp`: show the texture from `disp` pixels lower.
          const src = (ys + disp - posture + 20) * SUB;
          const r0 = Math.max(0, Math.min(rows - 2, Math.floor(src)));
          const f = src - Math.floor(src);
          v = tex[r0 * W + x] * (1 - f) + tex[(r0 + 1) * W + x] * f;
        } else v = back[yy * W + x];
        if (s.noise) v += (rand() + rand() + rand() - 1.5) * 2 * s.noise;
        data[y * W + x] = Math.max(0, Math.min(255, v * gain));
      }
    }
    frames.push({ gray: { width: W, height: H, data }, t: Math.max(0, t) });
  }
  frames.sort((a, b) => a.t - b.t);
  return { frames, breaths };
}
