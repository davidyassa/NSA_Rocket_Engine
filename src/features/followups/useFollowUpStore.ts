import { create } from 'zustand';
import type { DailyCheckin, RiskAssessment } from '../../contracts';
import { generateFollowUpTasks, type FollowUpTask } from './followUpEngine';
import { DEFAULT_SCENARIO_ID, type ScenarioId } from '../../scenarios';

const STORAGE_KEY = 'sol-check:follow-up-tasks';

export function tasksForScenario(tasks: readonly FollowUpTask[], scenarioId: string) {
  return tasks.filter((task) => (task.scenarioId ?? DEFAULT_SCENARIO_ID) === scenarioId);
}

function loadStoredTasks(): FollowUpTask[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredTasks(tasks: FollowUpTask[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // Non-fatal
  }
}

interface FollowUpStore {
  tasks: FollowUpTask[];
  syncWithAssessment: (checkin: DailyCheckin, assessment: RiskAssessment, scenarioId: ScenarioId) => void;
  setTasks: (tasks: FollowUpTask[], scenarioId: ScenarioId) => void;
  resetTasks: () => void;
}

export const useFollowUpStore = create<FollowUpStore>((set, get) => ({
  tasks: loadStoredTasks(),

  syncWithAssessment: (checkin, assessment, scenarioId) => {
    const current = tasksForScenario(get().tasks, scenarioId);
    const generated = generateFollowUpTasks(checkin, assessment, current, scenarioId);
    if (current.length !== generated.length) get().setTasks(generated, scenarioId);
  },

  setTasks: (tasks, scenarioId) => {
    const merged = [...get().tasks.filter((task) => (task.scenarioId ?? DEFAULT_SCENARIO_ID) !== scenarioId), ...tasks];
    saveStoredTasks(merged);
    set({ tasks: merged });
  },

  resetTasks: () => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Non-fatal
      }
    }
    set({ tasks: [] });
  },
}));
