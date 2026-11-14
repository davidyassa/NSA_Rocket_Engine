/**
 * Breathing (respiratory) rate from the camera pulse signal, without extra hardware.
 *
 * Each breath modulates the pulse wave in three ways (the standard PPG approach):
 *  - baseline wander (BW): the pulse wave's midline drifts up and down,
 *  - amplitude modulation (AM): beats get slightly stronger and weaker,
 *  - frequency modulation (FM): heart rate speeds up on the in-breath (respiratory
 *    sinus arrhythmia), so inter-beat intervals oscillate.
 * We estimate a rate from each, and only report a result when at least two agree
 * within a few breaths per minute (fusion makes PPG-derived breathing rate far
 * more reliable than any single modulation). Pure and deterministic for testing.
 */

export interface BvpSample { t: number; v: number }
export interface BeatEvent { t: number; ibi: number }
export interface BeatFeature { t: number; ibi: number; amplitude: number; midline: number }

export const BREATHING = {
  minBrpm: 6,
  maxBrpm: 36,
  minSeconds: 30,
  minBeats: 25,
  resampleHz: 4,
  agreeBrpm: 3,
  minQuality: 0.3,
} as const;

export const BREATHING_ALGORITHM = 'camera pulse wave · respiratory modulation fusion (BW + AM + FM), local';

/** Peak amplitude and midline for each heartbeat, from the pulse wave around the beat time. */
export function beatFeatures(bvp: readonly BvpSample[], beats: readonly BeatEvent[]): BeatFeature[] {
  const out: BeatFeature[] = [];
  let j = 0;
  for (let k = 1; k < beats.length; k += 1) {
    const start = beats[k - 1].t;
    const end = beats[k].t;
    // The window must span exactly one beat; a gap means the detector skipped one.
    if (end - start > beats[k].ibi * 1.3 + 50) continue;
    while (j < bvp.length && bvp[j].t < start) j += 1;
    let peak = -Infinity;
    let trough = Infinity;
    for (let i = j; i < bvp.length && bvp[i].t <= end + 60; i += 1) {
      if (bvp[i].v > peak) peak = bvp[i].v;
      if (bvp[i].t <= end && bvp[i].v < trough) trough = bvp[i].v;
    }
    if (!Number.isFinite(peak) || !Number.isFinite(trough)) continue;
    out.push({ t: end, ibi: beats[k].ibi, amplitude: peak - trough, midline: (peak + trough) / 2 });
  }
  return out;
}

function resample(times: number[], values: number[], hz: number): number[] {
  if (times.length < 2) return [];
  const step = 1000 / hz;
  const out: number[] = [];
  let j = 0;
  for (let t = times[0]; t <= times[times.length - 1]; t += step) {
    while (j < times.length - 2 && times[j + 1] < t) j += 1;
    const span = times[j + 1] - times[j] || 1;
    const k = Math.min(1, Math.max(0, (t - times[j]) / span));
    out.push(values[j] + (values[j + 1] - values[j]) * k);
  }
  return out;
}

/** Remove the mean and any linear drift, then normalise. */
function detrend(values: number[]): number[] {
  const n = values.length;
  if (n < 3) return values.map(() => 0);
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0; let den = 0;
  values.forEach((v, i) => { num += (i - xMean) * (v - yMean); den += (i - xMean) ** 2; });
  const slope = den ? num / den : 0;
  const residual = values.map((v, i) => v - (yMean + slope * (i - xMean)));
  const sd = Math.sqrt(residual.reduce((s, v) => s + v * v, 0) / n) || 1;
  return residual.map((v) => v / sd);
}

/** Dominant breathing period by autocorrelation within 6–36 breaths/min. */
export function dominantRate(signal: number[], hz: number): { brpm: number | null; quality: number } {
  const n = signal.length;
  const minLag = Math.floor((hz * 60) / BREATHING.maxBrpm);
  const maxLag = Math.min(n - 2, Math.ceil((hz * 60) / BREATHING.minBrpm));
  if (maxLag <= minLag + 1) return { brpm: null, quality: 0 };
  const energy = signal.reduce((s, v) => s + v * v, 0) || 1;
  const ac: number[] = [];
  for (let lag = 0; lag <= maxLag + 1; lag += 1) {
    let sum = 0;
    for (let i = 0; i + lag < n; i += 1) sum += signal[i] * signal[i + lag];
    ac.push(sum / energy);
  }
  let best = -1; let bestLag = -1;
  for (let lag = Math.max(minLag, 1); lag <= maxLag; lag += 1) {
    if (ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] > best) { best = ac[lag]; bestLag = lag; }
  }
  if (bestLag < 0 || best <= 0) return { brpm: null, quality: 0 };
  const y0 = ac[bestLag - 1]; const y1 = ac[bestLag]; const y2 = ac[bestLag + 1];
  const denom = y0 - 2 * y1 + y2;
  const offset = denom === 0 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (y0 - y2) / denom));
  const quality = Math.max(0, Math.min(1, best * (n / (n - bestLag))));
  return { brpm: 60 / ((bestLag + offset) / hz), quality };
}

export interface BreathingResult {
  ready: boolean;
  brpm: number | null;
  quality: number;
  seconds: number;
  beats: number;
  methods: { bw: number | null; am: number | null; fm: number | null };
  reason: 'collecting' | 'disagree' | 'weak' | 'ready';
}

/** Drop beats whose interval is far from the local median (missed or extra beats, movement). */
export function rejectArtifacts(features: readonly BeatFeature[]): BeatFeature[] {
  return features.filter((f, i) => {
    const near = features.slice(Math.max(0, i - 5), i + 6).map((n) => n.ibi).sort((a, b) => a - b);
    const median = near[Math.floor(near.length / 2)];
    return f.ibi >= 300 && f.ibi <= 2000 && Math.abs(f.ibi - median) <= 0.3 * median;
  });
}

export function estimateBreathing(allFeatures: readonly BeatFeature[]): BreathingResult {
  const features = rejectArtifacts(allFeatures);
  const seconds = features.length > 1 ? (features[features.length - 1].t - features[0].t) / 1000 : 0;
  const base = { seconds, beats: features.length, methods: { bw: null, am: null, fm: null } };
  if (seconds < BREATHING.minSeconds || features.length < BREATHING.minBeats) {
    return { ...base, ready: false, brpm: null, quality: 0, reason: 'collecting' };
  }
  const times = features.map((f) => f.t);
  const hz = BREATHING.resampleHz;
  const series = {
    bw: features.map((f) => f.midline),
    am: features.map((f) => f.amplitude),
    fm: features.map((f) => f.ibi),
  };
  const results = Object.fromEntries(Object.entries(series).map(([key, values]) =>
    [key, dominantRate(detrend(resample(times, values, hz)), hz)])) as Record<'bw' | 'am' | 'fm', { brpm: number | null; quality: number }>;
  const methods = { bw: results.bw.brpm, am: results.am.brpm, fm: results.fm.brpm };
  const usable = (['bw', 'am', 'fm'] as const)
    .map((key) => results[key])
    .filter((r): r is { brpm: number; quality: number } => r.brpm !== null && r.quality >= BREATHING.minQuality);
  if (usable.length < 2) {
    return { ...base, methods, ready: false, brpm: null, quality: usable[0]?.quality ?? 0, reason: 'weak' };
  }
  // Largest group of estimates that agree within the tolerance.
  let bestGroup: typeof usable = [];
  for (const anchor of usable) {
    const group = usable.filter((r) => Math.abs(r.brpm - anchor.brpm) <= BREATHING.agreeBrpm);
    if (group.length > bestGroup.length) bestGroup = group;
  }
  const quality = bestGroup.reduce((s, r) => s + r.quality, 0) / Math.max(1, bestGroup.length);
  if (bestGroup.length < 2) {
    return { ...base, methods, ready: false, brpm: null, quality, reason: 'disagree' };
  }
  const sorted = bestGroup.map((r) => r.brpm).sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return { ...base, methods, ready: true, brpm: Math.round(median), quality, reason: 'ready' };
}

/** Everyday wording for a breathing-rate result (adult resting range 12–20 per minute). */
export function explainBreathing(brpm: number): { verdict: 'usual' | 'low' | 'high'; text: string } {
  if (brpm < 12) return { verdict: 'low', text: 'Slower than the usual resting range for adults (12–20 breaths a minute). Measure again; tell your crew medical officer if you feel drowsy or short of breath.' };
  if (brpm > 20) return { verdict: 'high', text: 'Faster than the usual resting range for adults (12–20 breaths a minute). Rest quietly and measure again; tell your crew medical officer if you feel short of breath.' };
  return { verdict: 'usual', text: 'Inside the usual resting range for adults (12–20 breaths a minute).' };
}
