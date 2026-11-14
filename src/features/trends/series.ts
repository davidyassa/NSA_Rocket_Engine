import type { DailyCheckin, MetricId, Provenance } from '../../contracts';
import { metricBaseline, usableMeasurement } from '../../engine';

export type TrendPoint = {
  sol: number;
  value: number | null;
  baseline: number | null;
  baselineCount: number | null;
  provenance: Provenance | null;
  hasEntryError: boolean;
};

export function buildTrendSeries(metric: MetricId | 'symptoms', records: readonly DailyCheckin[]): TrendPoint[] {
  const ordered = [...records].sort((left, right) => left.sol - right.sol
    || Date.parse(left.submittedAtUtc) - Date.parse(right.submittedAtUtc)
    || (left.id === right.id ? 0 : left.id < right.id ? -1 : 1));
  const latest = ordered.at(-1);
  if (!latest) return [];

  const profileRecords = ordered.filter((record) => record.astronautId === latest.astronautId);
  const recordsBySol = new Map(profileRecords.map((record) => [record.sol, record]));
  const firstSol = profileRecords[0].sol;
  return Array.from({ length: latest.sol - firstSol + 1 }, (_, offset) => {
    const sol = firstSol + offset;
    const checkin = recordsBySol.get(sol);
    if (metric === 'symptoms') {
      return {
        sol,
        value: checkin?.symptoms.length ? checkin.symptoms.filter(({ present }) => present).length : null,
        baseline: null,
        baselineCount: null,
        provenance: null,
        hasEntryError: false,
      };
    }
    const reading = checkin && usableMeasurement(checkin, metric);
    const baseline = metricBaseline(metric, checkin ?? { ...latest, sol }, profileRecords);
    return {
      sol,
      value: reading?.value ?? null,
      baseline: baseline?.median ?? null,
      baselineCount: baseline?.count ?? null,
      provenance: reading?.provenance ?? null,
      hasEntryError: !reading && Boolean(checkin?.measurements.some((item) => item.metric === metric)),
    };
  });
}
