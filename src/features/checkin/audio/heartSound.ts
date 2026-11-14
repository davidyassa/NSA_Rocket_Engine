/**
 * Heart rate from heart sounds (phonocardiogram) recorded by a phone microphone
 * pressed against the chest.
 *
 * Method (published, deterministic):
 *  1. Down-sample to ~1 kHz and band-pass 25–400 Hz, where S1/S2 heart sounds live
 *     (Springer et al., IEEE TBME 2016).
 *  2. Remove friction spikes: 500 ms windows whose peak is > 3× the median window peak
 *     are silenced (Schmidt et al., Physiol Meas 2010).
 *  3. Average Shannon energy envelope, 20 ms frames every 10 ms (Liang et al. 1997).
 *  4. Heart cycle length = the highest autocorrelation peak of the envelope between
 *     0.33 s and 1.5 s (40–180 bpm), refined to sub-sample precision
 *     (the Springer/Schmidt heart-rate step).
 *  5. The same estimate is repeated on 8-second windows; the reading is shown only when the
 *     windows agree, so a single noisy stretch cannot produce a confident number.
 */
import {
  autocorrelation, bandpass, bestLag, clamp, clippedFraction, decimate, findPeaks, median,
  movingAverage, peakNear, percentile, round1, traceForDisplay, zscore, type Signal,
} from './dsp';

export const HEART_SOUND_ALGORITHM = 'Heart sounds · 25–400 Hz band-pass · Shannon-energy envelope · autocorrelation heart cycle (Springer 2016) · 8 s window agreement';

export interface HeartSoundResult {
  ok: boolean;
  /** Rounded beats per minute when ok. */
  bpm: number | null;
  /** Unrounded estimate from the whole recording. */
  bpmExact: number | null;
  /** 0–1: strength of the repeating heart-sound pattern × window agreement. */
  quality: number;
  /** Per-window heart-rate estimates (bpm). */
  windowBpm: number[];
  /** Largest minus smallest window estimate (bpm). */
  windowSpread: number | null;
  /** Fraction of the recording silenced as rubbing/friction noise. */
  spikeFraction: number;
  clipped: number;
  seconds: number;
  /** Envelope for drawing (z-scored) and the detected heart-sound peaks, in seconds. */
  trace: { values: number[]; seconds: number; markers: number[] };
  /** Band-passed heart sounds for playback (normalised to ±0.9) and their sample rate. */
  playback: { samples: Float32Array; sampleRate: number } | null;
  /** Plain reason when not ok. */
  problem: string | null;
}

const ENVELOPE_RATE = 100; // Hz (10 ms hop)
const MIN_LAG_S = 60 / 180;
const MAX_LAG_S = 60 / 40;
const WINDOW_S = 8;
const WINDOW_STEP_S = 2;
export const HEART_MIN_SECONDS = 12;
/** Readings are shown only when the 8 s windows agree within this many bpm. */
export const HEART_MAX_WINDOW_SPREAD = 8;
const MIN_PATTERN_STRENGTH = 0.3;

function removeSpikes(x: Signal, rate: number): { signal: Signal; fraction: number } {
  const window = Math.round(0.5 * rate);
  const count = Math.floor(x.length / window);
  if (count < 3) return { signal: x, fraction: 0 };
  const peaks = new Float64Array(count);
  for (let w = 0; w < count; w += 1) {
    let peak = 0;
    for (let i = w * window; i < (w + 1) * window; i += 1) peak = Math.max(peak, Math.abs(x[i]));
    peaks[w] = peak;
  }
  const limit = 3 * median(peaks);
  const out = Float64Array.from(x);
  let silenced = 0;
  for (let w = 0; w < count; w += 1) {
    if (peaks[w] > limit) {
      out.fill(0, w * window, (w + 1) * window);
      silenced += 1;
    }
  }
  return { signal: out, fraction: silenced / count };
}

/** Average Shannon energy envelope (Liang et al. 1997) at ENVELOPE_RATE. */
export function shannonEnvelope(x: Signal, rate: number): Signal {
  let peak = 0;
  for (let i = 0; i < x.length; i += 1) peak = Math.max(peak, Math.abs(x[i]));
  const scale = peak > 0 ? 1 / peak : 0;
  const frame = Math.round(0.02 * rate);
  const hop = Math.round(rate / ENVELOPE_RATE);
  const count = Math.max(0, Math.floor((x.length - frame) / hop) + 1);
  const envelope = new Float64Array(count);
  for (let f = 0; f < count; f += 1) {
    let sum = 0;
    for (let i = f * hop; i < f * hop + frame; i += 1) {
      const v = (x[i] * scale) ** 2;
      if (v > 1e-12) sum -= v * Math.log(v);
    }
    envelope[f] = sum / frame;
  }
  return zscore(movingAverage(envelope, 3));
}

/** Heart-cycle length (in envelope samples) from an envelope, optionally searched near a hint. */
function cycleLag(envelope: Signal, hint?: number): { lag: number; value: number } | null {
  const minLag = Math.round(MIN_LAG_S * ENVELOPE_RATE);
  const maxLag = Math.round(MAX_LAG_S * ENVELOPE_RATE);
  const acf = autocorrelation(envelope, 1, maxLag + 2);
  if (hint !== undefined) return peakNear(acf, hint, Math.max(3, hint * 0.2));
  const best = bestLag(acf, minLag, maxLag);
  if (!best) return null;
  // A strong peak at half the lag means the true cycle is shorter (the long lag skipped a beat).
  const half = best.lag / 2;
  if (half >= minLag) {
    const shorter = peakNear(acf, half, Math.max(2, half * 0.08));
    if (shorter && shorter.value >= 0.85 * best.value) return shorter;
  }
  return best;
}

export function analyzeHeartSound(samples: ArrayLike<number>, sampleRate: number): HeartSoundResult {
  const seconds = samples.length / sampleRate;
  const clipped = clippedFraction(samples);
  const empty: HeartSoundResult = {
    ok: false, bpm: null, bpmExact: null, quality: 0, windowBpm: [], windowSpread: null,
    spikeFraction: 0, clipped, seconds, trace: { values: [], seconds, markers: [] }, playback: null, problem: null,
  };
  if (seconds < HEART_MIN_SECONDS) return { ...empty, problem: `The recording was too short. Hold still for at least ${HEART_MIN_SECONDS} seconds.` };

  const { signal: down, rate } = decimate(samples, sampleRate, 1000);
  const filtered = bandpass(down, 25, Math.min(400, 0.45 * rate), rate);
  const { signal: clean, fraction: spikeFraction } = removeSpikes(filtered, rate);
  const envelope = shannonEnvelope(clean, rate);

  let peak = 0;
  for (let i = 0; i < clean.length; i += 1) peak = Math.max(peak, Math.abs(clean[i]));
  const playback = peak > 0 ? { samples: Float32Array.from(clean, (v) => (v / peak) * 0.9), sampleRate: rate } : null;

  const base = { ...empty, spikeFraction, playback, trace: { values: traceForDisplay(envelope, 600), seconds, markers: [] as number[] } };
  if (spikeFraction > 0.35) {
    return { ...base, problem: 'Too much rubbing or movement noise. Press the phone firmly in one place and stay still.' };
  }

  const whole = cycleLag(envelope);
  if (!whole || whole.value < MIN_PATTERN_STRENGTH) {
    return { ...base, quality: clamp(whole?.value ?? 0, 0, 1), problem: 'No steady heartbeat pattern was heard. Move the phone a little toward the left of your breastbone, press firmly and keep quiet.' };
  }
  const bpmExact = (60 * ENVELOPE_RATE) / whole.lag;

  const windowBpm: number[] = [];
  const windowLength = WINDOW_S * ENVELOPE_RATE;
  for (let start = 0; start + windowLength <= envelope.length; start += WINDOW_STEP_S * ENVELOPE_RATE) {
    const part = zscore(envelope.subarray(start, start + windowLength));
    const local = cycleLag(part, whole.lag);
    if (local && local.value >= MIN_PATTERN_STRENGTH * 0.8) windowBpm.push((60 * ENVELOPE_RATE) / local.lag);
  }
  const windowSpread = windowBpm.length ? Math.max(...windowBpm) - Math.min(...windowBpm) : null;
  const agreement = windowSpread === null ? 0 : clamp(1 - windowSpread / (2 * HEART_MAX_WINDOW_SPREAD), 0, 1);
  const quality = Math.round(clamp(whole.value, 0, 1) * (0.5 + 0.5 * agreement) * (1 - spikeFraction) * 100) / 100;

  const markers = findPeaks(envelope, Math.round(whole.lag * 0.6), percentile(envelope, 75)).map((i) => i / ENVELOPE_RATE);
  const result = { ...base, bpmExact: round1(bpmExact), quality, windowBpm: windowBpm.map(round1), windowSpread: windowSpread === null ? null : round1(windowSpread), trace: { ...base.trace, markers } };

  if (windowBpm.length < 3) {
    return { ...result, problem: 'The heartbeat was only clear for a short part of the recording. Try again and keep the phone pressed in one place.' };
  }
  if (windowSpread !== null && windowSpread > HEART_MAX_WINDOW_SPREAD) {
    return { ...result, problem: 'Different parts of the recording disagreed about your heart rate. Stay still and quiet and try once more.' };
  }
  return { ...result, ok: true, bpm: Math.round(bpmExact) };
}
