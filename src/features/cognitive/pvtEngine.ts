/**
 * NASA Brief Psychomotor Vigilance Task (PVT-B) Assessment Engine
 *
 * Implements the standard neurobehavioral vigilance metric used by NASA's
 * Human Research Program (HRP) Behavioral Health & Performance (BHP) element
 * to evaluate astronaut fatigue, sleep deprivation, and circadian misalignment.
 *
 * References:
 * - Basner M, Dinges DF. (2011). Maximizing sensitivity of the Psychomotor Vigilance Test (PVT) to sleep loss. Sleep, 34(5):581-591.
 * - Dinges DF, et al. (2013). Evaluation of Brief Psychomotor Vigilance Test on International Space Station.
 */

export interface PvTrialResult {
  trialIndex: number;
  reactionTimeMs: number;
  isFalseStart: boolean; // RT < 100ms
  isLapse: boolean;      // RT > 500ms
  timestamp: number;
}

export interface PvtSessionSummary {
  sol: number;
  completedAt: string;
  totalTrials: number;
  validTrials: number;
  meanRtMs: number;
  medianRtMs: number;
  lapsesCount: number;
  falseStartsCount: number;
  fastestRtMs: number;
  slowestRtMs: number;
  vigilanceScore: number; // 0 - 100
  performanceTier: 'optimal' | 'mild_fatigue' | 'significant_fatigue';
  clinicalInterpretation: string;
  baselineDiffMs?: number;
}

export const PVT_CONFIG = {
  minIntervalMs: 2000,
  maxIntervalMs: 5000,
  falseStartThresholdMs: 100,
  lapseThresholdMs: 500,
  defaultTrialCount: 6,
  nominalBaselineRtMs: 220, // Astronaut nominal resting baseline
};

export function evaluatePvtTrials(
  trials: PvTrialResult[],
  sol: number,
  baselineRtMs: number = PVT_CONFIG.nominalBaselineRtMs,
): PvtSessionSummary {
  const completedAt = new Date().toISOString();
  const totalTrials = trials.length;
  const validTrialsList = trials.filter(t => !t.isFalseStart);
  const falseStartsCount = trials.filter(t => t.isFalseStart).length;
  const lapsesCount = trials.filter(t => t.isLapse).length;

  if (validTrialsList.length === 0) {
    return {
      sol,
      completedAt,
      totalTrials,
      validTrials: 0,
      meanRtMs: 0,
      medianRtMs: 0,
      lapsesCount,
      falseStartsCount,
      fastestRtMs: 0,
      slowestRtMs: 0,
      vigilanceScore: 0,
      performanceTier: 'significant_fatigue',
      clinicalInterpretation: 'All trials were false starts. Unable to evaluate reaction time.',
      baselineDiffMs: 0,
    };
  }

  const rts = validTrialsList.map(t => t.reactionTimeMs).sort((a, b) => a - b);
  const sumRt = rts.reduce((a, b) => a + b, 0);
  const meanRtMs = Math.round(sumRt / rts.length);
  const mid = Math.floor(rts.length / 2);
  const medianRtMs = rts.length % 2 !== 0 ? rts[mid] : Math.round((rts[mid - 1] + rts[mid]) / 2);
  const fastestRtMs = rts[0];
  const slowestRtMs = rts[rts.length - 1];

  // Vigilance Score Calculation:
  // Starts at 100, penalized by speed deficit relative to 200ms and by lapses & false starts
  const speedPenalty = Math.max(0, (meanRtMs - 200) * 0.25);
  const lapsePenalty = lapsesCount * 12;
  const falseStartPenalty = falseStartsCount * 8;
  const rawScore = 100 - (speedPenalty + lapsePenalty + falseStartPenalty);
  const vigilanceScore = Math.max(10, Math.min(100, Math.round(rawScore)));

  const baselineDiffMs = meanRtMs - baselineRtMs;

  let performanceTier: PvtSessionSummary['performanceTier'] = 'optimal';
  let clinicalInterpretation = 'Reaction times are rapid and consistent with baseline vigilance.';

  if (lapsesCount >= 2 || meanRtMs > 340 || baselineDiffMs >= 80) {
    performanceTier = 'significant_fatigue';
    clinicalInterpretation = `Elevated reaction times (+${baselineDiffMs} ms) with ${lapsesCount} cognitive lapse(s) detected. Strongly correlates with acute sleep restriction. Critical EVA/docking tasks should be deferred.`;
  } else if (lapsesCount === 1 || meanRtMs > 275 || baselineDiffMs >= 40) {
    performanceTier = 'mild_fatigue';
    clinicalInterpretation = `Moderate slowing in neurobehavioral responsiveness (+${baselineDiffMs} ms above baseline). Suggests emerging fatigue or cumulative sleep deficit.`;
  }

  return {
    sol,
    completedAt,
    totalTrials,
    validTrials: validTrialsList.length,
    meanRtMs,
    medianRtMs,
    lapsesCount,
    falseStartsCount,
    fastestRtMs,
    slowestRtMs,
    vigilanceScore,
    performanceTier,
    clinicalInterpretation,
    baselineDiffMs,
  };
}
