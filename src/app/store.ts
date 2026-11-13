import { create } from 'zustand';
import {
  CORE_SYMPTOM_OPTIONS, dailyCheckinSchema, METRIC_IDS, METRICS, SYMPTOM_OPTIONS, utcAtSol,
} from '../contracts';
import type { AuditEvent, CheckinEntry, DailyCheckin, DemoScenario, HealthMeasurement, MeasurementCapture } from '../contracts';
import { validateCheckinMeasurements } from '../engine';
import { DEMO_OPTIONS, type ScenarioId } from '../scenarios';
import { createStorageRepository, emptyMission } from './storage';
import type { StoredMission } from './storage';
import type { VigilanceSession } from '../features/cognitive/vigilance';
import type { IsolationPlan } from '../features/hazards/isolationPlan';

const storage = () => createStorageRepository(window.localStorage);

function loadMission(): { mission: StoredMission; warning: string | null } {
  try {
    return { mission: storage().load() ?? emptyMission, warning: null };
  } catch {
    return { mission: emptyMission, warning: 'Saved demo data could not be read. Reset the demo to restore local storage.' };
  }
}

function captureOf(reading: HealthMeasurement): MeasurementCapture | null {
  const defaultSource = reading.source === 'manual' || reading.source === 'self_report' || reading.source === 'synthetic';
  const hasCaptureDetails = reading.capturedAtUtc !== undefined
    || reading.signalQuality != null
    || reading.algorithm !== undefined
    || reading.device !== undefined
    || (reading.source !== undefined && !defaultSource)
    || (reading.status !== undefined && reading.status !== 'accepted');
  if (!hasCaptureDetails) return null;
  return {
    capturedAtUtc: reading.capturedAtUtc,
    source: reading.source,
    status: reading.status,
    signalQuality: reading.signalQuality,
    algorithm: reading.algorithm,
    device: reading.device,
    synthetic: reading.synthetic,
  };
}

export function activeSol(mission: StoredMission) {
  const { startSol } = DEMO_OPTIONS[mission.scenarioId].scenario;
  return Math.max(startSol, mission.activeSols?.[mission.scenarioId] ?? startSol);
}

export function buildCheckin(entry: CheckinEntry, scenario: DemoScenario, sol = scenario.startSol): DailyCheckin {
  const { profile, missionContext } = scenario;
  const id = `${profile.id}:sol-${sol}`;
  const observedAtUtc = utcAtSol(missionContext, sol, 8 * 3600);
  const measurements = METRIC_IDS.flatMap((metric) => {
    const value = entry.values[metric];
    if (value === undefined) return [];
    const provenance = entry.provenance[metric] ?? 'user_entered';
    // Capture metadata only travels with explicitly user-confirmed readings.
    const capture = provenance === 'user_entered' ? entry.capture?.[metric] : undefined;
    return [{
      id: `${id}:${metric}`, astronautId: profile.id, metric, value, unit: METRICS[metric].unit,
      observedAtUtc, provenance,
      ...(capture ?? {}),
      source: capture?.source ?? (provenance === 'synthetic_demo'
        ? 'synthetic'
        : metric === 'sleep_duration' || metric === 'mood' ? 'self_report' : 'manual'),
      status: capture?.status ?? 'accepted',
      synthetic: capture?.synthetic ?? (provenance === 'synthetic_demo'),
    }];
  });

  const checkin: DailyCheckin = {
    id, astronautId: profile.id, sol, submittedAtUtc: observedAtUtc, measurements,
    symptoms: (entry.assessmentScope === 'core' ? CORE_SYMPTOM_OPTIONS : SYMPTOM_OPTIONS)
      .map(({ id, label }) => ({ id, label, present: entry.symptomIds.includes(id) })),
    ...(entry.assessmentScope ? { assessmentScope: entry.assessmentScope } : {}),
    note: entry.note.trim(),
  };
  const issues = validateCheckinMeasurements(checkin);
  if (issues.length > 0) throw new Error(issues.join(' '));
  return dailyCheckinSchema.parse(checkin);
}

export function entryFromCheckin(checkin: DailyCheckin): CheckinEntry {
  const values: CheckinEntry['values'] = {};
  const provenance: CheckinEntry['provenance'] = {};
  const capture: CheckinEntry['capture'] = {};
  for (const reading of checkin.measurements) {
    const { metric, value } = reading;
    values[metric] = value;
    if (reading.provenance === 'synthetic_demo' || reading.provenance === 'user_entered') {
      provenance[metric] = reading.provenance;
    }
    const measurementCapture = captureOf(reading);
    if (measurementCapture) capture[metric] = measurementCapture;
  }
  return {
    values, provenance, capture, note: checkin.note,
    symptomIds: checkin.symptoms.filter((symptom) => symptom.present).map((symptom) => symptom.id),
    ...(checkin.assessmentScope ? { assessmentScope: checkin.assessmentScope } : {}),
  };
}

type MissionStore = {
  mission: StoredMission;
  warning: string | null;
  loadScenario(scenarioId: ScenarioId): void;
  saveCheckin(entry: CheckinEntry): void;
  recordGroundDraft(checkinId: string): void;
  advanceSol(scenarioId: ScenarioId, sol: number): void;
  saveVigilance(scenarioId: ScenarioId, session: VigilanceSession): void;
  saveIsolationPlan(scenarioId: ScenarioId, sol: number, plan: IsolationPlan): void;
  toggleChecklistItem(itemId: string, sol: number): void;
  resetDemo(): void;
};

export const useMissionStore = create<MissionStore>((set, get) => ({
  ...loadMission(),
  loadScenario(scenarioId) {
    try {
      const repository = storage();
      const current = repository.load() ?? emptyMission;
      const mission = { ...current, scenarioId };
      repository.save(mission);
      set({ mission, warning: null });
    } catch {
      throw new Error('The scenario could not be loaded. Reset the demo or check your browser’s local storage settings.');
    }
  },
  toggleChecklistItem(itemId, sol) {
    const scenarioId = get().mission.scenarioId;
    const current = get().mission;
    const solKey = String(sol);
    const existing = current.checklist?.[scenarioId]?.[solKey] ?? [];
    const nextList = existing.includes(itemId)
      ? existing.filter((id) => id !== itemId)
      : [...existing, itemId];

    try {
      const repository = storage();
      const loaded = repository.load() ?? emptyMission;
      const mission: StoredMission = {
        ...loaded,
        checklist: {
          ...(loaded.checklist ?? {}),
          [scenarioId]: {
            ...(loaded.checklist?.[scenarioId] ?? {}),
            [solKey]: nextList,
          },
        },
      };
      repository.save(mission);
      set({ mission, warning: null });
    } catch {
      // Non-fatal
    }
  },
  saveCheckin(entry) {
    const scenarioId = get().mission.scenarioId;
    try {
      const repository = storage();
      const current = repository.load() ?? emptyMission;
      if (current.scenarioId !== scenarioId || activeSol(current) !== activeSol(get().mission)) {
        throw new Error('The active mission changed.');
      }
      const checkin = buildCheckin(entry, DEMO_OPTIONS[scenarioId].scenario, activeSol(current));
      const mission: StoredMission = {
        ...current,
        scenarioId,
        entries: {
          ...current.entries,
          [scenarioId]: [...(current.entries[scenarioId] ?? []).filter((record) => record.id !== checkin.id), checkin],
        },
        audit: [...current.audit, {
          id: crypto.randomUUID(), type: 'checkin_saved' as const, refId: `${scenarioId}/${checkin.id}`, atUtc: new Date().toISOString(),
        }].slice(-100),
      };
      repository.save(mission);
      set({ mission, warning: null });
    } catch {
      throw new Error('This check-in could not be saved on this device. Your entries are still in the form.');
    }
  },
  recordGroundDraft(checkinId) {
    const repository = storage();
    const current = repository.load() ?? emptyMission;
    if (current.scenarioId !== get().mission.scenarioId) throw new Error('The active mission changed.');
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      atUtc: new Date().toISOString(),
      type: 'ground_draft_prepared',
      refId: `${current.scenarioId}/${checkinId}`,
    };
    const mission = { ...current, audit: [...current.audit, event].slice(-100) };
    repository.save(mission);
    set({ mission, warning: null });
  },
  advanceSol(scenarioId, sol) {
    const repository = storage();
    const current = repository.load() ?? emptyMission;
    if (current.scenarioId !== scenarioId || activeSol(current) !== sol
      || !current.entries[scenarioId]?.some((record) => record.sol === sol)) {
      throw new Error('Save the current check-in before opening the next sol.');
    }
    const mission = { ...current, activeSols: { ...current.activeSols, [scenarioId]: sol + 1 } };
    repository.save(mission);
    set({ mission, warning: null });
  },
  saveVigilance(scenarioId, session) {
    const repository = storage();
    const current = repository.load() ?? get().mission;
    const baseMission = current.scenarioId === scenarioId ? current : { ...current, scenarioId };
    const history = baseMission.vigilance?.[scenarioId] ?? [];
    const mission = {
      ...baseMission,
      vigilance: {
        ...baseMission.vigilance,
        [scenarioId]: [...history.filter((item) => item.sol !== session.sol || item.mode !== session.mode), session],
      },
    };
    repository.save(mission);
    set({ mission, warning: null });
  },
  saveIsolationPlan(scenarioId, sol, plan) {
    const repository = storage();
    const current = repository.load() ?? emptyMission;
    if (current.scenarioId !== scenarioId || activeSol(current) !== sol) {
      throw new Error('The active sol changed. Open Hazard 2 for the current sol.');
    }
    const mission = {
      ...current,
      isolationPlans: {
        ...current.isolationPlans,
        [scenarioId]: { ...current.isolationPlans?.[scenarioId], [sol]: plan },
      },
    };
    repository.save(mission);
    set({ mission, warning: null });
  },
  resetDemo() {
    try {
      storage().reset();
      if (typeof window !== 'undefined') {
        try { window.localStorage.removeItem('sol-check:follow-up-tasks'); } catch { /* non-fatal */ }
      }
      set({ mission: emptyMission, warning: null });
    } catch {
      throw new Error('The demo could not be reset. Check your browser’s local storage settings.');
    }
  },
}));
