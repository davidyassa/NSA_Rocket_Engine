/**
 * A second, independent camera pulse measurement (pure, tested on synthetic signals).
 *
 * It runs beside the camera model and follows the methods that published work uses to
 * keep remote pulse readable in difficult conditions:
 *  - Several skin regions: forehead and both cheeks, placed from the face keypoints and
 *    weighted by how clean each one's pulse is. A turned head or a shadow on one side
 *    lowers that region's weight instead of spoiling the reading (cf. R2I-rPPG).
 *  - Skin pixels only: a YCbCr skin test drops hair, eyebrows, eyes and background, and
 *    near-white pixels (shine, glare) are skipped.
 *  - Background as a light reference: light flicker and brightness changes also appear
 *    on the background, so their share is regressed out of each skin signal.
 *  - POS (plane orthogonal to skin; Wang et al., IEEE TBME 2017): a colour projection
 *    that cancels the brightness changes that move all colours together.
 * Its rate is used only through the same steadiness and agreement checks as the
 * camera model's (pulseSpectrum.ts).
 */
import type { BvpSample } from './breathingRate';
import { spectralHeartRate, type SpectralHeartRate } from './pulseSpectrum';

export type Rgb = [number, number, number];
export type RegionId = 'forehead' | 'cheekImageLeft' | 'cheekImageRight';
export const REGIONS: readonly RegionId[] = ['forehead', 'cheekImageLeft', 'cheekImageRight'];

/** One frame: mean skin colour per region (null when too little skin was seen), and the background. */
export interface ColourSample {
  t: number;
  regions: Partial<Record<RegionId, Rgb | null>>;
  background: Rgb | null;
  /** fraction of near-white (shiny) pixels on the forehead and cheeks */
  glare: number;
}

export interface Box { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

/**
 * Skin regions from the face keypoints (frame fractions, raw image): eyes, nose, mouth.
 * Forehead: above the eyes. Cheeks: below each eye, beside the nose, above the mouth.
 */
export function skinRegions(kps: readonly Point[]): Record<RegionId, Box> | null {
  if (kps.length < 4) return null;
  const [a, b, , mouth] = kps;
  const [l, r] = a.x <= b.x ? [a, b] : [b, a];
  const span = r.x - l.x;
  if (span < 0.02) return null;
  const eyeY = (l.y + r.y) / 2;
  const down = Math.max(span * 0.6, mouth.y - eyeY);
  return {
    forehead: { x: (l.x + r.x) / 2 - span * 0.55, y: eyeY - span * 0.8, w: span * 1.1, h: span * 0.45 },
    cheekImageLeft: { x: l.x - span * 0.35, y: eyeY + down * 0.3, w: span * 0.45, h: down * 0.5 },
    cheekImageRight: { x: r.x - span * 0.1, y: eyeY + down * 0.3, w: span * 0.45, h: down * 0.5 },
  };
}

/** YCbCr skin test (Chai & Ngan ranges, tolerant of brightness), excluding shine and darkness. */
export function isSkin(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  if (y < 25 || r > 245 || g > 245 || b > 245) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
}

/** Mean colour of skin pixels in a box (frame fractions), or null if under a third is skin. */
export function regionColour(data: Uint8ClampedArray, width: number, height: number, box: Box): { rgb: Rgb | null; glare: number } {
  const x0 = Math.max(0, Math.floor(box.x * width)); const x1 = Math.min(width, Math.ceil((box.x + box.w) * width));
  const y0 = Math.max(0, Math.floor(box.y * height)); const y1 = Math.min(height, Math.ceil((box.y + box.h) * height));
  let r = 0; let g = 0; let bl = 0; let n = 0; let total = 0; let shiny = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * width + x) * 4;
      total += 1;
      if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) shiny += 1;
      if (!isSkin(data[i], data[i + 1], data[i + 2])) continue;
      r += data[i]; g += data[i + 1]; bl += data[i + 2]; n += 1;
    }
  }
  return { rgb: total && n >= total / 3 ? [r / n, g / n, bl / n] : null, glare: total ? shiny / total : 0 };
}

/** Mean colour of the frame's side strips (background reference). */
export function backgroundColour(data: Uint8ClampedArray, width: number, height: number): Rgb | null {
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let y = Math.floor(height * 0.2); y < Math.ceil(height * 0.8); y += 1) {
    for (const x0 of [0, Math.floor(width * 0.9)]) {
      for (let x = x0; x < x0 + Math.floor(width * 0.1); x += 1) {
        const i = (y * width + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
      }
    }
  }
  return n ? [r / n, g / n, b / n] : null;
}

/** One frame's colour sample from a small RGBA frame and the face keypoints. */
export function colourSample(t: number, data: Uint8ClampedArray, width: number, height: number, kps: readonly Point[] | null): ColourSample | null {
  const boxes = kps ? skinRegions(kps) : null;
  if (!boxes) return null;
  const regions: ColourSample['regions'] = {};
  let glare = 0;
  for (const id of REGIONS) {
    const c = regionColour(data, width, height, boxes[id]);
    regions[id] = c.rgb;
    glare = Math.max(glare, c.glare);
  }
  return { t, regions, background: backgroundColour(data, width, height), glare };
}

const HZ = 30;
const WINDOW = 48; // 1.6 s POS window, as in the original method

/** Linear interpolation of one colour track onto a uniform 30 Hz grid. */
function uniform(times: number[], values: Rgb[]): { t0: number; rgb: Rgb[] } {
  const t0 = times[0];
  const n = Math.floor(((times[times.length - 1] - t0) / 1000) * HZ) + 1;
  const out: Rgb[] = [];
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    const t = t0 + (i * 1000) / HZ;
    while (j < times.length - 2 && times[j + 1] < t) j += 1;
    const span = times[j + 1] - times[j] || 1;
    const k = Math.min(1, Math.max(0, (t - times[j]) / span));
    out.push([0, 1, 2].map((c) => values[j][c] + (values[j + 1][c] - values[j][c]) * k) as Rgb);
  }
  return { t0, rgb: out };
}

const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / Math.max(1, x.length);
const sd = (x: number[]) => { const m = mean(x); return Math.sqrt(mean(x.map((v) => (v - m) ** 2))); };

/**
 * POS pulse wave from a colour track, with the background's share of each colour's
 * change removed first (least-squares fit per window, clamped to 0–1.5).
 */
export function posWave(rgb: Rgb[], background: Rgb[] | null): number[] {
  const n = rgb.length;
  const h = new Array<number>(n).fill(0);
  for (let start = 0; start + WINDOW <= n; start += 1) {
    const end = start + WINDOW;
    const norm: number[][] = [0, 1, 2].map((c) => {
      const face = rgb.slice(start, end).map((v) => v[c]);
      const fm = mean(face) || 1;
      let f = face.map((v) => v / fm);
      if (background) {
        const bg = background.slice(start, end).map((v) => v[c]);
        const bm = mean(bg);
        if (bm > 5) {
          const bn = bg.map((v) => v / bm - 1);
          const fc = f.map((v) => v - 1);
          const vb = mean(bn.map((v) => v * v));
          const beta = vb > 1e-9 ? Math.max(0, Math.min(1.5, mean(fc.map((v, i) => v * bn[i])) / vb)) : 0;
          f = f.map((v, i) => v - beta * bn[i]);
        }
      }
      return f;
    });
    const [R, G, B] = norm;
    const s1 = G.map((g, i) => g - B[i]);
    const s2 = G.map((g, i) => g + B[i] - 2 * R[i]);
    const alpha = sd(s2) > 1e-9 ? sd(s1) / sd(s2) : 0;
    const p = s1.map((v, i) => v + alpha * s2[i]);
    const pm = mean(p);
    for (let i = 0; i < WINDOW; i += 1) h[start + i] += p[i] - pm; // overlap-add
  }
  return h;
}

export interface PosEstimate extends SpectralHeartRate {
  /** each region's signal-to-noise ratio (dB), for the weights */
  regionSnr: Partial<Record<RegionId, number>>;
}

/**
 * Heart rate from the colour samples: a POS wave per region, the regions' waves added
 * with weights from their own spectral cleanliness, then the shared fine spectrum.
 * The 17 s history leaves 12 s after the spectrum's 5 s start-up is skipped.
 */
export function posHeartRate(samples: readonly ColourSample[], windowMs = 17_000): PosEstimate | null {
  if (samples.length < 2) return null;
  const end = samples[samples.length - 1].t;
  const recent = samples.filter((s) => s.t >= end - windowMs);
  const bgTimes = recent.filter((s) => s.background).map((s) => s.t);
  const bgVals = recent.filter((s) => s.background).map((s) => s.background!) as Rgb[];
  const regionSnr: PosEstimate['regionSnr'] = {};
  let combined: number[] | null = null;
  let t0 = 0;
  for (const id of REGIONS) {
    const pts = recent.filter((s) => s.regions[id]);
    if (pts.length < HZ * 5) continue; // at least ~5 s of this region
    const track = uniform(pts.map((s) => s.t), pts.map((s) => s.regions[id]!) as Rgb[]);
    const bg = bgTimes.length >= 2 ? uniform(bgTimes, bgVals) : null;
    // Align the background grid to this region's grid.
    const bgAligned = bg ? track.rgb.map((_, i) => bg.rgb[Math.min(bg.rgb.length - 1, Math.max(0, Math.round(((track.t0 - bg.t0) / 1000) * HZ) + i))]) : null;
    const wave = posWave(track.rgb, bgAligned);
    const est = spectralHeartRate(wave.map((v, i) => ({ t: track.t0 + (i * 1000) / HZ, v })) as BvpSample[]);
    if (!est) continue;
    regionSnr[id] = est.snrDb;
    const weight = Math.max(0, 10 ** (est.snrDb / 10) - 1);
    if (weight <= 0) continue;
    const scale = sd(wave) || 1;
    if (!combined) { combined = wave.map((v) => (v / scale) * weight); t0 = track.t0; } else {
      const offset = Math.round(((track.t0 - t0) / 1000) * HZ);
      for (let i = 0; i < wave.length; i += 1) { const k = i + offset; if (k >= 0 && k < combined.length) combined[k] += (wave[i] / scale) * weight; }
    }
  }
  if (!combined) return null;
  const est = spectralHeartRate(combined.map((v, i) => ({ t: t0 + (i * 1000) / HZ, v })) as BvpSample[]);
  return est ? { ...est, regionSnr } : null;
}
