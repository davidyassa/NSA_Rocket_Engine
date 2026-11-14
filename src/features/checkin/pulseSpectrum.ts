/**
 * Fine-resolution heart rate from the camera pulse wave.
 *
 * The camera model reports heart rate from a fixed 450-sample spectrum, which
 * at 30 fps has bins about 4 bpm apart, so a true 82 can come out as 80 or 84.
 * Here we take the same pulse wave with its real frame times (so a 24 fps
 * laptop camera is handled correctly), and search the spectrum in 0.02 bpm
 * steps. Quality is the standard rPPG signal-to-noise ratio: power near the
 * heart-rate peak and its first harmonic versus everything else in the band
 * (de Haan & Jeanne, IEEE TBME 2013). Pure and deterministic for testing.
 */
import type { BvpSample } from './breathingRate';
import { PULSE_ALGORITHM, type CameraPulseEstimate } from './pulseQuality';

export const PULSE_FINE_ALGORITHM = `${PULSE_ALGORITHM} + fine-resolution spectrum on real camera frame times (0.02 bpm search), local`;

export const SPECTRUM = {
  /** Analysis window. Long enough for ~0.1 bpm stability, short enough to follow real changes. */
  windowMs: 12_000,
  /**
   * The camera model's pulse wave needs a few seconds to settle after it locks on
   * to a face; that start-up stretch reads 2–3 bpm high (measured on a 24 fps test
   * video of a known 82 bpm pulse). It is left out of every estimate.
   */
  warmupMs: 5_000,
  minSeconds: 7,
  resampleHz: 30,
  minBpm: 42,
  maxBpm: 200,
  coarseStep: 0.5,
  fineStep: 0.02,
} as const;

export interface SpectralHeartRate {
  bpm: number;
  /** signal-to-noise ratio in dB; above ~3 dB the pulse clearly dominates */
  snrDb: number;
  seconds: number;
}

function resample(samples: readonly BvpSample[], hz: number): number[] {
  const out: number[] = [];
  const step = 1000 / hz;
  let j = 0;
  for (let t = samples[0].t; t <= samples[samples.length - 1].t; t += step) {
    while (j < samples.length - 2 && samples[j + 1].t < t) j += 1;
    const a = samples[j]; const b = samples[j + 1] ?? a;
    const span = b.t - a.t || 1;
    const k = Math.min(1, Math.max(0, (t - a.t) / span));
    out.push(a.v + (b.v - a.v) * k);
  }
  return out;
}

/** Remove slow drift (anything below ~40 bpm) with a 1.5 s moving average, then apply a Hann window. */
function prepare(values: number[], hz: number): number[] {
  const half = Math.round(hz * 0.75);
  const prefix = [0];
  for (const v of values) prefix.push(prefix[prefix.length - 1] + v);
  const n = values.length;
  return values.map((v, i) => {
    const lo = Math.max(0, i - half); const hi = Math.min(n, i + half + 1);
    const detrended = v - (prefix[hi] - prefix[lo]) / (hi - lo);
    return detrended * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  });
}

function powerAt(signal: number[], hz: number, bpm: number): number {
  const w = (2 * Math.PI * (bpm / 60)) / hz;
  let re = 0; let im = 0;
  for (let i = 0; i < signal.length; i += 1) { re += signal[i] * Math.cos(w * i); im -= signal[i] * Math.sin(w * i); }
  return re * re + im * im;
}

export function spectralHeartRate(samples: readonly BvpSample[], windowMs: number = SPECTRUM.windowMs): SpectralHeartRate | null {
  if (samples.length < 2) return null;
  const end = samples[samples.length - 1].t;
  const settled = samples[0].t + SPECTRUM.warmupMs;
  const recent = samples.filter((s) => s.t >= Math.max(settled, end - windowMs) && Number.isFinite(s.v));
  if (recent.length < 2) return null;
  const seconds = (recent[recent.length - 1].t - recent[0].t) / 1000;
  if (seconds < SPECTRUM.minSeconds || recent.length < seconds * 10) return null;

  const hz = SPECTRUM.resampleHz;
  const signal = prepare(resample(recent, hz), hz);
  const coarse: { bpm: number; p: number }[] = [];
  for (let bpm = SPECTRUM.minBpm; bpm <= SPECTRUM.maxBpm; bpm += SPECTRUM.coarseStep) coarse.push({ bpm, p: powerAt(signal, hz, bpm) });
  let best = coarse[0];
  for (const c of coarse) if (c.p > best.p) best = c;
  // Refine around the coarse peak.
  let peakBpm = best.bpm; let peakP = best.p;
  for (let bpm = best.bpm - SPECTRUM.coarseStep; bpm <= best.bpm + SPECTRUM.coarseStep; bpm += SPECTRUM.fineStep) {
    const p = powerAt(signal, hz, bpm);
    if (p > peakP) { peakP = p; peakBpm = bpm; }
  }
  // SNR: ±6 bpm around the peak and ±12 bpm around its first harmonic count as signal.
  let signalPower = 0; let noisePower = 0;
  for (let bpm = SPECTRUM.minBpm; bpm <= 240; bpm += SPECTRUM.coarseStep) {
    const p = bpm <= SPECTRUM.maxBpm ? coarse[Math.round((bpm - SPECTRUM.minBpm) / SPECTRUM.coarseStep)]?.p ?? powerAt(signal, hz, bpm) : powerAt(signal, hz, bpm);
    if (Math.abs(bpm - peakBpm) <= 6 || Math.abs(bpm - 2 * peakBpm) <= 12) signalPower += p; else noisePower += p;
  }
  const snrDb = 10 * Math.log10(signalPower / Math.max(noisePower, 1e-12));
  return { bpm: Math.round(peakBpm * 10) / 10, snrDb: Math.round(snrDb * 10) / 10, seconds };
}

export const FAST_PATH = {
  /** consecutive half-second estimates that must agree (~3 s) */
  agreeCount: 6,
  /** max spread across those estimates, bpm */
  agreeSpreadBpm: 1.5,
  /** still drifting (start-up or a real change) if first and last differ by more than this */
  maxDriftBpm: 0.8,
  minSnrDb: 3,
  /** settled signal analysed by the newest estimate, seconds (plus the 5 s warm-up) */
  minSeconds: 9.5,
  /** the camera model's own (coarser) heart rate must be within this of ours */
  modelAgreeBpm: 6,
  /**
   * When the camera model has no reading at all (its quality score is low), our own
   * estimate may stand alone, but only with a clearly stronger signal than usual.
   * A model reading that disagrees still blocks the result.
   */
  aloneSnrDb: 9,
} as const;

export interface SpectralHistoryEntry { bpm: number; snrDb: number; seconds: number }

/**
 * A reading is ready early when our fine-resolution estimate has been steady,
 * clean and in agreement with the camera model for about 3 seconds.
 */
export function assessSpectralHistory(history: readonly SpectralHistoryEntry[], modelHr: number | null): { ready: boolean; bpm: number | null; snrDb: number | null } {
  const last = history.slice(-FAST_PATH.agreeCount);
  if (last.length < FAST_PATH.agreeCount) return { ready: false, bpm: null, snrDb: null };
  const bpms = last.map((e) => e.bpm).sort((a, b) => a - b);
  const median = (bpms[2] + bpms[3]) / 2;
  const snrDb = Math.min(...last.map((e) => e.snrDb));
  const steady = bpms[bpms.length - 1] - bpms[0] <= FAST_PATH.agreeSpreadBpm;
  const clean = snrDb >= FAST_PATH.minSnrDb;
  const long = last[last.length - 1].seconds >= FAST_PATH.minSeconds;
  const settledTrend = Math.abs(last[last.length - 1].bpm - last[0].bpm) <= FAST_PATH.maxDriftBpm;
  const agrees = modelHr !== null && Math.abs(modelHr - median) <= FAST_PATH.modelAgreeBpm;
  const standsAlone = modelHr === null && snrDb >= FAST_PATH.aloneSnrDb;
  return { ready: steady && settledTrend && clean && long && (agrees || standsAlone), bpm: Math.round(median), snrDb };
}

/**
 * The number shown to the astronaut. Prefer the fine-resolution estimate whenever
 * it is clean and agrees with the camera model; otherwise keep the model's reading.
 */
export function finalHeartRate(
  model: CameraPulseEstimate | null,
  history: readonly SpectralHistoryEntry[],
  info: { sqi: number; sampleCount: number; capturedAt: Date; /** running camera-model HR, for agreement */ modelHr?: number | null },
): CameraPulseEstimate | null {
  const fast = assessSpectralHistory(history, model?.bpm ?? info.modelHr ?? null);
  const clean = history.slice(-FAST_PATH.agreeCount).filter((e) => e.snrDb >= FAST_PATH.minSnrDb).map((e) => e.bpm).sort((a, b) => a - b);
  const cleanMedian = clean.length >= 3 ? clean[Math.floor(clean.length / 2)] : null;
  const capturedAtUtc = info.capturedAt.toISOString();
  if (model && cleanMedian !== null && Math.abs(cleanMedian - model.bpm) <= FAST_PATH.modelAgreeBpm) {
    return { ...model, bpm: Math.round(cleanMedian), algorithm: PULSE_FINE_ALGORITHM };
  }
  if (model) return model;
  if (fast.ready && fast.bpm !== null) {
    return { bpm: fast.bpm, sqi: info.sqi, capturedAtUtc, sampleCount: info.sampleCount, algorithm: PULSE_FINE_ALGORITHM };
  }
  return null;
}
