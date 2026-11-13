/**
 * Voice check: speech markers from reading the same short passage aloud each sol.
 *
 * Reading the same text makes sols comparable: the number of syllables is fixed, so pace and
 * pauses change only because the speaker changed. Sol Check compares the markers with the
 * crew member's own usual. It does NOT diagnose depression or any other condition.
 *
 * Methods (published, deterministic):
 *  - Speech vs silence from frame energy, threshold 25 dB below the loudest speech
 *    (de Jong & Wempe 2009); pauses are silences of at least 250 ms.
 *  - Pitch with YIN (de Cheveigné & Kawahara 2002), 60–400 Hz; pitch variability is the SD of
 *    pitch in semitones around the speaker's own median (monotone speech → lower value).
 *  - Syllable nuclei: intensity peaks with a 2 dB dip between them, in voiced frames
 *    (de Jong & Wempe 2009), used to check that the whole passage was read.
 *  - Jitter and shimmer (cycle-to-cycle period and amplitude change, Praat "local"
 *    definitions) by waveform matching; harmonics-to-noise ratio from the normalised
 *    autocorrelation at the pitch period (Boersma 1993).
 * Flatter pitch, slower articulation and more pausing are the speech changes most often
 * reported with low mood and fatigue (Cummins et al. 2015; Low, Bentley & Ghosh 2020).
 */
import {
  butterworth, clamp, clippedFraction, decimate, frameEnergyDb, mean, median,
  movingAverage, parabolicOffset, percentile, round1, standardDeviation, traceForDisplay, type Signal,
} from './dsp';

export const VOICE_ALGORITHM = 'Read passage · energy speech detection (−25 dB, pauses ≥ 250 ms) · YIN pitch · syllable nuclei (de Jong & Wempe 2009) · jitter/shimmer by waveform matching · HNR (Boersma 1993)';

/** "The North Wind and the Sun" (Aesop), the standard passage of the International Phonetic Association. */
export const READING_PASSAGE = [
  'The North Wind and the Sun were disputing which was the stronger, when a traveler came along wrapped in a warm cloak.',
  'They agreed that the one who first succeeded in making the traveler take his cloak off should be considered stronger than the other.',
  'Then the North Wind blew as hard as he could, but the more he blew the more closely did the traveler fold his cloak around him; and at last the North Wind gave up the attempt.',
  'Then the Sun shined out warmly, and immediately the traveler took off his cloak.',
  'And so the North Wind was obliged to confess that the Sun was the stronger of the two.',
] as const;
/** Dictionary syllable count of READING_PASSAGE (28 + 33 + 41 + 21 + 21). */
export const PASSAGE_SYLLABLES = 144;

export interface VoiceMarkers {
  /** SD of pitch around the speaker's median, semitones. */
  pitchVariabilitySt: number;
  /** Median pitch, Hz (reported only; depends on the speaker). */
  pitchMedianHz: number;
  /** Syllables per second of speaking time, pauses excluded. */
  articulationRate: number;
  /** Syllables per second over the whole reading, pauses included. */
  speechRate: number;
  /** Share of the reading time spent in pauses, %. */
  pauseRatio: number;
  pauseCount: number;
  meanPauseS: number;
  readingSeconds: number;
  /** Informational voice-quality numbers (compare only with your own usual). */
  jitterPct: number | null;
  shimmerPct: number | null;
  hnrDb: number | null;
  /** SD of loudness across speech, dB. */
  loudnessVariabilityDb: number;
  syllableNuclei: number;
}

export interface VoiceResult {
  ok: boolean;
  markers: VoiceMarkers | null;
  /** Speech minus background, dB. */
  snrDb: number;
  clipped: number;
  seconds: number;
  quality: number;
  trace: { values: number[]; seconds: number; markers: number[] };
  problem: string | null;
}

const HOP_S = 0.01;
const FRAME_S = 0.03;
const PAUSE_MIN_S = 0.25;
const F0_MIN = 60;
const F0_MAX = 400;
const YIN_THRESHOLD = 0.15;
const VOICED_MAX_APERIODICITY = 0.25;

interface PitchFrame { f0: number; aperiodicity: number; correlation: number }

/** YIN on one frame starting at `start`; returns null when the frame is not voiced. */
function yinFrame(x: Signal, start: number, window: number, rate: number, buffer: Float64Array): PitchFrame | null {
  const minLag = Math.floor(rate / F0_MAX);
  const maxLag = Math.ceil(rate / F0_MIN);
  if (start + window + maxLag + 1 >= x.length) return null;
  let energy0 = 0;
  for (let j = 0; j < window; j += 1) energy0 += x[start + j] ** 2;
  // Difference function and its cumulative-mean normalisation.
  buffer[0] = 1;
  let running = 0;
  const energyLag = new Float64Array(maxLag + 2);
  let eLag = energy0;
  for (let tau = 1; tau <= maxLag + 1; tau += 1) {
    eLag += x[start + window + tau - 1] ** 2 - x[start + tau - 1] ** 2;
    energyLag[tau] = eLag;
    let d = 0;
    for (let j = 0; j < window; j += 1) {
      const diff = x[start + j] - x[start + j + tau];
      d += diff * diff;
    }
    running += d;
    buffer[tau] = running > 0 ? (d * tau) / running : 1;
    buffer[maxLag + 2 + tau] = d; // raw difference kept for the correlation
  }
  let tau = -1;
  for (let t = minLag; t <= maxLag; t += 1) {
    if (buffer[t] < YIN_THRESHOLD) {
      while (t + 1 <= maxLag && buffer[t + 1] < buffer[t]) t += 1;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    let best = minLag;
    for (let t = minLag; t <= maxLag; t += 1) if (buffer[t] < buffer[best]) best = t;
    tau = best;
  }
  const aperiodicity = buffer[tau];
  if (aperiodicity > VOICED_MAX_APERIODICITY) return null;
  const refined = tau + parabolicOffset(Float64Array.from([buffer[tau - 1], buffer[tau], buffer[tau + 1]]), 1);
  // Normalised cross-correlation at the period: 1 − d / (e0 + eτ).
  const d = buffer[maxLag + 2 + tau];
  const correlation = clamp(1 - d / Math.max(1e-12, energy0 + energyLag[tau]), 0, 0.9999);
  return { f0: rate / refined, aperiodicity, correlation };
}

/**
 * Cycle-by-cycle periods and amplitudes in one voiced stretch, by waveform matching.
 * A cycle that does not match its neighbour (onset, offset, noise) ends the current run of
 * neighbouring cycles, so perturbation is only measured between truly adjacent cycles.
 */
export function glottalCycles(x: Signal, start: number, end: number, f0: number, rate: number): { periods: number[]; amplitudes: number[] }[] {
  const runs: { periods: number[]; amplitudes: number[] }[] = [];
  let current = { periods: [] as number[], amplitudes: [] as number[] };
  const nominal = rate / f0;
  let period = nominal;
  let t = start;
  const close = () => {
    if (current.periods.length >= 3) runs.push(current);
    current = { periods: [], amplitudes: [] };
    period = nominal;
  };
  while (t + 2.4 * period < end && t + 2.4 * period < x.length) {
    const length = Math.round(period);
    const lo = Math.floor(0.8 * period);
    const hi = Math.ceil(1.25 * period);
    const scores = new Float64Array(hi + 2);
    for (let lag = lo - 1; lag <= hi + 1; lag += 1) {
      let sum = 0; let e1 = 0; let e2 = 0;
      for (let j = 0; j < length; j += 1) {
        const a = x[t + j]; const b = x[t + j + lag];
        sum += a * b; e1 += a * a; e2 += b * b;
      }
      scores[lag] = e1 > 0 && e2 > 0 ? sum / Math.sqrt(e1 * e2) : 0;
    }
    let best = lo;
    for (let lag = lo; lag <= hi; lag += 1) if (scores[lag] > scores[best]) best = lag;
    if (scores[best] < 0.8) {
      close();
      t += Math.round(nominal);
      continue;
    }
    const exact = best + parabolicOffset(scores, best);
    let maxV = -Infinity; let minV = Infinity;
    for (let j = 0; j < length; j += 1) { maxV = Math.max(maxV, x[t + j]); minV = Math.min(minV, x[t + j]); }
    current.periods.push(exact / rate);
    current.amplitudes.push(maxV - minV);
    period = exact;
    t += Math.round(exact);
  }
  close();
  return runs;
}

function localPerturbation(values: number[][]): number | null {
  let diffs = 0; let count = 0; let total = 0; let n = 0;
  for (const run of values) {
    for (let i = 0; i < run.length; i += 1) {
      total += run[i]; n += 1;
      if (i > 0) { diffs += Math.abs(run[i] - run[i - 1]); count += 1; }
    }
  }
  if (count < 20) return null;
  return (diffs / count) / (total / n) * 100;
}

function speechMask(db: Signal, threshold: number): boolean[] {
  const mask = Array.from(db, (v) => v >= threshold);
  const fill = Math.round(0.12 / HOP_S); // bridge stop consonants
  const minIsland = Math.round(0.06 / HOP_S);
  for (let i = 0; i < mask.length;) {
    if (mask[i]) { i += 1; continue; }
    let j = i;
    while (j < mask.length && !mask[j]) j += 1;
    if (i > 0 && j < mask.length && j - i < fill) for (let k = i; k < j; k += 1) mask[k] = true;
    i = j;
  }
  for (let i = 0; i < mask.length;) {
    if (!mask[i]) { i += 1; continue; }
    let j = i;
    while (j < mask.length && mask[j]) j += 1;
    if (j - i < minIsland) for (let k = i; k < j; k += 1) mask[k] = false;
    i = j;
  }
  return mask;
}

export function analyzeVoice(samples: ArrayLike<number>, sampleRate: number, expectedSyllables = PASSAGE_SYLLABLES): VoiceResult {
  const seconds = samples.length / sampleRate;
  const clipped = clippedFraction(samples);
  const empty: VoiceResult = { ok: false, markers: null, snrDb: 0, clipped, seconds, quality: 0, trace: { values: [], seconds, markers: [] }, problem: null };
  if (seconds < 10) return { ...empty, problem: 'The recording was too short. Read the whole passage at your normal pace.' };

  const { signal: down16, rate } = decimate(samples, sampleRate, 16000);
  const x = butterworth(down16, 'highpass', 60, rate);
  const hop = Math.round(HOP_S * rate);
  const frame = Math.round(FRAME_S * rate);
  const db = frameEnergyDb(x, frame, hop);
  const floor = percentile(db, 5);
  const loudest = percentile(db, 99);
  const snrDb = round1(loudest - floor);
  const threshold = Math.max(floor + 6, loudest - 25);
  const mask = speechMask(db, threshold);
  const trace = { values: traceForDisplay(Float64Array.from(db, (v) => Math.max(0, v - floor)), 600), seconds, markers: [] as number[] };
  const base = { ...empty, snrDb, trace };

  if (snrDb < 15) return { ...base, problem: 'Your voice was too quiet compared with the background noise. Move closer to the microphone or find a quieter spot.' };
  if (clipped > 0.005) return { ...base, problem: 'The recording was too loud and distorted. Hold the microphone a little further away.' };

  const first = mask.indexOf(true);
  const last = mask.lastIndexOf(true);
  if (first < 0) return { ...base, problem: 'No speech was heard.' };
  const readingSeconds = (last - first + 1) * HOP_S;

  // Pauses: silent runs ≥ 250 ms between the first and last speech.
  const pauses: number[] = [];
  for (let i = first; i <= last;) {
    if (mask[i]) { i += 1; continue; }
    let j = i;
    while (j <= last && !mask[j]) j += 1;
    const length = (j - i) * HOP_S;
    if (length >= PAUSE_MIN_S) pauses.push(length);
    i = j;
  }
  const pauseTotal = pauses.reduce((a, b) => a + b, 0);
  const phonationSeconds = readingSeconds - pauseTotal;

  // Pitch on speech frames (YIN with a 40 ms window, at ~8 kHz to keep it fast on a phone).
  const { signal: x8, rate: rate8 } = decimate(x, rate, 8000);
  const hop8 = HOP_S * rate8;
  const window8 = Math.round(0.04 * rate8);
  const buffer = new Float64Array(2 * Math.ceil(rate8 / F0_MIN) + 6);
  const pitch: (PitchFrame | null)[] = mask.map((speech, f) => (speech ? yinFrame(x8, Math.round(f * hop8), window8, rate8, buffer) : null));
  const window = Math.round(0.04 * rate);
  const voicedF0 = pitch.filter((p): p is PitchFrame => p !== null).map((p) => p.f0);
  if (voicedF0.length * HOP_S < 3) return { ...base, problem: 'Too little clear voice was heard. Read the passage aloud at your normal volume.' };

  // Median-smooth the pitch track and drop octave jumps.
  const centre = median(voicedF0);
  const semitones: number[] = [];
  for (let f = 0; f < pitch.length; f += 1) {
    const p = pitch[f];
    if (!p) continue;
    const neighbours = pitch.slice(Math.max(0, f - 2), f + 3).filter((q): q is PitchFrame => q !== null).map((q) => q.f0);
    const smoothed = median(neighbours);
    const st = 12 * Math.log2(smoothed / centre);
    if (Math.abs(st) <= 10) semitones.push(st);
  }
  const pitchVariabilitySt = standardDeviation(semitones);

  // Syllable nuclei: intensity peaks with a ≥ 2 dB dip before them, in voiced speech.
  const intensity = movingAverage(db, 3);
  const nucleusFloor = Math.max(threshold, loudest - 25);
  const nuclei: number[] = [];
  let dipSincePeak = Infinity;
  for (let f = 1; f < intensity.length - 1; f += 1) {
    const value = intensity[f];
    if (nuclei.length) dipSincePeak = Math.min(dipSincePeak, value);
    const isPeak = value >= intensity[f - 1] && value > intensity[f + 1] && value >= nucleusFloor && mask[f] && pitch[f] !== null;
    if (!isPeak) continue;
    const lastPeak = nuclei.at(-1);
    if (lastPeak === undefined || value - dipSincePeak >= 2) {
      nuclei.push(f);
      dipSincePeak = Infinity;
    } else if (value > intensity[lastPeak]) {
      nuclei[nuclei.length - 1] = f;
    }
  }
  trace.markers = nuclei.map((f) => f * HOP_S);

  // Jitter, shimmer and HNR on stable voiced stretches (≥ 60 ms).
  const periodRuns: number[][] = [];
  const amplitudeRuns: number[][] = [];
  for (let f = 0; f < pitch.length;) {
    if (!pitch[f]) { f += 1; continue; }
    let g = f;
    while (g < pitch.length && pitch[g]) g += 1;
    if ((g - f) * HOP_S >= 0.06) {
      const f0 = median(pitch.slice(f, g).map((p) => (p as PitchFrame).f0));
      for (const run of glottalCycles(x, f * hop, g * hop + window, f0, rate)) {
        periodRuns.push(run.periods);
        amplitudeRuns.push(run.amplitudes);
      }
    }
    f = g;
  }
  const correlations = pitch.filter((p): p is PitchFrame => p !== null).map((p) => p.correlation);
  const r = median(correlations);
  const hnrDb = Number.isFinite(r) ? round1(10 * Math.log10(r / (1 - r))) : null;
  const jitter = localPerturbation(periodRuns);
  const shimmer = localPerturbation(amplitudeRuns);
  const speechDb = Array.from(db).filter((_, f) => mask[f]);

  const markers: VoiceMarkers = {
    pitchVariabilitySt: Math.round(pitchVariabilitySt * 100) / 100,
    pitchMedianHz: Math.round(centre),
    articulationRate: Math.round((expectedSyllables / phonationSeconds) * 100) / 100,
    speechRate: Math.round((expectedSyllables / readingSeconds) * 100) / 100,
    pauseRatio: round1((pauseTotal / readingSeconds) * 100),
    pauseCount: pauses.length,
    meanPauseS: pauses.length ? Math.round(mean(pauses) * 100) / 100 : 0,
    readingSeconds: round1(readingSeconds),
    jitterPct: jitter === null ? null : Math.round(jitter * 100) / 100,
    shimmerPct: shimmer === null ? null : Math.round(shimmer * 100) / 100,
    hnrDb,
    loudnessVariabilityDb: round1(standardDeviation(speechDb)),
    syllableNuclei: nuclei.length,
  };

  const completeness = nuclei.length / expectedSyllables;
  const quality = Math.round(clamp((snrDb - 15) / 20, 0, 1) * clamp(1 - Math.abs(1 - completeness), 0, 1) * 100) / 100;
  const result = { ...base, markers, quality };
  if (readingSeconds < 15) return { ...result, problem: 'The reading was too short. Read the whole passage, from "The North Wind" to "of the two".' };
  if (completeness < 0.6) return { ...result, problem: 'It sounded like part of the passage was missing. Read the whole passage once, at your normal pace.' };
  if (completeness > 1.5) return { ...result, problem: 'More speech was heard than the passage contains. Read only the passage, with nobody else talking.' };
  if (markers.articulationRate < 2 || markers.articulationRate > 9) return { ...result, problem: 'The reading pace was outside the range Sol Check can measure. Read at your normal pace.' };
  return { ...result, ok: true };
}
