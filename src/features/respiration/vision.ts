/**
 * Classical, dependency-free computer vision for torso motion (pure TypeScript).
 *
 *  - Grayscale frames at a small working width (the processing profile sets it).
 *  - Shi–Tomasi corners (minimum eigenvalue of the structure tensor) inside an ROI.
 *  - Pyramidal Lucas–Kanade tracking with a forward–backward consistency check
 *    (a point is kept only if tracking it back lands within FB_MAX_PX of where it
 *    started; this rejects points that slid along edges or were occluded).
 *  - A 1D vertical motion profile (row intensity profile cross-correlated between
 *    frames) as a fallback for low-texture regions, after Bartula et al. (2013).
 *
 * Implemented from the published methods; no code is copied from the studied
 * repositories (see docs/RESPIRATORY_RESEARCH_COMPARISON.md for licensing).
 */

export interface Gray { width: number; height: number; data: Float32Array }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

/** RGBA pixels → luminance (Rec. 601) in 0–255. */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 1, p += 4) data[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return { width, height, data };
}

/** Half-resolution image (2×2 box average) for the LK pyramid. */
export function halve(img: Gray): Gray {
  const width = Math.max(1, img.width >> 1);
  const height = Math.max(1, img.height >> 1);
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = x * 2; const sy = y * 2;
      const sx1 = Math.min(sx + 1, img.width - 1); const sy1 = Math.min(sy + 1, img.height - 1);
      data[y * width + x] = (img.data[sy * img.width + sx] + img.data[sy * img.width + sx1] + img.data[sy1 * img.width + sx] + img.data[sy1 * img.width + sx1]) / 4;
    }
  }
  return { width, height, data };
}

/** Bilinear sample with edge clamping. */
export function sample(img: Gray, x: number, y: number): number {
  const xc = Math.min(Math.max(x, 0), img.width - 1.001);
  const yc = Math.min(Math.max(y, 0), img.height - 1.001);
  const x0 = Math.floor(xc); const y0 = Math.floor(yc);
  const fx = xc - x0; const fy = yc - y0;
  const i = y0 * img.width + x0;
  const d = img.data;
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + img.width] * (1 - fx) + d[i + img.width + 1] * fx) * fy;
}

/** Mean and standard deviation of brightness inside a rectangle. */
export function regionStats(img: Gray, r: Rect): { mean: number; std: number } {
  let s = 0; let s2 = 0; let n = 0;
  const x1 = Math.min(img.width, Math.round(r.x + r.w)); const y1 = Math.min(img.height, Math.round(r.y + r.h));
  for (let y = Math.max(0, Math.round(r.y)); y < y1; y += 1) {
    for (let x = Math.max(0, Math.round(r.x)); x < x1; x += 1) { const v = img.data[y * img.width + x]; s += v; s2 += v * v; n += 1; }
  }
  if (!n) return { mean: 0, std: 0 };
  const m = s / n;
  return { mean: m, std: Math.sqrt(Math.max(0, s2 / n - m * m)) };
}

/**
 * Shi–Tomasi corners: minimum eigenvalue of the 2×2 structure tensor summed over a
 * (2·half+1)² window, kept if ≥ quality × the strongest response, at least
 * minDistance apart (grid-based non-maximum suppression), strongest first.
 */
/**
 * Minimum eigenvalue per window pixel (grey levels² of gradient) for a trackable
 * corner. Sensor noise alone gives about 2 at σ ≈ 2 grey levels; requiring more
 * keeps one-directional texture (stripes, folds) from passing as corners, where
 * Lucas–Kanade's sideways component would be pure noise.
 */
export const MIN_EIGEN_PER_PIXEL = 4;

export function corners(img: Gray, roi: Rect, maxCorners: number, quality = 0.05, minDistance = 4, half = 2): { points: Point[]; strongest: number } {
  const x0 = Math.max(half + 1, Math.floor(roi.x)); const y0 = Math.max(half + 1, Math.floor(roi.y));
  const x1 = Math.min(img.width - half - 2, Math.ceil(roi.x + roi.w)); const y1 = Math.min(img.height - half - 2, Math.ceil(roi.y + roi.h));
  if (x1 <= x0 || y1 <= y0) return { points: [], strongest: 0 };
  const w = img.width; const d = img.data;
  const candidates: { x: number; y: number; s: number }[] = [];
  let strongest = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      let gxx = 0; let gyy = 0; let gxy = 0;
      for (let dy = -half; dy <= half; dy += 1) {
        for (let dx = -half; dx <= half; dx += 1) {
          const i = (y + dy) * w + x + dx;
          const gx = (d[i + 1] - d[i - 1]) / 2; const gy = (d[i + w] - d[i - w]) / 2;
          gxx += gx * gx; gyy += gy * gy; gxy += gx * gy;
        }
      }
      const tr = gxx + gyy; const det = gxx * gyy - gxy * gxy;
      const minEig = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
      if (minEig >= MIN_EIGEN_PER_PIXEL * (2 * half + 1) ** 2) { candidates.push({ x, y, s: minEig }); strongest = Math.max(strongest, minEig); }
    }
  }
  candidates.sort((a, b) => b.s - a.s);
  const cell = Math.max(1, minDistance);
  const taken = new Set<number>();
  const points: Point[] = [];
  for (const c of candidates) {
    if (c.s < quality * strongest || points.length >= maxCorners) break;
    const key = Math.floor(c.y / cell) * 100000 + Math.floor(c.x / cell);
    if (taken.has(key)) continue;
    for (let gy = -1; gy <= 1; gy += 1) for (let gx = -1; gx <= 1; gx += 1) taken.add((Math.floor(c.y / cell) + gy) * 100000 + Math.floor(c.x / cell) + gx);
    points.push({ x: c.x, y: c.y });
  }
  return { points, strongest };
}

/** Iterative Lucas–Kanade at one pyramid level. Returns the new position or null. */
function lkLevel(prev: Gray, next: Gray, p: Point, guess: Point, half: number, iterations: number): Point | null {
  let gxx = 0; let gyy = 0; let gxy = 0;
  const n = (2 * half + 1) ** 2;
  const ix = new Float32Array(n); const iy = new Float32Array(n); const i0 = new Float32Array(n);
  let k = 0;
  for (let dy = -half; dy <= half; dy += 1) {
    for (let dx = -half; dx <= half; dx += 1) {
      const x = p.x + dx; const y = p.y + dy;
      const gx = (sample(prev, x + 1, y) - sample(prev, x - 1, y)) / 2;
      const gy = (sample(prev, x, y + 1) - sample(prev, x, y - 1)) / 2;
      ix[k] = gx; iy[k] = gy; i0[k] = sample(prev, x, y);
      gxx += gx * gx; gyy += gy * gy; gxy += gx * gy; k += 1;
    }
  }
  const det = gxx * gyy - gxy * gxy;
  if (det < 1e-6 * n * n) return null; // aperture problem: no unique solution
  let vx = guess.x - p.x; let vy = guess.y - p.y;
  for (let it = 0; it < iterations; it += 1) {
    let bx = 0; let by = 0; k = 0;
    for (let dy = -half; dy <= half; dy += 1) {
      for (let dx = -half; dx <= half; dx += 1) {
        const diff = i0[k] - sample(next, p.x + dx + vx, p.y + dy + vy);
        bx += diff * ix[k]; by += diff * iy[k]; k += 1;
      }
    }
    const ux = (gyy * bx - gxy * by) / det; const uy = (gxx * by - gxy * bx) / det;
    vx += ux; vy += uy;
    if (ux * ux + uy * uy < 1e-4) break;
  }
  return { x: p.x + vx, y: p.y + vy };
}

export interface Pyramid { levels: Gray[] }
export function pyramid(img: Gray, levels = 2): Pyramid {
  const out = [img];
  for (let i = 1; i < levels; i += 1) out.push(halve(out[i - 1]));
  return { levels: out };
}

/** Pyramidal LK from prev to next, coarse to fine. */
export function track(prev: Pyramid, next: Pyramid, p: Point, half = 4, iterations = 10): Point | null {
  const L = prev.levels.length;
  let guess: Point = { x: p.x / 2 ** (L - 1), y: p.y / 2 ** (L - 1) };
  for (let l = L - 1; l >= 0; l -= 1) {
    const s = 2 ** l;
    const pl = { x: p.x / s, y: p.y / s };
    const r = lkLevel(prev.levels[l], next.levels[l], pl, guess, half, iterations);
    if (!r) return null;
    guess = l > 0 ? { x: r.x * 2, y: r.y * 2 } : r;
  }
  return guess;
}

/** Forward–backward error above this (pixels at working resolution) rejects a point. */
export const FB_MAX_PX = 0.5;

export interface Tracked { from: Point; to: Point; fbError: number }

/** Track points forward and back; keep those that return within FB_MAX_PX. */
export function trackPoints(prev: Pyramid, next: Pyramid, points: readonly Point[], bounds: { width: number; height: number }): { kept: Tracked[]; lost: number } {
  const kept: Tracked[] = [];
  let lost = 0;
  for (const p of points) {
    const q = track(prev, next, p);
    if (!q || q.x < 1 || q.y < 1 || q.x > bounds.width - 2 || q.y > bounds.height - 2) { lost += 1; continue; }
    const back = track(next, prev, q);
    const fb = back ? Math.hypot(back.x - p.x, back.y - p.y) : Infinity;
    if (fb > FB_MAX_PX) { lost += 1; continue; }
    kept.push({ from: p, to: q, fbError: fb });
  }
  return { kept, lost };
}

/**
 * Vertical shift (pixels, + = down) of an ROI between two frames from its 1D row
 * profile: rows are averaged, differentiated (removes brightness offsets), and the
 * lag of the best normalized cross-correlation within ±maxShift is refined with a
 * parabola. Uses every pixel, so it works where corners are scarce.
 */
export function profileShift(prev: Gray, next: Gray, roi: Rect, maxShift = 3): { shift: number; correlation: number } {
  const rows = (img: Gray) => {
    const out: number[] = [];
    const x0 = Math.max(0, Math.round(roi.x)); const x1 = Math.min(img.width, Math.round(roi.x + roi.w));
    for (let y = Math.max(0, Math.round(roi.y)); y < Math.min(img.height, Math.round(roi.y + roi.h)); y += 1) {
      let s = 0;
      for (let x = x0; x < x1; x += 1) s += img.data[y * img.width + x];
      out.push(s / Math.max(1, x1 - x0));
    }
    return out.slice(1).map((v, i) => v - out[i]);
  };
  const a = rows(prev); const b = rows(next);
  const n = Math.min(a.length, b.length);
  if (n < 2 * maxShift + 4) return { shift: 0, correlation: 0 };
  const score = (lag: number) => {
    let s = 0; let sa = 0; let sb = 0;
    for (let i = maxShift; i < n - maxShift; i += 1) { const x = a[i]; const y = b[i + lag]; s += x * y; sa += x * x; sb += y * y; }
    return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : 0;
  };
  let best = 0; let bestScore = -Infinity;
  const scores = new Map<number, number>();
  for (let lag = -maxShift; lag <= maxShift; lag += 1) { const s = score(lag); scores.set(lag, s); if (s > bestScore) { bestScore = s; best = lag; } }
  // A best lag at the edge of the search means the true shift is outside it, or a
  // repeating pattern aliased: report it as unreliable rather than as motion.
  if (best === -maxShift || best === maxShift) return { shift: best, correlation: 0 };
  let shift = best;
  const l = scores.get(best - 1)!; const c = scores.get(best)!; const r = scores.get(best + 1)!;
  const d = l - 2 * c + r;
  if (d < 0) shift += (0.5 * (l - r)) / d;
  return { shift, correlation: bestScore };
}

/** Mean absolute frame difference inside a rectangle (0–255): a cheap motion-energy cue. */
export function differenceEnergy(prev: Gray, next: Gray, r: Rect): number {
  let s = 0; let n = 0;
  const x1 = Math.min(prev.width, Math.round(r.x + r.w)); const y1 = Math.min(prev.height, Math.round(r.y + r.h));
  for (let y = Math.max(0, Math.round(r.y)); y < y1; y += 2) {
    for (let x = Math.max(0, Math.round(r.x)); x < x1; x += 2) { const i = y * prev.width + x; s += Math.abs(next.data[i] - prev.data[i]); n += 1; }
  }
  return n ? s / n : 0;
}
