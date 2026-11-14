import type { MissionContext } from '../contracts';
import { RADLAB_MANIFEST } from '../data/nasa';

export function replaySolAt(archiveTimestamp: string, mission: MissionContext): number {
  const utcTimestamp = archiveTimestamp.endsWith('Z') ? archiveTimestamp : `${archiveTimestamp}Z`;
  const replayOffsetMs = Date.parse(utcTimestamp) + mission.archiveOffsetMs - Date.parse(mission.missionStartUtc);
  return 1 + replayOffsetMs / (mission.solLengthSeconds * 1000);
}

export function radlabEventSol(mission: MissionContext): number {
  return Math.floor(replaySolAt(RADLAB_MANIFEST.verifiedEventReading.timestampArchive, mission));
}
