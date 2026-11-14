import { VIGILANCE_MODES, type VigilanceMode, type VigilanceSession } from './vigilance';

export type VigilanceTrial = number | 'early' | 'missed';

export function summarizeVigilance(
  trials: readonly VigilanceTrial[],
  mode: VigilanceMode,
  sol: number,
): VigilanceSession | null {
  const responses = trials.filter((trial): trial is number => typeof trial === 'number');
  if (!responses.length) return null;

  const missedCount = trials.filter((trial) => trial === 'missed').length;
  return {
    sol,
    mode,
    completedAt: new Date().toISOString(),
    meanRtMs: Math.round(responses.reduce((sum, response) => sum + response, 0) / responses.length),
    lapsesCount: missedCount + responses.filter((response) => response >= VIGILANCE_MODES[mode].lapseMs).length,
    falseStartsCount: trials.filter((trial) => trial === 'early').length,
    missedCount,
    validTrials: responses.length,
    totalTrials: trials.length,
  };
}
