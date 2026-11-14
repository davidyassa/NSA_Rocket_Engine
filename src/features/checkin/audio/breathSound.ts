/**
 * Breathing rate from breath sounds recorded by the microphone held a few centimetres
 * from the nose (built-in phone or laptop microphone).
 *
 * Method (after Nam, Reyes & Chon, IEEE JBHI 2016, which used the built-in microphone of a
 * smartphone or headset):
 *  1. Down-sample to ~8 kHz and band-pass 100–2500 Hz: airflow noise, without mains hum.
 *  2. Sound-energy envelope in dB (50 ms frames every 20 ms), smoothed and de-trended.
 *  3. Two independent rate estimates:
 *     A. the strongest autocorrelation peak of the envelope (6–40 breaths/min);
 *     B. counting breath sounds with a two-level threshold. Breath-in and breath-out both
 *        make a sound, so when the sounds alternate (short gap, long gap, or loud, quiet)
 *        they are paired into one breath.
 *  4. Like the camera breathing check (Karlen et al. 2013), a number is shown only when the
 *     two methods agree, here within 2 breaths/min.
 */
import {
  autocorrelation, bandpass, clamp, clippedFraction, decimate, frameEnergyDb, mean, median,
  movingAverage, peakNear, percentile, round1, standardDeviation, traceForDisplay, bestLag, type Signal,
} from './dsp';

export const BREATH_SOUND_ALGORITHM = 'Breath sounds · 100–2500 Hz energy envelope · autocorrelation and breath-sound counting must agree within 2 breaths/min (Nam et al. 2016)';

export interface BreathSoundResult {
  ok: boolean;
  brpm: number | null;
  /** Estimate A: envelope autocorrelation. */
  acfBrpm: number | null;
  /** Estimate B: counted breath sounds (paired into breaths when they alternate). */
  countBrpm: number | null;
  /** Number of complete breaths counted. */
  breaths: number;
  /** True when breath-in and breath-out sounds were both heard and paired. */
  paired: boolean;
  quality: number;
  /** Loud minus quiet parts of the recording, dB. */
  dynamicRangeDb: number;
  clipped: number;
  seconds: number;
  trace: { values: number[]; seconds: number; markers: number[] };
  playback: { samples: Float32Array; sampleRate: number } | null;
  problem: string | null;
}

const ENVELOPE_RATE = 50; // Hz (20 ms hop)
export const BREATH_MIN_SECONDS = 20;
export const BREATH_AGREEMENT = 2; // breaths/min
const MIN_LAG_S = 60 / 40;
const MAX_LAG_S = 60 / 6;

interface Burst { start: number; end: number; peak: number }

/** Sound bursts above a two-level (hysteresis) threshold. Indices in envelope samples. */
function detectBursts(envelope: Signal, high: number, low: number): Burst[] {
  const bursts: Burst[] = [];
  let current: Burst | null = null;
  for (let i = 0; i < envelope.length; i += 1) {
    const v = envelope[i];
    if (!current && v >= high) current = { start: i, end: i, peak: v };
    else if (current) {
      if (v >= low) { current.end = i; current.peak = Math.max(current.peak, v); }
      else { bursts.push(current); current = null; }
    }
  }
  if (current) bursts.push(current);
  // Merge sounds split by a brief dip (< 0.3 s); drop clicks shorter than 0.15 s.
  const merged: Burst[] = [];
  for (const burst of bursts) {
    const last = merged.at(-1);
    if (last && burst.start - last.end < 0.3 * ENVELOPE_RATE) {
      last.end = burst.end; last.peak = Math.max(last.peak, burst.peak);
    } else merged.push({ ...burst });
  }
  return merged.filter((burst) => burst.end - burst.start >= 0.15 * ENVELOPE_RATE);
}

/** Share of neighbouring pairs that alternate in the same direction (+ − + − …). */
function alternation(values: number[]): { share: number; ratio: number } {
  if (values.length < 4) return { share: 0, ratio: 1 };
  let consistent = 0;
  for (let i = 0; i + 1 < values.length; i += 1) {
    const sign = Math.sign(values[i] - values[i + 1]) * (i % 2 === 0 ? 1 : -1);
    if (sign !== 0) consistent += sign;
  }
  const share = Math.abs(consistent) / (values.length - 1);
  const odd = values.filter((_, i) => i % 2 === 1);
  const even = values.filter((_, i) => i % 2 === 0);
  const ratio = Math.max(mean(odd), mean(even)) / Math.max(1e-9, Math.min(mean(odd), mean(even)));
  return { share, ratio };
}

export function analyzeBreathSound(samples: ArrayLike<number>, sampleRate: number): BreathSoundResult {
  const seconds = samples.length / sampleRate;
  const clipped = clippedFraction(samples);
  const empty: BreathSoundResult = {
    ok: false, brpm: null, acfBrpm: null, countBrpm: null, breaths: 0, paired: false, quality: 0,
    dynamicRangeDb: 0, clipped, seconds, trace: { values: [], seconds, markers: [] }, playback: null, problem: null,
  };
  if (seconds < BREATH_MIN_SECONDS) return { ...empty, problem: `The recording was too short. Breathe normally for at least ${BREATH_MIN_SECONDS} seconds.` };

  const { signal: down, rate } = decimate(samples, sampleRate, 8000);
  const filtered = bandpass(down, 100, Math.min(2500, 0.45 * rate), rate);
  const hop = Math.round(rate / ENVELOPE_RATE);
  const db = frameEnergyDb(filtered, Math.round(0.05 * rate), hop);
  const smooth = movingAverage(db, Math.round(0.3 * ENVELOPE_RATE));
  const floor = percentile(smooth, 10);
  const loud = percentile(smooth, 95);
  const dynamicRangeDb = round1(loud - floor);

  let peakAbs = 0;
  for (let i = 0; i < filtered.length; i += 1) peakAbs = Math.max(peakAbs, Math.abs(filtered[i]));
  const playback = peakAbs > 0 ? { samples: Float32Array.from(filtered, (v) => (v / peakAbs) * 0.9), sampleRate: rate } : null;
  const base = { ...empty, dynamicRangeDb, playback, trace: { values: traceForDisplay(Float64Array.from(smooth, (v) => v - floor), 600), seconds, markers: [] as number[] } };

  if (dynamicRangeDb < 6) {
    return { ...base, problem: 'Your breathing was too quiet to hear over the room. Hold the microphone 2–3 cm below your nose and breathe out gently onto it.' };
  }

  // A: autocorrelation of the de-trended envelope.
  const trend = movingAverage(smooth, Math.round(20 * ENVELOPE_RATE));
  const detrended = Float64Array.from(smooth, (v, i) => v - trend[i]);
  const acf = autocorrelation(detrended, 1, Math.round(MAX_LAG_S * ENVELOPE_RATE * 1.25));
  const best = bestLag(acf, Math.round(MIN_LAG_S * ENVELOPE_RATE), Math.round(MAX_LAG_S * ENVELOPE_RATE));

  // B: count breath sounds.
  const high = floor + 0.5 * (loud - floor);
  const low = floor + 0.3 * (loud - floor);
  const bursts = detectBursts(smooth, high, low);
  const onsets = bursts.map((burst) => burst.start);
  const intervals = onsets.slice(1).map((onset, i) => onset - onsets[i]);
  const gapPattern = alternation(intervals);
  const loudPattern = alternation(bursts.map((burst) => burst.peak));
  let paired = intervals.length >= 4 && (
    (gapPattern.share >= 0.7 && gapPattern.ratio >= 1.4)
    || (loudPattern.share >= 0.7 && Math.abs(mean(bursts.filter((_, i) => i % 2 === 0).map((b) => b.peak)) - mean(bursts.filter((_, i) => i % 2 === 1).map((b) => b.peak))) >= 3)
  );
  // If the sounds come at the same steady pace but the envelope repeats more strongly at twice
  // that interval, the sounds are breath-in and breath-out of the same breath.
  if (!paired && best && intervals.length >= 4) {
    const soundLag = median(intervals);
    const atSound = peakNear(acf, soundLag, soundLag * 0.15);
    const atBreath = peakNear(acf, soundLag * 2, soundLag * 0.3);
    if (atBreath && atBreath.value > 0.2 && (!atSound || atBreath.value > atSound.value + 0.05)) paired = true;
  }
  const cycles: number[] = [];
  if (paired) for (let i = 0; i + 1 < intervals.length; i += 2) cycles.push(intervals[i] + intervals[i + 1]);
  else cycles.push(...intervals);
  const breaths = cycles.length;
  const countBrpm = breaths >= 3 ? (60 * ENVELOPE_RATE) / median(cycles) : null;
  const markers = (paired ? onsets.filter((_, i) => i % 2 === 0) : onsets).map((i) => i / ENVELOPE_RATE);

  // Reconcile A with B: the autocorrelation may lock onto half a breath (in + out) or two breaths.
  let acfBrpm: number | null = null;
  let acfStrength = 0;
  if (best) {
    const options = [best, peakNear(acf, best.lag * 2, best.lag * 0.15), peakNear(acf, best.lag / 2, Math.max(2, best.lag * 0.1))]
      .filter((option): option is { lag: number; value: number } => option !== null && option.lag >= MIN_LAG_S * ENVELOPE_RATE * 0.9 && option.lag <= MAX_LAG_S * ENVELOPE_RATE * 1.1 && option.value > 0.2);
    const chosen = countBrpm === null
      ? best
      : options.reduce((a, b) => Math.abs((60 * ENVELOPE_RATE) / a.lag - countBrpm) <= Math.abs((60 * ENVELOPE_RATE) / b.lag - countBrpm) ? a : b, best);
    acfBrpm = (60 * ENVELOPE_RATE) / chosen.lag;
    acfStrength = chosen.value;
  }

  const regularity = cycles.length >= 2 ? clamp(1 - standardDeviation(cycles) / mean(cycles), 0, 1) : 0;
  const quality = Math.round(clamp(acfStrength, 0, 1) * (0.5 + 0.5 * regularity) * 100) / 100;
  const result = {
    ...base, acfBrpm: acfBrpm === null ? null : round1(acfBrpm), countBrpm: countBrpm === null ? null : round1(countBrpm),
    breaths, paired, quality, trace: { ...base.trace, markers },
  };

  if (countBrpm === null || breaths < 3) {
    return { ...result, problem: 'Fewer than 3 clear breaths were heard. Keep the microphone close to your nose and breathe normally for the whole recording.' };
  }
  if (acfBrpm === null || acfStrength < 0.2) {
    return { ...result, problem: 'Your breathing pattern was not steady enough to measure. Sit still, stay quiet and breathe normally.' };
  }
  if (Math.abs(acfBrpm - countBrpm) > BREATH_AGREEMENT) {
    return { ...result, problem: 'The two ways of measuring disagreed, so no number is shown. Try again in a quieter spot.' };
  }
  return { ...result, ok: true, brpm: Math.round((acfBrpm + countBrpm) / 2) };
}
