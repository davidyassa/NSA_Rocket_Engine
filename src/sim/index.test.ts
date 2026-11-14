import { describe, expect, it } from 'vitest';
import type { MissionContext } from '../contracts';
import { SOL_LENGTH_SECONDS, utcAtSol } from '../contracts';
import { RADLAB_HOURLY, RADLAB_MANIFEST } from '../data/nasa';
import { radlabEventSol, replaySolAt } from './index';

describe('RadLab mission replay', () => {
  const clock = {
    missionStartUtc: '2039-06-01T00:00:00.000Z',
    solLengthSeconds: SOL_LENGTH_SECONDS,
    habitat: 'Gale Crater Habitat',
    oneWayDelayMinutes: 20,
    archiveOffsetMs: 0,
  } satisfies MissionContext;
  const mission = {
    ...clock,
    archiveOffsetMs: Date.parse(utcAtSol(clock, 41)) - Date.parse('2017-09-11T00:00:00Z'),
  };

  it('maps the verified original archive timestamp to Sol 41 using UTC', () => {
    expect(replaySolAt('2017-09-11T00:00:00', mission)).toBe(41);
    expect(replaySolAt('2017-09-11T08:01:51', mission)).toBe(replaySolAt('2017-09-11T08:01:51Z', mission));
    expect(radlabEventSol(mission)).toBe(41);
    expect(RADLAB_MANIFEST.verifiedEventReading.timestampArchive).toBe('2017-09-11T08:01:51');
  });

  it('preserves unmeasured hours and source reading counts without filling gaps', () => {
    expect(RADLAB_HOURLY).toHaveLength(336);
    expect(RADLAB_HOURLY.filter((hour) => hour.absorbedDoseRate === null)).toHaveLength(6);
    expect(RADLAB_HOURLY.find((hour) => hour.hourStartUtc === '2017-09-10T09:00:00.000Z'))
      .toMatchObject({ timestampArchive: null, absorbedDoseRate: null, sampleCount: 0 });
    expect(RADLAB_HOURLY.reduce((count, hour) => count + hour.sampleCount, 0))
      .toBe(RADLAB_MANIFEST.rawReadingCount);
  });
});
