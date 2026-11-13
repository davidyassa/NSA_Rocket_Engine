import { METRIC_IDS, METRICS, SOL_LENGTH_SECONDS, SYMPTOM_OPTIONS, utcAtSol } from '../contracts';
import type { AstronautProfile, CheckinEntry, DailyCheckin, DemoScenario, MetricId, MissionContext } from '../contracts';

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
};

const lowerSleepBySol: Partial<Record<number, number>> = { 39: 5.1, 40: 4.8, 42: 4.6 };

function historicalValues(sol: number, includesTrend: boolean): Record<MetricId, number> {
  const lowerSleep = includesTrend ? lowerSleepBySol[sol] : undefined;
  return {
    heart_rate: 68 + (sol % 5) - 2,
    bp_systolic: 116 + (sol % 5) - 2,
    bp_diastolic: 74 + (sol % 3) - 1,
    body_temp: Number((36.7 + ((sol % 3) - 1) / 10).toFixed(1)),
    blood_glucose: 94 + (sol % 5) - 2,
    sleep_duration: lowerSleep ?? (sol % 2 === 0 ? 7.5 : 7.75),
    mood: lowerSleep === undefined ? 4 : 2,
  };
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
    symptoms: SYMPTOM_OPTIONS.map(({ id, label }) => ({ id, label, present: false })),
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
  startSol,
};

const routinePrefill = { ...HERO_PREFILL, sleep_duration: 7.5, mood: 4 };

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
    },
    prefill: { ...routinePrefill, bp_systolic: 75, bp_diastolic: 90 },
  },
};
