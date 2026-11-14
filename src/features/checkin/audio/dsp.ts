/**
 * Small, dependency-free signal-processing helpers for the microphone checks.
 * Everything runs on the device, on plain Float64Arrays, so it is unit-testable in Node.
 */

export type Signal = Float64Array;

interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

/** Butterworth 4th order = two cascaded 2nd-order sections with these Q values. */
const BUTTERWORTH_4_Q = [0.541196, 1.306563] as const;

function biquad(type: 'lowpass' | 'highpass', cutoffHz: number, sampleRate: number, q: number): Biquad {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = type === 'lowpass' ? (1 - cos) / 2 : (1 + cos) / 2;
  const b1 = type === 'lowpass' ? 1 - cos : -(1 + cos);
  return { b0: b0 / a0, b1: b1 / a0, b2: b0 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

function runBiquad(x: Signal, c: Biquad): Signal {
  const y = new Float64Array(x.length);
  // Start from a steady state at the first sample to avoid a start-up click.
  let x1 = x[0] ?? 0; let x2 = x1;
  const dc = (c.b0 + c.b1 + c.b2) / (1 + c.a1 + c.a2);
  let y1 = Number.isFinite(dc) ? x1 * dc : 0; let y2 = y1;
  for (let i = 0; i < x.length; i += 1) {
    const xi = x[i];
    const yi = c.b0 * xi + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi;
    y[i] = yi;
  }
  return y;
}

function reflectPad(x: Signal, pad: number): Signal {
  const n = x.length;
  const p = Math.min(pad, n - 1);
  const out = new Float64Array(n + 2 * p);
  for (let i = 0; i < p; i += 1) out[i] = 2 * x[0] - x[p - i];
  out.set(x, p);
  for (let i = 0; i < p; i += 1) out[p + n + i] = 2 * x[n - 1] - x[n - 2 - i];
  return out;
}

/** Zero-phase 4th-order Butterworth filter (forward + backward, so 8th-order magnitude). */
export function butterworth(x: Signal, type: 'lowpass' | 'highpass', cutoffHz: number, sampleRate: number): Signal {
  if (x.length < 4) return Float64Array.from(x);
  const pad = Math.min(x.length - 1, Math.round(sampleRate / cutoffHz) * 3);
  let y = reflectPad(x, pad);
  for (const q of BUTTERWORTH_4_Q) y = runBiquad(y, biquad(type, cutoffHz, sampleRate, q));
  y.reverse();
  for (const q of BUTTERWORTH_4_Q) y = runBiquad(y, biquad(type, cutoffHz, sampleRate, q));
  y.reverse();
  return y.slice(pad, pad + x.length);
}

export function bandpass(x: Signal, lowHz: number, highHz: number, sampleRate: number): Signal {
  return butterworth(butterworth(x, 'highpass', lowHz, sampleRate), 'lowpass', highHz, sampleRate);
}

/** Anti-aliased integer decimation to about `targetRate`. Returns the new signal and its exact rate. */
export function decimate(x: ArrayLike<number>, sampleRate: number, targetRate: number): { signal: Signal; rate: number } {
  const input = Float64Array.from(x);
  const factor = Math.max(1, Math.floor(sampleRate / targetRate));
  if (factor === 1) return { signal: input, rate: sampleRate };
  const rate = sampleRate / factor;
  const filtered = butterworth(input, 'lowpass', 0.45 * rate, sampleRate);
  const out = new Float64Array(Math.floor(filtered.length / factor));
  for (let i = 0; i < out.length; i += 1) out[i] = filtered[i * factor];
  return { signal: out, rate };
}

export function movingAverage(x: ArrayLike<number>, width: number): Signal {
  const n = x.length;
  const half = Math.max(0, Math.floor(width / 2));
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) prefix[i + 1] = prefix[i] + x[i];
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n, i + half + 1);
    out[i] = (prefix[hi] - prefix[lo]) / (hi - lo);
  }
  return out;
}

export function mean(x: ArrayLike<number>): number {
  if (x.length === 0) return NaN;
  let sum = 0;
  for (let i = 0; i < x.length; i += 1) sum += x[i];
  return sum / x.length;
}

export function standardDeviation(x: ArrayLike<number>): number {
  if (x.length < 2) return 0;
  const m = mean(x);
  let sum = 0;
  for (let i = 0; i < x.length; i += 1) sum += (x[i] - m) ** 2;
  return Math.sqrt(sum / (x.length - 1));
}

export function percentile(x: ArrayLike<number>, p: number): number {
  if (x.length === 0) return NaN;
  const sorted = Array.from(x).sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, (p / 100) * (sorted.length - 1)));
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

export const median = (x: ArrayLike<number>) => percentile(x, 50);

export function zscore(x: ArrayLike<number>): Signal {
  const m = mean(x);
  const sd = standardDeviation(x) || 1;
  return Float64Array.from(x, (v) => (v - m) / sd);
}

/**
 * Normalised autocorrelation for lags minLag..maxLag (inclusive), each lag
 * normalised by the energy of the two overlapping parts, so values are in [-1, 1].
 */
export function autocorrelation(x: Signal, minLag: number, maxLag: number): Signal {
  const out = new Float64Array(maxLag + 1);
  const n = x.length;
  for (let lag = Math.max(0, minLag); lag <= maxLag && lag < n; lag += 1) {
    let sum = 0; let e1 = 0; let e2 = 0;
    for (let i = 0; i + lag < n; i += 1) {
      const a = x[i]; const b = x[i + lag];
      sum += a * b; e1 += a * a; e2 += b * b;
    }
    out[lag] = e1 > 0 && e2 > 0 ? sum / Math.sqrt(e1 * e2) : 0;
  }
  return out;
}

/** Sub-sample position of a peak at index i by fitting a parabola through i-1, i, i+1. */
export function parabolicOffset(y: ArrayLike<number>, i: number): number {
  if (i <= 0 || i >= y.length - 1) return 0;
  const a = y[i - 1]; const b = y[i]; const c = y[i + 1];
  const denominator = a - 2 * b + c;
  if (denominator === 0) return 0;
  const offset = (0.5 * (a - c)) / denominator;
  return Math.max(-0.5, Math.min(0.5, offset));
}

export function isLocalMax(y: ArrayLike<number>, i: number): boolean {
  return i > 0 && i < y.length - 1 && y[i] >= y[i - 1] && y[i] > y[i + 1];
}

/** Local maxima, at least `minDistance` samples apart (taller peaks win), above `minHeight`. */
export function findPeaks(y: ArrayLike<number>, minDistance: number, minHeight = -Infinity): number[] {
  const candidates: number[] = [];
  for (let i = 1; i < y.length - 1; i += 1) if (y[i] >= minHeight && isLocalMax(y, i)) candidates.push(i);
  candidates.sort((a, b) => y[b] - y[a]);
  const taken: number[] = [];
  for (const index of candidates) {
    if (taken.every((other) => Math.abs(other - index) >= minDistance)) taken.push(index);
  }
  return taken.sort((a, b) => a - b);
}

/** Highest local maximum of `acf` between two lags, refined to sub-sample precision. */
export function bestLag(acf: Signal, minLag: number, maxLag: number): { lag: number; value: number } | null {
  let best = -1;
  for (let lag = Math.max(1, minLag); lag <= Math.min(maxLag, acf.length - 2); lag += 1) {
    if (isLocalMax(acf, lag) && (best < 0 || acf[lag] > acf[best])) best = lag;
  }
  if (best < 0) return null;
  return { lag: best + parabolicOffset(acf, best), value: acf[best] };
}

/** Value of a local maximum near `target` (within ±tolerance samples), or null. */
export function peakNear(acf: Signal, target: number, tolerance: number): { lag: number; value: number } | null {
  const lo = Math.max(1, Math.floor(target - tolerance));
  const hi = Math.min(acf.length - 2, Math.ceil(target + tolerance));
  let best = -1;
  for (let lag = lo; lag <= hi; lag += 1) if (isLocalMax(acf, lag) && (best < 0 || acf[lag] > acf[best])) best = lag;
  return best < 0 ? null : { lag: best + parabolicOffset(acf, best), value: acf[best] };
}

/** Fraction of samples at or beyond full scale (clipping). */
export function clippedFraction(x: ArrayLike<number>, limit = 0.99): number {
  if (x.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < x.length; i += 1) if (Math.abs(x[i]) >= limit) count += 1;
  return count / x.length;
}

/** Frame-wise energy in dB (mean square), `frame` and `hop` in samples. */
export function frameEnergyDb(x: Signal, frame: number, hop: number): Signal {
  const count = Math.max(0, Math.floor((x.length - frame) / hop) + 1);
  const out = new Float64Array(count);
  for (let f = 0; f < count; f += 1) {
    let sum = 0;
    const start = f * hop;
    for (let i = start; i < start + frame; i += 1) sum += x[i] * x[i];
    out[f] = 10 * Math.log10(sum / frame + 1e-12);
  }
  return out;
}

export const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
export const round1 = (value: number) => Math.round(value * 10) / 10;

/** Down-sample a trace for drawing (max-abs per bucket keeps peaks visible). */
export function traceForDisplay(x: ArrayLike<number>, points: number): number[] {
  if (x.length <= points) return Array.from(x);
  const out: number[] = [];
  const bucket = x.length / points;
  for (let p = 0; p < points; p += 1) {
    let best = 0;
    const end = Math.min(x.length, Math.floor((p + 1) * bucket));
    for (let i = Math.floor(p * bucket); i < end; i += 1) if (Math.abs(x[i]) > Math.abs(best)) best = x[i];
    out.push(best);
  }
  return out;
}
