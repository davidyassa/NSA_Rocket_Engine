import { z } from 'zod';
import { BASELINE_LOOKBACK_SOLS } from '../../engine/rules';

export const VIGILANCE_MODES = {
  quick: { label: 'Quick · 3 trials', trialCount: 3, lapseMs: 500, earlyMs: 100, minWaitMs: 1200, maxWaitMs: 2600 },
  standard: { label: 'Standard · 6 trials', trialCount: 6, lapseMs: 500, earlyMs: 100, minWaitMs: 1600, maxWaitMs: 3600 },
  timed: { label: 'Timed · 3 minutes', durationMs: 180_000, lapseMs: 355, earlyMs: 130, minWaitMs: 1000, maxWaitMs: 4000 },
} as const;

export const vigilanceModeSchema = z.enum(['quick', 'standard', 'timed']);
export type VigilanceMode = z.infer<typeof vigilanceModeSchema>;

export const vigilanceSessionSchema = z.object({
  sol: z.number().int().positive(),
  mode: vigilanceModeSchema,
  completedAt: z.iso.datetime(),
  meanRtMs: z.number().int().positive().nullable(),
  lapsesCount: z.number().int().nonnegative(),
  falseStartsCount: z.number().int().nonnegative(),
  missedCount: z.number().int().nonnegative(),
  validTrials: z.number().int().nonnegative(),
  totalTrials: z.number().int().positive(),
}).refine((session) =>
  session.totalTrials === session.validTrials + session.falseStartsCount + session.missedCount
  && session.lapsesCount >= session.missedCount
  && session.lapsesCount <= session.validTrials + session.missedCount
  && (session.meanRtMs === null) === (session.validTrials === 0));

export type VigilanceSession = z.infer<typeof vigilanceSessionSchema>;
export const MIN_VIGILANCE_BASELINE_SOLS = 3;

export function sessionsForSol(history: readonly VigilanceSession[], sol: number) {
  return history.filter((session) => session.sol === sol);
}

export function vigilanceBaseline(history: readonly VigilanceSession[], current: VigilanceSession) {
  const bySol = new Map<number, VigilanceSession>();
  for (const session of history) {
    if (session.mode !== current.mode || session.sol >= current.sol
      || session.sol < current.sol - BASELINE_LOOKBACK_SOLS || session.meanRtMs === null) continue;
    const previous = bySol.get(session.sol);
    if (!previous || previous.completedAt < session.completedAt) bySol.set(session.sol, session);
  }
  if (bySol.size < MIN_VIGILANCE_BASELINE_SOLS) return null;

  const sessions = [...bySol.values()];
  function median(values: number[]) {
    values.sort((a, b) => a - b);
    return (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2;
  }
  return {
    meanRtMs: median(sessions.flatMap(({ meanRtMs }) => meanRtMs === null ? [] : [meanRtMs])),
    lapsesCount: median(sessions.map(({ lapsesCount }) => lapsesCount)),
    count: sessions.length,
  };
}
