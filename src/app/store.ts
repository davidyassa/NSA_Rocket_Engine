import { create } from 'zustand';
import {
  dailyCheckinSchema, METRIC_IDS, METRICS, SYMPTOM_OPTIONS, utcAtSol,
} from '../contracts';
import type { CheckinEntry, DailyCheckin, DemoScenario, HealthMeasurement, MeasurementCapture } from '../contracts';
import { validateCheckinMeasurements } from '../engine';
import { DEMO_OPTIONS, type ScenarioId } from '../scenarios';
import { createStorageRepository, emptyMission } from './storage';
import type { StoredMission } from './storage';

const storage = () => createStorageRepository(window.localStorage);

function loadMission(): { mission: StoredMission; warning: string | null } {
  try {
    return { mission: storage().load() ?? emptyMission, warning: null };
  } catch {
    return { mission: emptyMission, warning: 'Saved demo data could not be read. Reset the demo to restore local storage.' };
  }
}

function captureOf(reading: HealthMeasurement): MeasurementCapture | null {
  if (reading.source === undefined && reading.capturedAtUtc === undefined && reading.signalQuality == null) {
    return null;
  }
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

function buildCheckin(entry: CheckinEntry, scenario: DemoScenario): DailyCheckin {
  const { profile, missionContext, startSol } = scenario;
  const id = `${profile.id}:sol-${startSol}`;
  const observedAtUtc = utcAtSol(missionContext, startSol, 8 * 3600);
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
    }];
  });

  const checkin: DailyCheckin = {
    id, astronautId: profile.id, sol: startSol, submittedAtUtc: observedAtUtc, measurements,
    symptoms: SYMPTOM_OPTIONS.map(({ id, label }) => ({ id, label, present: entry.symptomIds.includes(id) })),
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
  };
}

type MissionStore = {
  mission: StoredMission;
  warning: string | null;
  loadScenario(scenarioId: ScenarioId): void;
  saveCheckin(entry: CheckinEntry): void;
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
    const checkin = buildCheckin(entry, DEMO_OPTIONS[scenarioId].scenario);
    try {
      const repository = storage();
      const current = repository.load() ?? emptyMission;
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
  resetDemo() {
    try {
      storage().reset();
      set({ mission: emptyMission, warning: null });
    } catch {
      throw new Error('The demo could not be reset. Check your browser’s local storage settings.');
    }
  },
}));
