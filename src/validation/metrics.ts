/**
 * Paired-measurement validation statistics for the optional camera pulse check.
 *
 * Every function here is a pure calculation over paired `(estimate, reference)`
 * values. Nothing in this module interpolates, imputes, or repairs a sample: a
 * pair with a missing or non-finite value is excluded and counted, never filled.
 *
 * Formulas are the standard ones, stated so a reviewer can re-derive every
 * number in the generated report by hand:
 *
 * - error      d_i = estimate_i - reference_i  (positive = camera reads high)
 * - bias       mean(d_i)
 * - MAE        mean(|d_i|)
 * - RMSE       sqrt(mean(d_i^2))
 * - SD         sample standard deviation of d_i, denominator (n - 1)
 * - LoA        bias +/- 1.96 * SD  (Bland & Altman, Lancet 1986)
 * - Pearson r  covariance / (SD_x * SD_y), null when either series is constant
 * - AUC        Mann-Whitney U with average ranks for ties, normalized to [0, 1]
 * - Youden J   sensitivity + specificity - 1 at an acceptance threshold
 *
 * None of these establish clinical validity. They describe agreement in the
 * sample that was actually collected, and they say nothing about a population
 * the sample does not represent.
 */

/** Conventional 95% limits-of-agreement multiplier (Bland & Altman, 1986). */
export const LOA_Z = 1.96;

/**
 * Accuracy tolerance used to label a single paired scan "concordant".
 * +/- 10 bpm is the tolerance common in consumer optical heart-rate validation
 * literature; it is a product acceptance criterion here, not a clinical limit.
 */
export const CONCORDANCE_TOLERANCE_BPM = 10;

export interface PairedReading {
  /** Camera estimate, bpm. */
  estimate: number;
  /** Simultaneous pulse-oximeter or ECG reference, bpm. */
  reference: number;
}

export interface ExcludedPair {
  estimate: unknown;
  reference: unknown;
  reason: string;
}

export interface PairingResult {
  pairs: PairedReading[];
  excluded: ExcludedPair[];
}

/**
 * Split raw rows into usable pairs and excluded rows. A row is excluded when
 * either side is absent, non-numeric, or non-finite. Exclusion is recorded so
 * the report can show how much data was dropped instead of silently shrinking n.
 */
export function pairReadings(rows: readonly { estimate: unknown; reference: unknown }[]): PairingResult {
  const pairs: PairedReading[] = [];
  const excluded: ExcludedPair[] = [];
  rows.forEach((row, index) => {
    const estimate = toFinite(row.estimate);
    const reference = toFinite(row.reference);
    if (estimate === null) {
      excluded.push({ ...row, reason: `row ${index}: estimate is not a finite number` });
      return;
    }
    if (reference === null) {
      excluded.push({ ...row, reason: `row ${index}: reference is not a finite number (unpaired scan)` });
      return;
    }
    pairs.push({ estimate, reference });
  });
  return { pairs, excluded };
}

function toFinite(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export interface AgreementSummary {
  n: number;
  bias: number;
  mae: number;
  rmse: number;
  sd: number;
  lowerLoa: number;
  upperLoa: number;
  /** Fraction of pairs within CONCORDANCE_TOLERANCE_BPM. */
  concordanceRate: number;
}

/** Agreement statistics for a paired sample. Throws on an empty sample. */
export function summarizeAgreement(pairs: readonly PairedReading[]): AgreementSummary {
  const n = pairs.length;
  if (n === 0) throw new Error('summarizeAgreement requires at least one paired reading');

  const errors = pairs.map(({ estimate, reference }) => estimate - reference);
  const bias = mean(errors);
  const mae = mean(errors.map(Math.abs));
  const rmse = Math.sqrt(mean(errors.map((error) => error * error)));
  const sd = n > 1 ? sampleSd(errors) : 0;
  const within = errors.filter((error) => Math.abs(error) <= CONCORDANCE_TOLERANCE_BPM).length;

  return {
    n,
    bias,
    mae,
    rmse,
    sd,
    lowerLoa: bias - LOA_Z * sd,
    upperLoa: bias + LOA_Z * sd,
    concordanceRate: within / n,
  };
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error('mean requires at least one value');
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Sample standard deviation, denominator n - 1. Throws below two values. */
export function sampleSd(values: readonly number[]): number {
  if (values.length < 2) throw new Error('sampleSd requires at least two values');
  const average = mean(values);
  const sumSquares = values.reduce((total, value) => total + (value - average) ** 2, 0);
  return Math.sqrt(sumSquares / (values.length - 1));
}

/**
 * Pearson product-moment correlation. Returns null when either series has zero
 * variance, because the coefficient is undefined there and reporting 0 would
 * falsely read as "no relationship".
 */
export function pearson(pairs: readonly PairedReading[]): number | null {
  if (pairs.length < 2) return null;
  const xs = pairs.map((pair) => pair.estimate);
  const ys = pairs.map((pair) => pair.reference);
  const meanX = mean(xs);
  const meanY = mean(ys);
  let covariance = 0;
  let sumXX = 0;
  let sumYY = 0;
  for (let index = 0; index < pairs.length; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    covariance += dx * dy;
    sumXX += dx * dx;
    sumYY += dy * dy;
  }
  if (sumXX === 0 || sumYY === 0) return null;
  return covariance / Math.sqrt(sumXX * sumYY);
}

/**
 * Average ranks (1-based), with tied values sharing the mean of their positions.
 * This is what makes the AUC tie-correct rather than order-dependent.
 */
export function averageRanks(values: readonly number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length).fill(0);
  let position = 0;
  while (position < indexed.length) {
    let end = position;
    while (end + 1 < indexed.length && indexed[end + 1].value === indexed[position].value) end += 1;
    const sharedRank = (position + end + 2) / 2;
    for (let cursor = position; cursor <= end; cursor += 1) {
      ranks[indexed[cursor].index] = sharedRank;
    }
    position = end + 1;
  }
  return ranks;
}

/**
 * ROC AUC via the Mann-Whitney U statistic.
 *
 * `scores` are oriented so that a larger score means "more likely positive".
 * A tied positive/negative pair counts 0.5. Returns null unless both classes are
 * present, since AUC is undefined with one class.
 */
export function rocAuc(scores: readonly number[], labels: readonly boolean[]): number | null {
  if (scores.length !== labels.length) throw new Error('rocAuc requires one label per score');
  const positives = labels.filter(Boolean).length;
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) return null;

  const ranks = averageRanks(scores);
  const positiveRankSum = ranks.reduce((total, rank, index) => (labels[index] ? total + rank : total), 0);
  const u = positiveRankSum - (positives * (positives + 1)) / 2;
  return u / (positives * negatives);
}

export interface YoudenPoint {
  /** Scan is accepted when its signal quality is >= threshold. */
  threshold: number;
  /** Smallest observed SQI still accepted at this threshold. */
  minAcceptedSqi: number;
  sensitivity: number;
  specificity: number;
  j: number;
  trueAccept: number;
  falseReject: number;
  falseAccept: number;
  trueReject: number;
}

/**
 * Youden's J for the quality gate.
 *
 * Class of interest is "inaccurate scan" (|estimate - reference| > tolerance).
 * Accepting a scan means SQI >= threshold.
 *   sensitivity = rejected inaccurate / all inaccurate   (higher is safer)
 *   specificity = accepted accurate  / all accurate      (higher is less wasteful)
 *
 * Candidate thresholds are the distinct observed SQI values, so every operating
 * point is one the data can actually produce. Ties are broken toward the
 * strictest (highest) threshold, because a safety gate should not accept more
 * than it must to reach the same J.
 */
export function youdenThreshold(
  scans: readonly { sqi: number; absoluteError: number }[],
  tolerance = CONCORDANCE_TOLERANCE_BPM,
): YoudenPoint | null {
  const usable = scans.filter(({ sqi }) => Number.isFinite(sqi));
  const inaccurate = usable.filter(({ absoluteError }) => absoluteError > tolerance).length;
  const accurate = usable.length - inaccurate;
  if (inaccurate === 0 || accurate === 0) return null;

  const distinct = [...new Set(usable.map(({ sqi }) => sqi))].sort((a, b) => a - b);
  // Every distinct operating point: accept all, reject the lowest rungs one at a
  // time, reject all. Midpoints are used so a gap between observed values can
  // still produce a separating threshold.
  const candidates = [
    distinct[0] - 1,
    ...distinct.slice(0, -1).map((value, index) => (value + distinct[index + 1]) / 2),
    distinct[distinct.length - 1] + 1,
  ];

  let best: YoudenPoint | null = null;
  for (const threshold of candidates) {
    const accepted = usable.filter(({ sqi }) => sqi >= threshold).map(({ sqi }) => sqi);
    const minAcceptedSqi = accepted.length > 0 ? Math.min(...accepted) : Number.NaN;
    let trueReject = 0;
    let falseReject = 0;
    let trueAccept = 0;
    let falseAccept = 0;
    for (const { sqi, absoluteError } of usable) {
      const rejected = sqi < threshold;
      const isInaccurate = absoluteError > tolerance;
      if (rejected && isInaccurate) trueReject += 1;
      else if (rejected) falseReject += 1;
      else if (isInaccurate) falseAccept += 1;
      else trueAccept += 1;
    }
    const sensitivity = trueReject / inaccurate;
    const specificity = trueAccept / accurate;
    const j = sensitivity + specificity - 1;
    if (best === null || j > best.j + 1e-12 || (Math.abs(j - best.j) <= 1e-12 && threshold > best.threshold)) {
      best = {
        threshold,
        minAcceptedSqi,
        sensitivity,
        specificity,
        j,
        trueAccept,
        falseReject,
        falseAccept,
        trueReject,
      };
    }
  }
  return best;
}

export interface ValidationReportData {
  n: number;
  excluded: number;
  exclusionReasons: string[];
  agreement: AgreementSummary;
  correlation: number | null;
  /** AUC for detecting an inaccurate scan using (1 - SQI) as the score. */
  qualityAuc: number | null;
  gate: YoudenPoint | null;
}

/** Everything the report needs, computed from paired rows. Null when n = 0. */
export function buildValidationReport(
  rows: readonly { estimate: unknown; reference: unknown; sqi: unknown }[],
): ValidationReportData | null {
  const { pairs, excluded } = pairReadings(rows);
  if (pairs.length === 0) {
    return {
      n: 0,
      excluded: excluded.length,
      exclusionReasons: excluded.map(({ reason }) => reason),
      agreement: { n: 0, bias: 0, mae: 0, rmse: 0, sd: 0, lowerLoa: 0, upperLoa: 0, concordanceRate: 0 },
      correlation: null,
      qualityAuc: null,
      gate: null,
    };
  }

  const sqiByIndex = new Map<number, number>();
  let cursor = 0;
  rows.forEach((row) => {
    const estimate = toFinite(row.estimate);
    const reference = toFinite(row.reference);
    if (estimate === null || reference === null) return;
    const sqi = toFinite(row.sqi);
    if (sqi !== null) sqiByIndex.set(cursor, sqi);
    cursor += 1;
  });

  const scans = pairs.map((pair, index) => ({
    sqi: sqiByIndex.get(index) ?? Number.NaN,
    absoluteError: Math.abs(pair.estimate - pair.reference),
  }));
  const withQuality = scans.filter(({ sqi }) => Number.isFinite(sqi));

  return {
    n: pairs.length,
    excluded: excluded.length,
    exclusionReasons: excluded.map(({ reason }) => reason),
    agreement: summarizeAgreement(pairs),
    correlation: pearson(pairs),
    qualityAuc: withQuality.length > 0
      ? rocAuc(
        withQuality.map(({ sqi }) => -sqi),
        withQuality.map(({ absoluteError }) => absoluteError > CONCORDANCE_TOLERANCE_BPM),
      )
      : null,
    gate: youdenThreshold(withQuality),
  };
}
