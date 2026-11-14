import type { BvpSample } from './breathingRate';
import { median } from './pulseQuality';

export const BVP_BREATHING_WINDOW_MS = 30_000;
export const BVP_BREATHING_MIN_MS = 25_000;
export const BVP_BREATHING_ALGORITHM = 'Camera BVP, linear detrend, 0.1–0.5 Hz bandpass and zero-crossing intervals';

const SAMPLE_HZ = 20;
const STEP_MS = 1000 / SAMPLE_HZ;
const MAX_GAP_MS = 350;
const LOW_HZ = 0.1;
const HIGH_HZ = 0.5;
const EDGE_SAMPLES = 2 * SAMPLE_HZ;

function detrend(values: number[]): number[] {
  const center = (values.length - 1) / 2;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < values.length; i += 1) {
    covariance += (i - center) * (values[i] - mean);
    variance += (i - center) ** 2;
  }
  const slope = covariance / variance;
  return values.map((value, i) => value - mean - slope * (i - center));
}

/** A Butterworth biquad sampled at SAMPLE_HZ. */
function filter(values: number[], cutoff: number, q: number, highPass: boolean): number[] {
  const angle = 2 * Math.PI * cutoff / SAMPLE_HZ;
  const cosine = Math.cos(angle);
  const alpha = Math.sin(angle) / (2 * q);
  const b0 = (highPass ? 1 + cosine : 1 - cosine) / (2 * (1 + alpha));
  const b1 = (highPass ? -2 : 2) * b0;
  const a1 = -2 * cosine / (1 + alpha);
  const a2 = (1 - alpha) / (1 + alpha);
  let x1 = values[0];
  let x2 = x1;
  let y1 = highPass ? 0 : x1;
  let y2 = y1;
  return values.map(x => {
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  });
}

function bandpass(values: number[]): number[] {
  // Reflect about each endpoint to limit filter transients on short windows.
  const padding = 10 * SAMPLE_HZ;
  const last = values.length - 1;
  const start = values.slice(1, padding + 1).reverse().map(value => 2 * values[0] - value);
  const end = values.slice(last - padding, last).reverse().map(value => 2 * values[last] - value);
  let signal = [...start, ...values, ...end];
  // Two biquads per edge give a fourth-order Butterworth response. Filtering
  // in both directions removes phase delay and further attenuates the pulse.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const q of [0.5411961, 1.306563]) {
      signal = filter(signal, HIGH_HZ, q, false);
      signal = filter(signal, LOW_HZ, q, true);
    }
    signal.reverse();
  }
  return signal.slice(padding, padding + values.length);
}

export function estimateBvpBreathing(samples: readonly BvpSample[]): {
  brpm: number;
  quality: number;
  seconds: number;
} | null {
  const latest = samples.at(-1)?.t;
  if (latest === undefined || !Number.isFinite(latest)) return null;
  const recent = samples.filter(sample => sample.t >= latest - BVP_BREATHING_WINDOW_MS);
  const first = recent[0]?.t;
  if (first === undefined || latest - first < BVP_BREATHING_MIN_MS) return null;
  const seconds = (latest - first) / 1000;
  if (recent.length < seconds * 10) return null;
  for (let i = 0; i < recent.length; i += 1) {
    if (!Number.isFinite(recent[i].t) || !Number.isFinite(recent[i].v)) return null;
    if (i > 0) {
      const gap = recent[i].t - recent[i - 1].t;
      if (gap <= 0 || gap > MAX_GAP_MS) return null;
    }
  }

  const values: number[] = [];
  let index = 0;
  for (let t = first; t <= latest; t += STEP_MS) {
    while (recent[index + 1].t < t) index += 1;
    const left = recent[index];
    const right = recent[index + 1];
    const fraction = (t - left.t) / (right.t - left.t);
    values.push(left.v + (right.v - left.v) * fraction);
  }
  const detrended = detrend(values);
  const filtered = bandpass(detrended).slice(EDGE_SAMPLES, -EDGE_SAMPLES);
  const energy = (signal: number[]) => signal.reduce((sum, value) => sum + value ** 2, 0);
  const rawPower = energy(detrended.slice(EDGE_SAMPLES, -EDGE_SAMPLES));
  const breathingPower = energy(filtered);
  // An attenuated pulse or numerical residue on its own is insufficient.
  if (rawPower <= 1e-12 || breathingPower / rawPower < 0.005) return null;

  const crossings: number[] = [];
  for (let i = 1; i < filtered.length; i += 1) {
    const left = filtered[i - 1];
    const right = filtered[i];
    if (left < 0 && right >= 0) crossings.push((i - 1 - left / (right - left)) / SAMPLE_HZ);
  }
  const intervals = crossings.slice(1).map((crossing, i) => crossing - crossings[i]);
  if (intervals.length === 0) return null;
  const period = median(intervals);
  const rate = 60 / period;
  const brpm = Math.round(rate);
  if (brpm < LOW_HZ * 60 || brpm > HIGH_HZ * 60) return null;
  const maxDeviation = Math.max(...intervals.map(interval => Math.abs(interval - period) / period));
  if (maxDeviation > 0.25) return null;
  return { brpm, quality: (1 - maxDeviation) * Math.min(1, breathingPower / (0.04 * rawPower)), seconds };
}
