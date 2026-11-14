/**
 * Respiratory metrics from detected cycles (pure). Each metric says whether it was
 * observed, estimated, or is unavailable, and why. Nothing here measures volume,
 * oxygen or lung function: chest movement in ordinary video is a relative quantity.
 *
 *   cycle duration   T_k = end_k − start_k                     median over clean cycles
 *   inspiration      Ti_k = peak_k − start_k  (rising chest)    median
 *   expiration       Te_k = end_k − peak_k                       median
 *   I:E ratio        median(Ti_k / Te_k)
 *   regularity       CV = SD(T) / mean(T) × 100 %  (lower = more regular)
 *   variability      SD of breath-by-breath rate 60 / T_k (breaths/min)
 *   amplitude        median peak-to-trough excursion / ROI height × 100 %
 */
import type { Cycle } from './dsp';
import { mean, median, std } from './dsp';
import type { Metric, RespiratoryMetrics } from './types';

export const METRIC_MINIMUM = { timingCycles: 3, variabilityCycles: 5 } as const;

const unavailable = (unit: string, note: string): Metric => ({ value: null, unit, kind: 'unavailable', note });
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export function respiratoryMetrics(input: {
  rateBrpm: number | null;
  rateNote?: string;
  /** cycles of the motion waveform used for timing (none when only the face pulse was usable) */
  cycles: readonly Cycle[];
  /** cycles from each torso region, with that region's height in the same units */
  amplitudes: { chest?: { cycles: readonly Cycle[]; roiHeight: number }; abdomen?: { cycles: readonly Cycle[]; roiHeight: number } };
}): RespiratoryMetrics {
  const c = input.cycles;
  const durations = c.map((x) => (x.end - x.start) / 1000);
  const timing = c.length >= METRIC_MINIMUM.timingCycles;
  const spread = c.length >= METRIC_MINIMUM.variabilityCycles;
  const needTiming = `Needs ${METRIC_MINIMUM.timingCycles} clean breaths from torso motion (${c.length} seen).`;
  const needSpread = `Needs ${METRIC_MINIMUM.variabilityCycles} clean breaths (${c.length} seen).`;

  const amplitude = (region?: { cycles: readonly Cycle[]; roiHeight: number }): Metric => {
    if (!region || region.roiHeight <= 0) return unavailable('% of region height', 'Region not measured.');
    if (region.cycles.length < METRIC_MINIMUM.timingCycles) return unavailable('% of region height', 'Too few clean breaths in this region.');
    return {
      value: round((median(region.cycles.map((x) => x.amplitude)) / region.roiHeight) * 100, 2),
      unit: '% of region height', kind: 'estimated',
      note: 'Relative image movement, not breath volume; depends on distance and framing.',
    };
  };

  return {
    rate: input.rateBrpm === null
      ? unavailable('breaths/min', input.rateNote ?? 'No reliable rate.')
      : { value: round(input.rateBrpm, 1), unit: 'breaths/min', kind: 'observed', note: input.rateNote },
    cycleDuration: timing ? { value: round(median(durations)), unit: 's', kind: 'observed' } : unavailable('s', needTiming),
    inspiration: timing
      ? { value: round(median(c.map((x) => (x.peak - x.start) / 1000))), unit: 's', kind: 'estimated', note: 'Rising chest movement; assumes the camera sees the front of the torso.' }
      : unavailable('s', needTiming),
    expiration: timing
      ? { value: round(median(c.map((x) => (x.end - x.peak) / 1000))), unit: 's', kind: 'estimated', note: 'Falling chest movement.' }
      : unavailable('s', needTiming),
    ieRatio: timing
      ? { value: round(median(c.map((x) => (x.peak - x.start) / Math.max(1, x.end - x.peak)))), unit: 'ratio', kind: 'estimated' }
      : unavailable('ratio', needTiming),
    regularity: spread
      ? { value: round((std(durations) / mean(durations)) * 100, 1), unit: '% variation', kind: 'observed', note: 'Coefficient of variation of breath length; lower is more regular.' }
      : unavailable('% variation', needSpread),
    variability: spread
      ? { value: round(std(durations.map((d) => 60 / d)), 1), unit: 'breaths/min (SD)', kind: 'observed' }
      : unavailable('breaths/min (SD)', needSpread),
    chestAmplitude: amplitude(input.amplitudes.chest),
    abdomenAmplitude: amplitude(input.amplitudes.abdomen),
    cycleCount: c.length,
  };
}
