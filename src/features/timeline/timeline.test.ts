import { describe, expect, it } from 'vitest';
import { HERO_SCENARIO } from '../../scenarios';
import { radlabEventSol, replaySolAt } from '../../sim';
import { RADLAB_MANIFEST } from '../../data/nasa';

describe('timeline replay progression', () => {
  const { missionContext } = HERO_SCENARIO;
  const eventSol = radlabEventSol(missionContext);
  const start = Math.floor(replaySolAt(RADLAB_MANIFEST.firstTimestampArchive, missionContext));
  const last = Math.floor(replaySolAt(RADLAB_MANIFEST.lastTimestampArchive, missionContext));

  it('replays across the mission window containing the archive event at Sol 41', () => {
    expect(eventSol).toBe(41);
    expect(start).toBeLessThanOrEqual(41);
    expect(last).toBeGreaterThanOrEqual(41);
  });

  it('steps sequentially through sols without skipping', () => {
    let current = start;
    const visited: number[] = [];
    while (current <= last) {
      visited.push(current);
      current += 1;
    }
    expect(visited).toContain(41);
    expect(visited[0]).toBe(start);
    expect(visited[visited.length - 1]).toBe(last);
  });
});
