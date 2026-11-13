import { ClipboardCheck } from 'lucide-react';
import type { DailyCheckin, MetricId } from '../../contracts';
import { confirmTap } from '../../app/native';
import { useMissionStore } from '../../app/store';

export const ROUTINE_CHECKLIST_ITEMS = [
  { id: 'bp', label: 'Blood pressure', metrics: ['bp_systolic', 'bp_diastolic'] },
  { id: 'heart_rate', label: 'Resting pulse', metrics: ['heart_rate'] },
  { id: 'body_temp', label: 'Body temperature', metrics: ['body_temp'] },
  { id: 'blood_glucose', label: 'Blood sugar', metrics: ['blood_glucose'] },
  { id: 'sleep_duration', label: 'Sleep duration', metrics: ['sleep_duration'] },
  { id: 'behavioral', label: 'Mood', metrics: ['mood'] },
  { id: 'symptoms', label: 'Symptom review', metrics: [] },
] as const satisfies readonly { id: string; label: string; metrics: readonly MetricId[] }[];

export function routineChecklistItems(sol: number, latest: DailyCheckin | null, savedChecks: readonly string[]) {
  const record = latest?.sol === sol ? latest : null;
  const measured = new Set(record?.measurements.map(({ metric }) => metric));
  return ROUTINE_CHECKLIST_ITEMS.map((item) => {
    const recorded = item.id === 'symptoms'
      ? Boolean(record?.symptoms.length)
      : item.metrics.every((metric) => measured.has(metric));
    return { ...item, recorded, checked: recorded || savedChecks.includes(item.id) };
  });
}

export function useRoutineChecklist(sol: number, latest: DailyCheckin | null) {
  const mission = useMissionStore((state) => state.mission);
  const toggleChecklistItem = useMissionStore((state) => state.toggleChecklistItem);
  const items = routineChecklistItems(sol, latest, mission.checklist?.[mission.scenarioId]?.[String(sol)] ?? []);
  const completeCount = items.filter(({ checked }) => checked).length;

  return {
    items,
    completeCount,
    onToggle(id: string) {
      toggleChecklistItem(id, sol);
      void confirmTap();
    },
  };
}

export function RoutineChecklist({ items, completeCount, onToggle }: ReturnType<typeof useRoutineChecklist>) {
  if (completeCount === items.length) return null;

  return (
    <section className="panel routine-reminder-panel" aria-labelledby="reminder-heading">
      <div className="routine-checklist-header">
        <div className="routine-checklist-lead">
          <ClipboardCheck size={18} aria-hidden="true" />
          <h2 id="reminder-heading">Daily checklist</h2>
        </div>
        <span className="routine-checklist-count" aria-live="polite">{completeCount} of {items.length} complete</span>
      </div>
      <ul className="routine-checklist-items" role="list">
        {items.map(({ id, label, checked, recorded }) => (
          <li key={id} className={`routine-checklist-item${checked ? ' is-checked' : ''}`}>
            <label className="routine-checklist-label">
              <input type="checkbox" checked={checked} disabled={recorded} onChange={() => onToggle(id)} />
              {label}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
