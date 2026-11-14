import { METRIC_IDS, METRICS, SOL_LENGTH_SECONDS, SYMPTOM_OPTIONS, utcAtSol } from '../contracts';
import type { AstronautProfile, CheckinEntry, DailyCheckin, DemoScenario, HabitatSample, MetricId, MissionContext } from '../contracts';

export const DEFAULT_SCENARIO_ID = 'sol-43-after-the-storm';
export const SCENARIO_IDS = [DEFAULT_SCENARIO_ID, 'routine-sol', 'bad-entry'] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

const profile: AstronautProfile = {
  id: 'maya-chen',
  displayName: 'Maya Chen',
  role: 'Mission Specialist',
  isSynthetic: true,
};

const missionStartUtc = '2039-06-01T00:00:00.000Z';
const startSol = 43;
const archiveReplayStartSol = 41;
const archiveEventDayUtc = '2017-09-11T00:00:00.000Z';
const archiveReplayStartMs = Date.parse(missionStartUtc) + (archiveReplayStartSol - 1) * SOL_LENGTH_SECONDS * 1000;
const missionContext: MissionContext = {
  missionStartUtc,
  solLengthSeconds: SOL_LENGTH_SECONDS,
  oneWayDelayMinutes: 20,
  habitat: 'Gale Crater Habitat',
  archiveOffsetMs: archiveReplayStartMs - Date.parse(archiveEventDayUtc),
};

export const HERO_PREFILL: Record<MetricId, number> = {
  heart_rate: 68,
  bp_systolic: 116,
  bp_diastolic: 74,
  body_temp: 36.7,
  blood_glucose: 94,
  sleep_duration: 4.5,
  mood: 2,
  // Stand-up test: normal response (small drop, modest pulse rise).
  heart_rate_standing: 76,
  bp_systolic_standing: 112,
  bp_diastolic_standing: 76,
  fluid_intake: 2.3,
  // Exercise is still short after the shelter days.
  exercise_minutes: 45,
  // Camera breathing rate is normal; HRV is down after the short-sleep shelter sols.
  respiratory_rate: 16,
  hrv_rmssd: 32,
  // Shelter rations and menu fatigue: still eating little; weight down 1.8%, not yet flagged.
  calorie_intake: 1900,
  body_mass: 59.9,
  // Voice check: flatter, slower reading with longer pauses than her usual (synthetic).
  voice_pitch_variability: 1.7,
  voice_articulation_rate: 4.3,
  voice_pause_ratio: 26,
};

/** Shelter protocol (sols 41–42) and the sol before: exercise was cut short. */
const shortExerciseBySol: Partial<Record<number, number>> = { 40: 50, 41: 20, 42: 35 };
/** Crowded shelter raised cabin CO2 (synthetic ECLSS readings). */
const shelterCo2BySol: Partial<Record<number, { co2Mmhg: number; cabinTempC: number }>> = {
  41: { co2Mmhg: 3.4, cabinTempC: 24.1 },
  42: { co2Mmhg: 3.2, cabinTempC: 23.6 },
  43: { co2Mmhg: 2.6, cabinTempC: 22.8 },
};
const shelterHeadacheSols = new Set([41, 42]);

/** HRV dipped during the crowded, short-sleep shelter sols (synthetic). */
const shelterHrvBySol: Partial<Record<number, number>> = { 41: 37, 42: 34 };

/** Crowded shelter, rationed menu: food energy dropped (synthetic). */
const shelterKcalBySol: Partial<Record<number, number>> = { 40: 1750, 41: 1600, 42: 1800 };

/** Crowded shelter sols: the read-aloud passage sounded flatter and more hesitant (synthetic). */
const shelterVoiceBySol: Partial<Record<number, { pitch: number; pace: number; pauses: number }>> = {
  41: { pitch: 2.0, pace: 4.5, pauses: 22 },
  42: { pitch: 1.9, pace: 4.4, pauses: 24 },
};

const lowerSleepBySol: Partial<Record<number, number>> = { 39: 5.1, 40: 4.8, 42: 4.6 };

function historicalValues(sol: number, includesTrend: boolean): Record<MetricId, number> {
  const lowerSleep = includesTrend ? lowerSleepBySol[sol] : undefined;
  const voice = includesTrend ? shelterVoiceBySol[sol] : undefined;
  return {
    heart_rate: 68 + (sol % 5) - 2,
    bp_systolic: 116 + (sol % 5) - 2,
    bp_diastolic: 74 + (sol % 3) - 1,
    body_temp: Number((36.7 + ((sol % 3) - 1) / 10).toFixed(1)),
    blood_glucose: 94 + (sol % 5) - 2,
    sleep_duration: lowerSleep ?? (sol % 2 === 0 ? 7.5 : 7.75),
    mood: lowerSleep === undefined ? 4 : 2,
    heart_rate_standing: 68 + (sol % 5) - 2 + 8,
    bp_systolic_standing: 116 + (sol % 5) - 2 - 4,
    bp_diastolic_standing: 74 + (sol % 3) - 1 + 2,
    fluid_intake: Number((2.3 + (sol % 3) / 10).toFixed(1)),
    exercise_minutes: (includesTrend ? shortExerciseBySol[sol] : undefined) ?? 110 + (sol % 3) * 5,
    respiratory_rate: 14 + (sol % 3),
    hrv_rmssd: (includesTrend ? shelterHrvBySol[sol] : undefined) ?? 48 + (sol % 5) - 2,
    calorie_intake: (includesTrend ? shelterKcalBySol[sol] : undefined) ?? 2600 + (sol % 4) * 50,
    body_mass: Number((61 + ((sol % 3) - 1) / 10).toFixed(1)),
    voice_pitch_variability: voice?.pitch ?? Number((2.5 + (sol % 3) / 10).toFixed(1)),
    voice_articulation_rate: voice?.pace ?? Number((4.7 + (sol % 4) * 0.05).toFixed(2)),
    voice_pause_ratio: voice?.pauses ?? 17 + (sol % 3),
  };
}

function environmentFor(scenarioId: ScenarioId): HabitatSample[] {
  return Array.from({ length: startSol }, (_, index) => {
    const sol = index + 1;
    const shelter = scenarioId === DEFAULT_SCENARIO_ID ? shelterCo2BySol[sol] : undefined;
    return {
      sol,
      co2Mmhg: shelter?.co2Mmhg ?? Number((2.0 + (sol % 4) / 10).toFixed(1)),
      cabinTempC: shelter?.cabinTempC ?? Number((22 + (sol % 3) * 0.3).toFixed(1)),
      provenance: 'synthetic_demo' as const,
    };
  });
}

function historicalCheckin(sol: number, scenarioId: ScenarioId): DailyCheckin {
  const submittedAtUtc = utcAtSol(missionContext, sol, 8 * 60 * 60);
  const id = `${profile.id}-sol-${sol}`;
  const values = historicalValues(sol, scenarioId === DEFAULT_SCENARIO_ID);
  const metrics = scenarioId === 'routine-sol' && sol !== 31 && sol !== 37
    ? METRIC_IDS.filter((metric) => metric !== 'blood_glucose')
    : METRIC_IDS;
  return {
    id,
    astronautId: profile.id,
    sol,
    submittedAtUtc,
    measurements: metrics.map((metric) => ({
      id: `${id}-${metric}`,
      astronautId: profile.id,
      metric,
      value: values[metric],
      unit: METRICS[metric].unit,
      observedAtUtc: submittedAtUtc,
      provenance: 'synthetic_demo',
    })),
    symptoms: SYMPTOM_OPTIONS.map(({ id, label }) => ({
      id,
      label,
      present: id === 'headache' && scenarioId === DEFAULT_SCENARIO_ID && shelterHeadacheSols.has(sol),
    })),
    note: '',
  };
}

function historyFor(scenarioId: ScenarioId): DailyCheckin[] {
  return Array.from({ length: startSol - 1 }, (_, index) => historicalCheckin(index + 1, scenarioId));
}

export const HERO_SCENARIO: DemoScenario = {
  id: DEFAULT_SCENARIO_ID,
  title: 'Sol 43, after the storm',
  description: 'Follow lower sleep and mood through a check-in, evidence review, and the Mars radiation archive.',
  profile,
  missionContext,
  history: historyFor(DEFAULT_SCENARIO_ID),
  events: [
    {
      id: 'shelter-protocol-sol-41',
      kind: 'shelter_protocol',
      startSol: 41,
      endSol: 42,
      label: 'Shelter protocol',
      provenance: 'synthetic_demo',
    },
  ],
  environment: environmentFor(DEFAULT_SCENARIO_ID),
  startSol,
};

const routinePrefill = { ...HERO_PREFILL, sleep_duration: 7.5, mood: 4, exercise_minutes: 115 };

type DemoOption = { scenario: DemoScenario; prefill: CheckinEntry['values'] };

export const DEMO_OPTIONS: Record<ScenarioId, DemoOption> = {
  [DEFAULT_SCENARIO_ID]: { scenario: HERO_SCENARIO, prefill: HERO_PREFILL },
  'routine-sol': {
    scenario: {
      id: 'routine-sol',
      title: 'Routine sol',
      description: 'Compare readings near the personal baseline and see what happens when there is too little glucose history.',
      profile, missionContext, startSol,
      history: historyFor('routine-sol'),
      events: [],
      environment: environmentFor('routine-sol'),
    },
    prefill: routinePrefill,
  },
  'bad-entry': {
    scenario: {
      id: 'bad-entry',
      title: 'Bad entry',
      description: 'Load a reversed blood pressure pair and check how the form helps you correct it before assessment.',
      profile, missionContext, startSol,
      history: historyFor('bad-entry'),
      events: [],
      environment: environmentFor('bad-entry'),
    },
    prefill: { ...routinePrefill, bp_systolic: 75, bp_diastolic: 90 },
  },
};
