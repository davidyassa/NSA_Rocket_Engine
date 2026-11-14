/**
 * Respiratory signal processing (pure, deterministic, tested on synthetic ground truth).
 *
 * Every step uses the real sample timestamps: camera frames arrive irregularly, so the
 * signal is first resampled onto a uniform grid, and gaps longer than MAX_GAP_S are
 * reported instead of being interpolated across.
 *
 *   raw (t, value) ─▶ resample 10 Hz ─▶ zero-phase Butterworth band-pass 0.1–0.7 Hz
 *                 ─▶ spectrum (Hann, fine grid) + autocorrelation ─▶ cycles (zero crossings)
 */

export interface Sample { t: number; v: number }

/** Uniform analysis rate. 10 Hz is 7x the highest breathing frequency we accept. */
export const ANALYSIS_HZ = 10;
/** Breathing band: 6–42 breaths per minute. */
export const BAND = { lowHz: 0.1, highHz: 0.7 } as const;
/** Longer camera gaps than this break the signal into a gap (not interpolated). */
export const MAX_GAP_S = 0.6;

export interface Uniform {
  t0: number;
  hz: number;
  values: Float64Array;
  /** true where the sample was interpolated across a real gap > MAX_GAP_S */
  gap: Uint8Array;
}

/** Linear interpolation of irregular samples onto a uniform grid (t in ms). */
export function resample(samples: readonly Sample[], hz = ANALYSIS_HZ): Uniform | null {
  if (samples.length < 2) return null;
  const t0 = samples[0].t;
  const t1 = samples[samples.length - 1].t;
  const n = Math.floor(((t1 - t0) / 1000) * hz) + 1;
  if (n < 2) return null;
  const values = new Float64Array(n);
  const gap = new Uint8Array(n);
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    const t = t0 + (i * 1000) / hz;
    while (j < samples.length - 2 && samples[j + 1].t < t) j += 1;
    const a = samples[j];
    const b = samples[j + 1];
    const span = b.t - a.t;
    const k = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
    values[i] = a.v + (b.v - a.v) * k;
    if (span > MAX_GAP_S * 1000) gap[i] = 1;
  }
  return { t0, hz, values, gap };
}

export function mean(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i += 1) s += x[i];
  return x.length ? s / x.length : 0;
}

export function std(x: ArrayLike<number>): number {
  const m = mean(x);
  let s = 0;
  for (let i = 0; i < x.length; i += 1) s += (x[i] - m) ** 2;
  return x.length > 1 ? Math.sqrt(s / (x.length - 1)) : 0;
}

export function median(values: ArrayLike<number>): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median absolute deviation, scaled to estimate a standard deviation. */
export function mad(values: ArrayLike<number>): number {
  const m = median(values);
  return 1.4826 * median(Array.from(values, (v) => Math.abs(v - m)));
}

/** Remove the least-squares line (baseline drift). */
export function detrend(x: ArrayLike<number>): Float64Array {
  const n = x.length;
  const out = new Float64Array(n);
  if (!n) return out;
  const c = (n - 1) / 2;
  const m = mean(x);
  let cov = 0;
  let varT = 0;
  for (let i = 0; i < n; i += 1) { cov += (i - c) * (x[i] - m); varT += (i - c) ** 2; }
  const slope = varT ? cov / varT : 0;
  for (let i = 0; i < n; i += 1) out[i] = x[i] - m - slope * (i - c);
  return out;
}

/** One RBJ Butterworth biquad section, applied causally. */
function biquad(x: Float64Array, hz: number, cutoff: number, q: number, highPass: boolean): Float64Array {
  const w = (2 * Math.PI * cutoff) / hz;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = (highPass ? (1 + cos) / 2 : (1 - cos) / 2) / a0;
  const b1 = (highPass ? -(1 + cos) : 1 - cos) / a0;
  const b2 = b0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const y = new Float64Array(x.length);
  let x1 = x[0]; let x2 = x[0];
  let y1 = highPass ? 0 : x[0]; let y2 = y1;
  for (let i = 0; i < x.length; i += 1) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/**
 * Zero-phase 4th-order Butterworth band-pass (two 2nd-order sections per edge, run
 * forward and backward). Zero phase matters: inspiration/expiration timing is read
 * from this signal, and a causal filter would shift every cycle boundary.
 */
export function bandpass(x: ArrayLike<number>, hz = ANALYSIS_HZ, lowHz: number = BAND.lowHz, highHz: number = BAND.highHz): Float64Array {
  const n = x.length;
  if (n < 4) return Float64Array.from(x);
  // Odd reflection at both ends limits start-up transients on short windows.
  const pad = Math.min(n - 1, Math.round(hz / lowHz));
  const ext = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i += 1) ext[i] = 2 * x[0] - x[pad - i];
  for (let i = 0; i < n; i += 1) ext[pad + i] = x[i];
  for (let i = 0; i < pad; i += 1) ext[pad + n + i] = 2 * x[n - 1] - x[n - 2 - i];
  let y: Float64Array = ext;
  for (let pass = 0; pass < 2; pass += 1) {
    for (const q of [0.5411961, 1.306563]) {
      y = biquad(y, hz, highHz, q, false);
      y = biquad(y, hz, lowHz, q, true);
    }
    y.reverse();
  }
  return y.slice(pad, pad + n);
}

export interface Spectrum {
  /** dominant frequency in Hz (parabolic interpolation between bins), or null */
  peakHz: number | null;
  /** power near the peak and its first harmonic, over the rest of the band (dB) */
  snrDb: number;
  /** peak power over the second-highest separate peak (≥ 1) */
  prominence: number;
  freqs: Float64Array;
  power: Float64Array;
}

/**
 * Power spectrum on a fine frequency grid (direct DFT with a Hann window). The grid
 * is finer than 1/T so short windows still give sub-breath resolution; resolution
 * is ultimately limited by the window length, which the quality engine checks.
 */
export function spectrum(x: ArrayLike<number>, hz = ANALYSIS_HZ, lowHz: number = BAND.lowHz, highHz: number = BAND.highHz, stepHz = 0.005): Spectrum {
  const n = x.length;
  const bins = Math.max(2, Math.round((highHz - lowHz) / stepHz) + 1);
  const freqs = new Float64Array(bins);
  const power = new Float64Array(bins);
  if (n < 8) return { peakHz: null, snrDb: -Infinity, prominence: 1, freqs, power };
  const w = new Float64Array(n);
  const m = mean(x);
  for (let i = 0; i < n; i += 1) w[i] = (x[i] - m) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  let best = 0;
  for (let k = 0; k < bins; k += 1) {
    const f = lowHz + k * stepHz;
    freqs[k] = f;
    const step = (2 * Math.PI * f) / hz;
    let re = 0; let im = 0;
    for (let i = 0; i < n; i += 1) { re += w[i] * Math.cos(step * i); im -= w[i] * Math.sin(step * i); }
    power[k] = re * re + im * im;
    if (power[k] > power[best]) best = k;
  }
  const total = power.reduce((s, p) => s + p, 0);
  if (!(total > 0)) return { peakHz: null, snrDb: -Infinity, prominence: 1, freqs, power };
  let peakHz = freqs[best];
  if (best > 0 && best < bins - 1) {
    const a = power[best - 1]; const b = power[best]; const c = power[best + 1];
    const d = a - 2 * b + c;
    if (d < 0) peakHz += (0.5 * (a - c) / d) * stepHz;
  }
  // Signal = within ±0.04 Hz of the peak and of its first harmonic.
  const near = (f: number, center: number) => Math.abs(f - center) <= 0.04;
  let sig = 0;
  for (let k = 0; k < bins; k += 1) if (near(freqs[k], peakHz) || near(freqs[k], 2 * peakHz)) sig += power[k];
  const noise = Math.max(total - sig, total * 1e-6);
  // Second-highest local maximum outside the main lobe.
  let second = 0;
  for (let k = 1; k < bins - 1; k += 1) {
    if (Math.abs(freqs[k] - peakHz) <= 0.06) continue;
    if (power[k] >= power[k - 1] && power[k] >= power[k + 1]) second = Math.max(second, power[k]);
  }
  return { peakHz, snrDb: 10 * Math.log10(sig / noise), prominence: second > 0 ? power[best] / second : 100, freqs, power };
}

/**
 * Periodicity from the normalized autocorrelation: the strongest peak at a lag inside
 * the breathing band. Returns its period (s) and height (0–1; 1 = perfectly periodic).
 */
export function autocorrelation(x: ArrayLike<number>, hz = ANALYSIS_HZ, lowHz: number = BAND.lowHz, highHz: number = BAND.highHz): { periodS: number | null; strength: number } {
  const n = x.length;
  const m = mean(x);
  let r0 = 0;
  for (let i = 0; i < n; i += 1) r0 += (x[i] - m) ** 2;
  if (!(r0 > 0)) return { periodS: null, strength: 0 };
  const minLag = Math.max(1, Math.floor(hz / highHz));
  const maxLag = Math.min(n - 2, Math.ceil(hz / lowHz));
  const r = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1 && lag < n; lag += 1) {
    let s = 0;
    for (let i = 0; i + lag < n; i += 1) s += (x[i] - m) * (x[i + lag] - m);
    // Unbiased: compensate for fewer overlapping samples at long lags.
    r[lag] = (s / (n - lag)) / (r0 / n);
  }
  // The first strong peak is the period; later peaks at 2T, 3T are as high for a
  // periodic signal and must not be mistaken for it.
  const peaks: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag += 1) if (r[lag] > r[lag - 1] && r[lag] >= r[lag + 1]) peaks.push(lag);
  if (!peaks.length) return { periodS: null, strength: 0 };
  const top = Math.max(...peaks.map((lag) => r[lag]));
  const bestLag = peaks.find((lag) => r[lag] >= 0.8 * top)!;
  // Parabolic refinement of the lag.
  let lag = bestLag;
  const d = r[bestLag - 1] - 2 * r[bestLag] + r[bestLag + 1];
  if (d < 0) lag += (0.5 * (r[bestLag - 1] - r[bestLag + 1])) / d;
  return { periodS: lag / hz, strength: Math.max(0, Math.min(1, r[bestLag])) };
}

/**
 * Re-time cycles on a wider-band signal. The breathing band (≤ 0.7 Hz) removes the
 * harmonics that make inspiration and expiration differ in length, so cycles found on
 * it are re-timed on a 0.05–2 Hz version: the peak is that signal's maximum inside the
 * cycle, each trough its minimum within a quarter cycle of the original trough.
 */
export function retime(found: readonly Cycle[], wide: Float64Array, u: Pick<Uniform, 't0' | 'hz'>): Cycle[] {
  const idx = (t: number) => Math.round(((t - u.t0) * u.hz) / 1000);
  const at = (i: number) => u.t0 + (i * 1000) / u.hz;
  const argExt = (a: number, b: number, max: boolean) => {
    let best = Math.max(0, a);
    for (let i = Math.max(0, a); i <= Math.min(wide.length - 1, b); i += 1) if (max ? wide[i] > wide[best] : wide[i] < wide[best]) best = i;
    return best;
  };
  return found.map((c) => {
    const s = idx(c.start); const e = idx(c.end); const q = Math.max(1, Math.round((e - s) / 4));
    const start = argExt(s - q, s + q, false);
    const end = argExt(e - q, e + q, false);
    const peak = argExt(start + 1, end - 1, true);
    if (!(start < peak && peak < end)) return c;
    return { start: at(start), peak: at(peak), end: at(end), amplitude: c.amplitude };
  });
}

export interface Cycle {
  /** start (trough), peak and end (next trough), in ms on the original clock */
  start: number;
  peak: number;
  end: number;
  /** peak-to-trough excursion of the filtered signal (same units as the input) */
  amplitude: number;
}

/**
 * Breathing cycles from the band-passed signal: trough → peak → trough, where each
 * extremum is the extreme between consecutive zero crossings. A hysteresis of
 * `minFraction` of the robust amplitude ignores small wiggles, and cycles shorter than
 * the band allows are merged away. Cycles touching a gap or an artifact are dropped.
 */
export function cycles(filtered: Float64Array, u: Pick<Uniform, 't0' | 'hz'>, blocked?: Uint8Array, minFraction = 0.25): Cycle[] {
  const n = filtered.length;
  if (n < 4) return [];
  const scale = mad(filtered) || std(filtered);
  const hyst = minFraction * scale;
  // Alternating extrema with hysteresis.
  const ext: { i: number; up: boolean }[] = [];
  let state: 'up' | 'down' | null = null;
  let idx = 0;
  for (let i = 1; i < n; i += 1) {
    if (state === null) {
      if (filtered[i] - filtered[0] > hyst) { state = 'up'; idx = i; } else if (filtered[0] - filtered[i] > hyst) { state = 'down'; idx = i; }
      continue;
    }
    if (state === 'up') {
      if (filtered[i] > filtered[idx]) idx = i;
      else if (filtered[idx] - filtered[i] > hyst) { ext.push({ i: idx, up: true }); state = 'down'; idx = i; }
    } else {
      if (filtered[i] < filtered[idx]) idx = i;
      else if (filtered[i] - filtered[idx] > hyst) { ext.push({ i: idx, up: false }); state = 'up'; idx = i; }
    }
  }
  const at = (i: number) => u.t0 + (i * 1000) / u.hz;
  const minLen = (1 / BAND.highHz) * u.hz * 0.8;
  const maxLen = (1 / BAND.lowHz) * u.hz * 1.2;
  const out: Cycle[] = [];
  for (let k = 0; k + 2 < ext.length; k += 1) {
    const [a, p, b] = [ext[k], ext[k + 1], ext[k + 2]];
    if (a.up || !p.up || b.up) continue;
    const len = b.i - a.i;
    if (len < minLen || len > maxLen) continue;
    if (blocked) {
      let bad = false;
      for (let i = a.i; i <= b.i; i += 1) if (blocked[i]) { bad = true; break; }
      if (bad) continue;
    }
    out.push({ start: at(a.i), peak: at(p.i), end: at(b.i), amplitude: filtered[p.i] - Math.min(filtered[a.i], filtered[b.i]) });
  }
  return out;
}
