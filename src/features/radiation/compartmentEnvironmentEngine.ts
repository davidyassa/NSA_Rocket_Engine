/**
 * Compartment Environment Engine (Radiation Map upgrade)
 *
 * Pure, dependency-free telemetry helpers that layer three independent
 * environmental metrics over the existing CARN radiation model:
 *   - Radiation dose rate (mSv/h)  — safety-critical primary signal
 *   - Temperature (°C)             — corroborating evidence ONLY when it rises
 *   - Carbon dioxide (mmHg)        — independent air-quality metric
 *
 * IMPORTANT SCIENTIFIC DISTINCTIONS (enforced in code and surfaced in the UI):
 *   - Radiation independently triggers alarms. Temperature is corroboration, not a trigger.
 *   - Radiation does NOT necessarily raise cabin temperature, so a radiation spike with
 *     flat temperature must still alarm.
 *   - CO2 is never evidence of a solar event. It is a separate environmental warning.
 *   - With six sensors and minute-scale sampling the sector estimate is a
 *     DEMONSTRATION-LEVEL spatial heuristic, never a confirmed solar-flare bearing.
 *
 * All thresholds here are documented SIMULATION values, not NASA-certified flight limits.
 * The one reused certified-style constant is the CO2 1-hour limit from engine/rules.
 */

import { CARN_RATES, type CompartmentNode } from './radiationEngine';
import { CO2_LIMIT_MMHG } from '../../engine/rules';

export type SensorOrigin = 'simulated' | 'measured' | 'imported';

export interface CompartmentSnapshot {
  roomId: string;
  radiationDoseRateMsvH: number | null;
  temperatureC: number | null;
  co2Mmhg: number | null;
  timestamp: string; // ISO 8601
  origin: SensorOrigin;
}

/** All six compartment snapshots at a single logical sampling time. */
export type EnvironmentFrame = CompartmentSnapshot[];

export type MetricKey = 'temperature' | 'radiation' | 'co2';

export interface EnvironmentalSummary {
  avgTemperatureC: number | null;
  avgRadiationMsvH: number | null;
  avgCo2Mmhg: number | null;
  validCounts: { temperature: number; radiation: number; co2: number };
  totalNodes: number;
}

export type EventState = 'NOMINAL' | 'WATCH' | 'ALERT' | 'RECOVERY';
export type DirectionConfidence = 'insufficient' | 'low' | 'medium';

export interface EventLocalization {
  state: EventState;
  possibleRadiationEvent: boolean;
  temperatureCorroborated: boolean;
  co2Anomaly: boolean;
  affectedRoomIds: string[];
  firstHitRoomIds: string[];
  firstHitTimestamps: Record<string, string>;
  estimatedSector: string | null;
  confidence: DirectionConfidence;
  explanation: string;
  peakRoomId: string | null;
  peakDoseRateMsvH: number | null;
}

export interface EnvironmentThresholds {
  /** Readings older than this (vs. `now`) are ignored for current averages & current event state. */
  staleWindowMs: number;
  /** Sustained radiation increase over a node's pre-event baseline to count as an onset. */
  radiationDeltaMsvH: number;
  /** Absolute dose floor a reading must also clear to count as an onset (avoids noise). */
  radiationOnsetFloorMsvH: number;
  /** Peak dose rate that, alone, constitutes a radiation ALARM (reuses the CARN acute-breach rule). */
  radiationAlarmMsvH: number;
  /** Temperature rise over baseline (in affected rooms) that counts as corroboration. */
  temperatureDeltaC: number;
  /** Earliest-onset grouping window: onsets within this of the first onset are "first hit". */
  firstHitWindowMs: number;
  /** Leading frames treated as the pre-event stable baseline. */
  baselineFrames: number;
}

/**
 * Documented SIMULATION thresholds. These are exploratory anomaly-detection deltas,
 * NOT certified flight limits. The alarm dose reuses the existing CARN acute-breach rate.
 */
export const DEFAULT_ENVIRONMENT_THRESHOLDS: EnvironmentThresholds = {
  staleWindowMs: 10 * 60_000,
  radiationDeltaMsvH: 0.3,
  radiationOnsetFloorMsvH: CARN_RATES.SAFE_BASELINE_HOURLY, // 0.15
  radiationAlarmMsvH: CARN_RATES.ACUTE_BREACH_HOURLY, // 2.1
  temperatureDeltaC: 1.5,
  firstHitWindowMs: 90_000,
  baselineFrames: 2,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFresh(timestamp: string, now: number, staleWindowMs: number): boolean {
  const t = Date.parse(timestamp);
  if (!Number.isFinite(t)) return false;
  // Future-dated readings (clock skew in synthetic fixtures) are treated as fresh.
  return now - t <= staleWindowMs;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Arithmetic mean of each metric across all compartments, independently excluding
 * invalid (non-finite / missing) and stale readings. Never substitutes zero.
 */
export function summarizeEnvironment(
  snapshot: readonly CompartmentSnapshot[],
  now: number,
  thresholds: EnvironmentThresholds = DEFAULT_ENVIRONMENT_THRESHOLDS,
): EnvironmentalSummary {
  const fresh = snapshot.filter((reading) => isFresh(reading.timestamp, now, thresholds.staleWindowMs));

  const temperature = fresh
    .map((reading) => reading.temperatureC)
    .filter(isFiniteNumber);
  const radiation = fresh
    .map((reading) => reading.radiationDoseRateMsvH)
    .filter(isFiniteNumber);
  const co2 = fresh
    .map((reading) => reading.co2Mmhg)
    .filter(isFiniteNumber);

  return {
    avgTemperatureC: mean(temperature),
    avgRadiationMsvH: mean(radiation),
    avgCo2Mmhg: mean(co2),
    validCounts: { temperature: temperature.length, radiation: radiation.length, co2: co2.length },
    totalNodes: snapshot.length,
  };
}

/** Group a list of time-ordered frames into per-room, time-ordered histories. */
export function framesToHistory(frames: readonly EnvironmentFrame[]): Map<string, CompartmentSnapshot[]> {
  const history = new Map<string, CompartmentSnapshot[]>();
  for (const frame of frames) {
    for (const reading of frame) {
      const list = history.get(reading.roomId) ?? [];
      list.push(reading);
      history.set(reading.roomId, list);
    }
  }
  for (const list of history.values()) {
    list.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  }
  return history;
}

/** The most recent snapshot per room (ignores rooms that never reported). */
export function currentSnapshot(frames: readonly EnvironmentFrame[]): CompartmentSnapshot[] {
  const history = framesToHistory(frames);
  const latest: CompartmentSnapshot[] = [];
  for (const list of history.values()) {
    if (list.length) latest.push(list[list.length - 1]);
  }
  return latest;
}

function baselineValue(
  history: CompartmentSnapshot[],
  metric: 'radiationDoseRateMsvH' | 'temperatureC',
  baselineFrames: number,
): number | null {
  const leading = history.slice(0, Math.max(1, baselineFrames));
  const values = leading.map((reading) => reading[metric]).filter(isFiniteNumber);
  return mean(values);
}

/**
 * First timestamp at which a room's radiation sustains above (baseline + delta) and a noise floor.
 * "Sustained" = the next reading also qualifies, OR the reading alone exceeds the alarm rate.
 * Returns the FIRST qualifying onset so a large late spike never overwrites an earlier one.
 */
function findRadiationOnset(
  history: CompartmentSnapshot[],
  thresholds: EnvironmentThresholds,
): string | null {
  const baseline = baselineValue(history, 'radiationDoseRateMsvH', thresholds.baselineFrames) ?? 0;
  const qualifies = (reading: CompartmentSnapshot): boolean => {
    const rate = reading.radiationDoseRateMsvH;
    if (!isFiniteNumber(rate)) return false;
    return rate >= baseline + thresholds.radiationDeltaMsvH && rate > thresholds.radiationOnsetFloorMsvH;
  };

  for (let i = 0; i < history.length; i += 1) {
    const reading = history[i];
    if (!qualifies(reading)) continue;
    const rate = reading.radiationDoseRateMsvH as number;
    const sustained = rate > thresholds.radiationAlarmMsvH
      || (i + 1 < history.length && qualifies(history[i + 1]))
      || i === history.length - 1; // single-sample fixtures: accept the qualifying reading
    if (sustained) return reading.timestamp;
  }
  return null;
}

/** Descriptive phrase per compartment quadrant (a label, not a celestial bearing). */
const QUADRANT_PHRASE: Record<CompartmentNode['quadrant'], string> = {
  sunward: 'Forward / sunward',
  core: 'Core / central',
  leeward: 'Port / leeward',
  aft: 'Aft / engine',
};
const QUADRANT_ORDER: CompartmentNode['quadrant'][] = ['sunward', 'core', 'leeward', 'aft'];

function sectorLabelFromQuadrants(quadrants: CompartmentNode['quadrant'][]): string {
  const distinct = QUADRANT_ORDER.filter((quadrant) => quadrants.includes(quadrant));
  return `${distinct.map((quadrant) => QUADRANT_PHRASE[quadrant]).join(' + ')} sector (simulation)`;
}

function angleFor(point: { x: number; y: number }, origin: { x: number; y: number }): number {
  const dx = point.x - origin.x;
  const dyUp = -(point.y - origin.y);
  return (Math.atan2(dyUp, dx) * 180) / Math.PI;
}

function angularSpreadDeg(angles: number[]): number {
  if (angles.length < 2) return 0;
  let maxGap = 0;
  for (let i = 0; i < angles.length; i += 1) {
    for (let j = i + 1; j < angles.length; j += 1) {
      let diff = Math.abs(angles[i] - angles[j]) % 360;
      if (diff > 180) diff = 360 - diff;
      maxGap = Math.max(maxGap, diff);
    }
  }
  return maxGap;
}

/**
 * Rough, model-relative exposed-sector estimate from the earliest-hit nodes' schematic
 * coordinates. Returns `insufficient` (Direction uncertain) when evidence is too thin or
 * diffuse. This is a simulation heuristic, never a celestial bearing.
 */
function estimateSector(
  firstHitRoomIds: string[],
  compartments: CompartmentNode[],
): { estimatedSector: string | null; confidence: DirectionConfidence } {
  const total = compartments.length;
  if (firstHitRoomIds.length < 2) return { estimatedSector: null, confidence: 'insufficient' };
  // A near-simultaneous first hit across (almost) the whole vehicle is diffuse -> indeterminate.
  if (firstHitRoomIds.length >= total - 1) return { estimatedSector: null, confidence: 'insufficient' };

  const byId = new Map(compartments.map((compartment) => [compartment.id, compartment]));
  const hit = firstHitRoomIds
    .map((id) => byId.get(id))
    .filter((value): value is CompartmentNode => Boolean(value));
  if (hit.length < 2) return { estimatedSector: null, confidence: 'insufficient' };

  const stationCentroid = {
    x: mean(compartments.map((compartment) => compartment.coordinates.x)) ?? 0,
    y: mean(compartments.map((compartment) => compartment.coordinates.y)) ?? 0,
  };
  // Geometry drives the confidence (how tightly clustered the early nodes are);
  // the quadrant field provides the descriptive label.
  const spread = angularSpreadDeg(hit.map((compartment) => angleFor(compartment.coordinates, stationCentroid)));
  const confidence: DirectionConfidence = spread <= 110 ? 'medium' : 'low';
  const estimatedSector = sectorLabelFromQuadrants(hit.map((compartment) => compartment.quadrant));
  return { estimatedSector, confidence };
}

function roomName(id: string, compartments: CompartmentNode[]): string {
  return compartments.find((compartment) => compartment.id === id)?.name ?? id;
}

/**
 * Derive the current environmental event from a window of time-ordered frames.
 *
 * - Radiation is the only alarm trigger (peak dose above the CARN acute-breach rate).
 * - Temperature corroborates only where it actually rose in the first-hit rooms.
 * - CO2 is reported as an independent air-quality anomaly, never as a solar signal.
 * - First-hit ordering comes from timestamps, never from array/render order.
 */
export function inferEnvironmentEvent(
  frames: readonly EnvironmentFrame[],
  compartments: CompartmentNode[],
  now: number,
  options: { thresholds?: EnvironmentThresholds; recoveryActive?: boolean } = {},
): EventLocalization {
  const thresholds = options.thresholds ?? DEFAULT_ENVIRONMENT_THRESHOLDS;
  const history = framesToHistory(frames);
  const latest = currentSnapshot(frames).filter((reading) =>
    isFresh(reading.timestamp, now, thresholds.staleWindowMs));

  // Current peak radiation across fresh, valid readings.
  let peakRoomId: string | null = null;
  let peakDoseRateMsvH: number | null = null;
  for (const reading of latest) {
    const rate = reading.radiationDoseRateMsvH;
    if (!isFiniteNumber(rate)) continue;
    if (peakDoseRateMsvH === null || rate > peakDoseRateMsvH) {
      peakDoseRateMsvH = rate;
      peakRoomId = reading.roomId;
    }
  }

  // Radiation onsets per room (uses full ordered history, not just the current frame).
  const firstHitTimestamps: Record<string, string> = {};
  for (const [roomId, list] of history) {
    const onset = findRadiationOnset(list, thresholds);
    if (onset) firstHitTimestamps[roomId] = onset;
  }
  const affectedRoomIds = Object.keys(firstHitTimestamps);

  const co2Anomaly = latest.some((reading) => isFiniteNumber(reading.co2Mmhg) && reading.co2Mmhg >= CO2_LIMIT_MMHG);
  const anyElevated = latest.some((reading) =>
    isFiniteNumber(reading.radiationDoseRateMsvH)
    && reading.radiationDoseRateMsvH > thresholds.radiationOnsetFloorMsvH);

  const possibleRadiationEvent = peakDoseRateMsvH !== null && peakDoseRateMsvH > thresholds.radiationAlarmMsvH;

  if (!possibleRadiationEvent) {
    // No radiation alarm. Report environmental WATCH / RECOVERY / NOMINAL honestly.
    let state: EventState = 'NOMINAL';
    if (options.recoveryActive) state = 'RECOVERY';
    else if (anyElevated || co2Anomaly) state = 'WATCH';

    const notes: string[] = [];
    if (co2Anomaly) notes.push(`CO2 at or above the ${CO2_LIMIT_MMHG} mmHg cabin limit (air-quality only — not a radiation event).`);
    if (anyElevated) notes.push('Radiation elevated above safe baseline but below the solar-event alarm threshold.');
    const explanation = state === 'RECOVERY'
      ? 'Post-event recovery: dose rates nominal, stabilization window still in progress.'
      : notes.join(' ') || 'All metrics within simulated nominal baseline.';

    return {
      state,
      possibleRadiationEvent: false,
      temperatureCorroborated: false,
      co2Anomaly,
      affectedRoomIds,
      firstHitRoomIds: [],
      firstHitTimestamps,
      estimatedSector: null,
      confidence: 'insufficient',
      explanation,
      peakRoomId,
      peakDoseRateMsvH,
    };
  }

  // Radiation ALARM. Determine the earliest-onset ("first hit") group from timestamps.
  const onsetTimes = affectedRoomIds.map((id) => Date.parse(firstHitTimestamps[id]));
  const earliest = Math.min(...onsetTimes);
  const firstHitRoomIds = affectedRoomIds.filter(
    (id) => Date.parse(firstHitTimestamps[id]) - earliest <= thresholds.firstHitWindowMs,
  );

  // Temperature corroboration: did temperature rise in the first-hit rooms?
  const temperatureCorroborated = firstHitRoomIds.some((id) => {
    const list = history.get(id) ?? [];
    const base = baselineValue(list, 'temperatureC', thresholds.baselineFrames);
    const current = list.length ? list[list.length - 1].temperatureC : null;
    return isFiniteNumber(base) && isFiniteNumber(current) && current - base >= thresholds.temperatureDeltaC;
  });

  const { estimatedSector, confidence } = estimateSector(firstHitRoomIds, compartments);

  const firstNames = firstHitRoomIds.map((id) => roomName(id, compartments));
  const parts: string[] = [];
  if (firstNames.length) {
    parts.push(`Radiation rose first in ${firstNames.join(' and ')}.`);
  } else {
    parts.push('Radiation exceeded the solar-event alarm threshold.');
  }
  parts.push(temperatureCorroborated
    ? 'Temperature rose in those modules as corroboration.'
    : 'Temperature did not corroborate (radiation alarm stands on its own).');
  parts.push(estimatedSector
    ? `Estimated exposure sector: ${estimatedSector}, ${confidence} confidence.`
    : 'Direction uncertain — insufficient or diffuse temporal-spatial evidence.');

  return {
    state: 'ALERT',
    possibleRadiationEvent: true,
    temperatureCorroborated,
    co2Anomaly,
    affectedRoomIds,
    firstHitRoomIds,
    firstHitTimestamps,
    estimatedSector,
    confidence,
    explanation: parts.join(' '),
    peakRoomId,
    peakDoseRateMsvH,
  };
}
