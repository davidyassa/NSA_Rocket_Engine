import { create } from 'zustand';
import type { DailyCheckin, RiskAssessment } from '../../contracts';
import { generateFollowUpTasks, type FollowUpTask } from './followUpEngine';

const STORAGE_KEY = 'sol-check:follow-up-tasks';

function loadStoredTasks(): FollowUpTask[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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
  syncWithAssessment: (checkin: DailyCheckin, assessment: RiskAssessment) => void;
  setTasks: (tasks: FollowUpTask[]) => void;
  resetTasks: () => void;
}

export const useFollowUpStore = create<FollowUpStore>((set, get) => ({
  tasks: loadStoredTasks(),

  syncWithAssessment: (checkin, assessment) => {
    const current = get().tasks;
    const generated = generateFollowUpTasks(checkin, assessment, current);
    saveStoredTasks(generated);
    set({ tasks: generated });
  },

  setTasks: (tasks) => {
    saveStoredTasks(tasks);
    set({ tasks });
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
