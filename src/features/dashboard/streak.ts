import type { DailyCheckin } from '../../contracts';

export interface CheckinStreak {
  count: number;
  syntheticCount: number;
  userEnteredCount: number;
  throughSol: number | null;
  startSol: number | null;
}

export function calculateCheckinStreak(records: readonly DailyCheckin[]): CheckinStreak {
  if (records.length === 0) {
    return {
      count: 0,
      syntheticCount: 0,
      userEnteredCount: 0,
      throughSol: null,
      startSol: null,
    };
  }

  // Group check-in records by sol number
  const solMap = new Map<number, DailyCheckin[]>();
  for (const record of records) {
    const list = solMap.get(record.sol) ?? [];
    list.push(record);
    solMap.set(record.sol, list);
  }

  const allSols = [...solMap.keys()].sort((a, b) => a - b);
  const latestSol = allSols[allSols.length - 1];

  let currentSol = latestSol;
  let count = 0;
  let syntheticCount = 0;
  let userEnteredCount = 0;

  // Walk backward sol by sol; break the sequence as soon as a sol is missing
  while (solMap.has(currentSol)) {
    count += 1;
    const entries = solMap.get(currentSol)!;
    const hasUserEntered = entries.some((entry) =>
      entry.measurements.some((m) => m.provenance === 'user_entered'),
    );

    if (hasUserEntered) {
      userEnteredCount += 1;
    } else {
      syntheticCount += 1;
    }
    currentSol -= 1;
  }

  return {
    count,
    syntheticCount,
    userEnteredCount,
    throughSol: latestSol,
    startSol: currentSol + 1,
  };
}
