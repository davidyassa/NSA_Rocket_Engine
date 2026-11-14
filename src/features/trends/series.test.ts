import { describe, expect, it } from 'vitest';
import type { DailyCheckin } from '../../contracts';
import { buildTrendSeries } from './series';

function sleepCheckin(sol: number, value: number): DailyCheckin {
  const id = `checkin-${sol}`;
  const time = `2039-06-${String(sol).padStart(2, '0')}T08:00:00.000Z`;
  return {
    id, sol, astronautId: 'crew', submittedAtUtc: time, note: '', symptoms: [],
    measurements: [{
      id: `${id}-sleep`, astronautId: 'crew', metric: 'sleep_duration', unit: 'h',
      value, observedAtUtc: time, provenance: sol === 8 ? 'user_entered' : 'synthetic_demo',
    }],
  };
}

describe('trend series', () => {
  it('preserves missing sols as gaps and excludes the plotted sol and future readings from the baseline', () => {
    const records = [1, 2, 3, 4, 5].map((sol) => sleepCheckin(sol, 8));
    records.push(sleepCheckin(8, 4), sleepCheckin(6, 5));
    const points = buildTrendSeries('sleep_duration', records);

    expect(points.map((point) => point.sol)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(points[4]).toMatchObject({ baseline: null, value: 8 });
    expect(points[5]).toMatchObject({ baseline: 8, baselineCount: 5, value: 5 });
    expect(points[6]).toMatchObject({ baseline: 8, baselineCount: 6, value: null, provenance: null });
    expect(points[7]).toMatchObject({ baseline: 8, baselineCount: 6, value: 4, provenance: 'user_entered' });
  });

  it('preserves zero and skips unusable entries', () => {
    const points = buildTrendSeries('sleep_duration', [sleepCheckin(1, 0), sleepCheckin(2, -1)]);
    expect(points[0]).toMatchObject({ value: 0, provenance: 'synthetic_demo', hasEntryError: false });
    expect(points[1]).toMatchObject({ value: null, provenance: null, hasEntryError: true });
  });
});

describe('reported symptom trends', () => {
  it('distinguishes a review with no symptoms from missing reviews and check-ins', () => {
    const none = { id: 'headache', label: 'Headache', present: false };
    const records = [
      { ...sleepCheckin(1, 8), symptoms: [none] },
      sleepCheckin(2, 8),
      { ...sleepCheckin(4, 8), symptoms: [{ ...none, present: true }] },
    ];
    const points = buildTrendSeries('symptoms', records);
    expect(points.map(({ value, baseline }) => [value, baseline]))
      .toEqual([[0, null], [null, null], [null, null], [1, null]]);
  });
});
