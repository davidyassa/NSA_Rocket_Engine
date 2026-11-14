import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENVIRONMENT_THRESHOLDS,
  summarizeEnvironment,
  inferEnvironmentEvent,
  currentSnapshot,
  type CompartmentSnapshot,
  type EnvironmentFrame,
} from './compartmentEnvironmentEngine';
import { SPACECRAFT_COMPARTMENTS, ENVIRONMENT_SCENARIO_MAP, frameNowMs } from './radiationData';
import { CO2_LIMIT_MMHG } from '../../engine/rules';

const EPOCH = Date.parse('2031-05-14T12:00:00.000Z');
const ids = SPACECRAFT_COMPARTMENTS.map((c) => c.id);

function snap(
  roomId: string,
  values: Partial<Pick<CompartmentSnapshot, 'radiationDoseRateMsvH' | 'temperatureC' | 'co2Mmhg'>>,
  frameIndex = 0,
): CompartmentSnapshot {
  return {
    roomId,
    radiationDoseRateMsvH: values.radiationDoseRateMsvH ?? 0.08,
    temperatureC: values.temperatureC ?? 22,
    co2Mmhg: values.co2Mmhg ?? 2.2,
    timestamp: new Date(EPOCH + frameIndex * 60_000).toISOString(),
    origin: 'simulated',
  };
}

/** Run inference over a whole scenario fixture (all frames up to the last). */
function inferScenario(key: string) {
  const scenario = ENVIRONMENT_SCENARIO_MAP[key];
  const now = frameNowMs(scenario.frames[scenario.frames.length - 1]);
  return inferEnvironmentEvent(scenario.frames, SPACECRAFT_COMPARTMENTS, now, {
    recoveryActive: scenario.recoveryActive,
  });
}

describe('summarizeEnvironment (three independent averages)', () => {
  it('computes the arithmetic mean of all six valid nodes, including the shelter', () => {
    const frame: EnvironmentFrame = [
      snap('flight-deck', { temperatureC: 22, radiationDoseRateMsvH: 0.1, co2Mmhg: 2.0 }),
      snap('airlock', { temperatureC: 24, radiationDoseRateMsvH: 0.2, co2Mmhg: 2.2 }),
      snap('habitation', { temperatureC: 20, radiationDoseRateMsvH: 0.3, co2Mmhg: 2.4 }),
      snap('storm-shelter', { temperatureC: 26, radiationDoseRateMsvH: 0.4, co2Mmhg: 2.6 }),
      snap('galley', { temperatureC: 22, radiationDoseRateMsvH: 0.5, co2Mmhg: 2.8 }),
      snap('equipment-bay', { temperatureC: 22, radiationDoseRateMsvH: 0.6, co2Mmhg: 3.0 }),
    ];
    const summary = summarizeEnvironment(frame, EPOCH);
    expect(summary.avgTemperatureC).toBeCloseTo((22 + 24 + 20 + 26 + 22 + 22) / 6, 6);
    expect(summary.avgRadiationMsvH).toBeCloseTo((0.1 + 0.2 + 0.3 + 0.4 + 0.5 + 0.6) / 6, 6);
    expect(summary.avgCo2Mmhg).toBeCloseTo((2.0 + 2.2 + 2.4 + 2.6 + 2.8 + 3.0) / 6, 6);
    expect(summary.validCounts).toEqual({ temperature: 6, radiation: 6, co2: 6 });
    expect(summary.totalNodes).toBe(6);
  });

  it('excludes missing (null) readings and never substitutes zero', () => {
    const frame: EnvironmentFrame = [
      snap('flight-deck', { temperatureC: 20 }),
      snap('airlock', { temperatureC: 30 }),
      { ...snap('habitation', {}), temperatureC: null, radiationDoseRateMsvH: null, co2Mmhg: null },
    ];
    const summary = summarizeEnvironment(frame, EPOCH);
    expect(summary.avgTemperatureC).toBe(25); // mean of 20 and 30 only, not /3
    expect(summary.validCounts.temperature).toBe(2);
    expect(summary.totalNodes).toBe(3);
  });

  it('excludes stale readings older than the stale window', () => {
    const frame: EnvironmentFrame = [
      snap('flight-deck', { temperatureC: 20 }, 0),
      snap('airlock', { temperatureC: 40 }, 0),
      // one reading timestamped 30 minutes before "now"
      { ...snap('habitation', { temperatureC: 100 }), timestamp: new Date(EPOCH - 30 * 60_000).toISOString() },
    ];
    const now = EPOCH;
    const summary = summarizeEnvironment(frame, now);
    expect(summary.avgTemperatureC).toBe(30); // stale 100 dropped
    expect(summary.validCounts.temperature).toBe(2);
  });

  it('returns null (Unavailable) when a metric has no valid samples', () => {
    const frame: EnvironmentFrame = [
      { ...snap('flight-deck', {}), temperatureC: null },
    ];
    const summary = summarizeEnvironment(frame, EPOCH);
    expect(summary.avgTemperatureC).toBeNull();
    expect(summary.validCounts.temperature).toBe(0);
  });
});

describe('currentSnapshot', () => {
  it('returns the most recent reading per room across frames', () => {
    const frames: EnvironmentFrame[] = [
      [snap('flight-deck', { radiationDoseRateMsvH: 0.1 }, 0)],
      [snap('flight-deck', { radiationDoseRateMsvH: 2.9 }, 1)],
    ];
    const latest = currentSnapshot(frames);
    expect(latest).toHaveLength(1);
    expect(latest[0].radiationDoseRateMsvH).toBe(2.9);
  });
});

describe('inferEnvironmentEvent — alarm triggers', () => {
  it('correlated radiation + temperature spike: ALERT, corroborated, sunward first hit', () => {
    const event = inferScenario('ORANGE');
    expect(event.state).toBe('ALERT');
    expect(event.possibleRadiationEvent).toBe(true);
    expect(event.temperatureCorroborated).toBe(true);
    expect(event.firstHitRoomIds.sort()).toEqual(['airlock', 'flight-deck']);
    expect(event.estimatedSector).toMatch(/Forward/);
    expect(event.confidence).not.toBe('insufficient');
  });

  it('radiation-only spike (flat temperature) still alarms, but is not corroborated', () => {
    const event = inferScenario('RADIATION_ONLY');
    expect(event.state).toBe('ALERT');
    expect(event.possibleRadiationEvent).toBe(true);
    expect(event.temperatureCorroborated).toBe(false);
    expect(event.firstHitRoomIds).toContain('airlock');
    expect(event.explanation).toMatch(/did not corroborate/i);
  });

  it('aft event produces a different estimated sector than the sunward event', () => {
    const sunward = inferScenario('ORANGE');
    const aft = inferScenario('AFT_EVENT');
    expect(aft.state).toBe('ALERT');
    expect(aft.firstHitRoomIds.sort()).toEqual(['equipment-bay', 'galley']);
    expect(aft.estimatedSector).toBeTruthy();
    expect(aft.estimatedSector).not.toEqual(sunward.estimatedSector);
    expect(aft.estimatedSector).toMatch(/Aft|Starboard/);
  });

  it('diffuse simultaneous spike alarms but reports Direction uncertain', () => {
    const event = inferScenario('DIFFUSE');
    expect(event.state).toBe('ALERT');
    expect(event.possibleRadiationEvent).toBe(true);
    expect(event.estimatedSector).toBeNull();
    expect(event.confidence).toBe('insufficient');
    expect(event.explanation).toMatch(/Direction uncertain/i);
  });
});

describe('inferEnvironmentEvent — non-radiation states', () => {
  it('CO2-only anomaly is a WATCH air-quality warning, not a solar alert', () => {
    const event = inferScenario('CO2_ONLY');
    expect(event.possibleRadiationEvent).toBe(false);
    expect(event.state).toBe('WATCH');
    expect(event.co2Anomaly).toBe(true);
    expect(event.explanation).toMatch(new RegExp(`${CO2_LIMIT_MMHG} mmHg`));
    expect(event.firstHitRoomIds).toEqual([]);
  });

  it('green baseline is NOMINAL with no alarm', () => {
    const event = inferScenario('GREEN');
    expect(event.state).toBe('NOMINAL');
    expect(event.possibleRadiationEvent).toBe(false);
    expect(event.co2Anomaly).toBe(false);
  });

  it('yellow elevated radiation (<2.1) is WATCH, not ALERT', () => {
    const event = inferScenario('YELLOW');
    expect(event.possibleRadiationEvent).toBe(false);
    expect(event.state).toBe('WATCH');
  });

  it('recovery preset reports RECOVERY state', () => {
    const event = inferScenario('RECOVERY');
    expect(event.state).toBe('RECOVERY');
    expect(event.possibleRadiationEvent).toBe(false);
  });

  it('sensor-gap scenario keeps shelter/averages honest (node omitted from current snapshot)', () => {
    const scenario = ENVIRONMENT_SCENARIO_MAP.SENSOR_GAP;
    const frame = scenario.frames[0];
    const now = frameNowMs(frame);
    const summary = summarizeEnvironment(frame, now);
    expect(summary.totalNodes).toBe(6);
    expect(summary.validCounts.radiation).toBe(5); // equipment-bay missing
  });
});

describe('inferEnvironmentEvent — first-onset ordering (timestamps, not magnitude)', () => {
  it('uses the earliest onset for first hit even when a later node spikes higher', () => {
    // flight-deck spikes first (small), airlock spikes much higher but later.
    const frames: EnvironmentFrame[] = [
      ids.map((id) => snap(id, {}, 0)),
      ids.map((id) => snap(id, id === 'flight-deck' ? { radiationDoseRateMsvH: 2.3, temperatureC: 25 } : {}, 1)),
      ids.map((id) => snap(id, id === 'flight-deck'
        ? { radiationDoseRateMsvH: 2.3, temperatureC: 25 }
        : id === 'airlock'
          ? { radiationDoseRateMsvH: 9.9, temperatureC: 28 }
          : {}, 2)),
    ];
    const now = frameNowMs(frames[frames.length - 1]);
    const event = inferEnvironmentEvent(frames, SPACECRAFT_COMPARTMENTS, now);
    // Peak is airlock, but the earliest onset is flight-deck.
    expect(event.peakRoomId).toBe('airlock');
    const firstOnset = Math.min(...Object.values(event.firstHitTimestamps).map(Date.parse));
    expect(event.firstHitTimestamps['flight-deck'] && Date.parse(event.firstHitTimestamps['flight-deck'])).toBe(firstOnset);
    expect(event.firstHitRoomIds).toContain('flight-deck');
  });

  it('reversing which side is hit first flips the estimated sector', () => {
    function twoNodeEvent(firstId: string, secondId: string) {
      const frames: EnvironmentFrame[] = [
        ids.map((id) => snap(id, {}, 0)),
        ids.map((id) => snap(id, id === firstId ? { radiationDoseRateMsvH: 3.0, temperatureC: 26 } : {}, 1)),
        ids.map((id) => snap(id, (id === firstId || id === secondId) ? { radiationDoseRateMsvH: 3.0, temperatureC: 26 } : {}, 2)),
      ];
      const now = frameNowMs(frames[frames.length - 1]);
      return inferEnvironmentEvent(frames, SPACECRAFT_COMPARTMENTS, now);
    }
    const sunward = twoNodeEvent('airlock', 'flight-deck');
    const aft = twoNodeEvent('equipment-bay', 'galley');
    expect(sunward.estimatedSector).toBeTruthy();
    expect(aft.estimatedSector).toBeTruthy();
    expect(sunward.estimatedSector).not.toEqual(aft.estimatedSector);
  });
});

describe('thresholds are documented simulation values', () => {
  it('reuses the CARN acute-breach rate as the radiation alarm level', () => {
    expect(DEFAULT_ENVIRONMENT_THRESHOLDS.radiationAlarmMsvH).toBe(2.1);
  });
});
