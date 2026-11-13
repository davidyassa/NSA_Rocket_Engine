import { Bell, CheckCircle2, CircleAlert, ClipboardCheck, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { utcAtSol, type DailyCheckin, type DemoScenario } from '../../contracts';
import { confirmTap } from '../../app/native';
import { useMissionStore } from '../../app/store';

export const ROUTINE_CHECKLIST_ITEMS = [
  { id: 'bp', label: 'Blood pressure', hint: 'Upper-arm cuff at rest (systolic & diastolic mmHg)' },
  { id: 'heart_rate', label: 'Resting pulse', hint: 'Resting heart rate (bpm)' },
  { id: 'body_temp', label: 'Body temperature', hint: 'Core body temperature (°C)' },
  { id: 'blood_glucose', label: 'Blood glucose', hint: 'Fasting blood glucose (mg/dL)' },
  { id: 'sleep_duration', label: 'Sleep duration log', hint: 'Hours recorded from sleep cycle' },
  { id: 'behavioral', label: 'Mood self-report', hint: '1–5 operational mood scale' },
  { id: 'symptoms', label: 'Symptom review', hint: 'Physical symptom checklist' },
] as const;

function formatSimulatedUtc(utcString: string): string {
  return `${utcString.slice(0, 16).replace('T', ' ')} UTC`;
}

export function RoutineChecklist({
  scenario,
  latest,
}: {
  scenario: DemoScenario;
  latest: DailyCheckin | null;
}) {
  const { missionContext, startSol } = scenario;
  const isLogged = latest?.sol === startSol;
  const mission = useMissionStore((state) => state.mission);
  const toggleChecklistItem = useMissionStore((state) => state.toggleChecklistItem);

  const scenarioId = mission.scenarioId;
  const solKey = String(startSol);
  const savedChecks = mission.checklist?.[scenarioId]?.[solKey] ?? [];

  // Simulated mission times for morning routine (08:00 local)
  const todayMorningUtc = formatSimulatedUtc(utcAtSol(missionContext, startSol, 8 * 3600));
  const tomorrowMorningUtc = formatSimulatedUtc(utcAtSol(missionContext, startSol + 1, 8 * 3600));

  // Determine checked state for each item (auto-completed if checkin has it, or manual toggle)
  const isItemComplete = (id: string) => {
    if (savedChecks.includes(id)) return true;
    if (!isLogged || !latest) return false;
    switch (id) {
      case 'bp':
        return latest.measurements.some(m => m.metric === 'bp_systolic') && latest.measurements.some(m => m.metric === 'bp_diastolic');
      case 'heart_rate':
        return latest.measurements.some(m => m.metric === 'heart_rate');
      case 'body_temp':
        return latest.measurements.some(m => m.metric === 'body_temp');
      case 'blood_glucose':
        return latest.measurements.some(m => m.metric === 'blood_glucose');
      case 'sleep_duration':
        return latest.measurements.some(m => m.metric === 'sleep_duration');
      case 'behavioral':
        return latest.measurements.some(m => m.metric === 'mood');
      case 'symptoms':
        return latest.symptoms.length > 0;
      default:
        return false;
    }
  };

  const completedCount = ROUTINE_CHECKLIST_ITEMS.filter((item) => isItemComplete(item.id)).length;
  const totalCount = ROUTINE_CHECKLIST_ITEMS.length;

  return (
    <section className="panel routine-reminder-panel" aria-labelledby="reminder-heading">
      <div className="routine-reminder-header">
        <div className="routine-reminder-title">
          <span className="routine-reminder-icon" aria-hidden="true">
            <Bell size={18} strokeWidth={1.8} />
          </span>
          <div>
            <h2 id="reminder-heading">
              {isLogged ? `Sol ${startSol} check-in recorded` : `Sol ${startSol} check-in due`}
            </h2>
            <p className="routine-reminder-timing">
              <Clock size={13} aria-hidden="true" />
              {isLogged
                ? `Submitted at ${formatSimulatedUtc(latest.submittedAtUtc)} · Next due Sol ${startSol + 1} at ${tomorrowMorningUtc}`
                : `Morning measurement window opened at ${todayMorningUtc}`}
            </p>
          </div>
        </div>
        <span className={`badge ${isLogged ? 'badge-steady' : 'badge-watch'}`}>
          {isLogged ? <CheckCircle2 size={13} aria-hidden="true" /> : <CircleAlert size={13} aria-hidden="true" />}
          <span>{isLogged ? 'Completed' : 'Action required'}</span>
        </span>
      </div>

      <p className="routine-reminder-desc">
        {isLogged
          ? `Your daily health self-assessment for Sol ${startSol} is complete and logged in local storage. Next routine check-in opens Sol ${startSol + 1} at 08:00 Gale Crater time.`
          : `Simulated mission time is morning on Sol ${startSol}. Perform your routine measurements seated in habitat before commencing duty schedule.`}
      </p>

      <div className="routine-checklist-wrap">
        <div className="routine-checklist-header">
          <div className="routine-checklist-lead">
            <ClipboardCheck size={16} aria-hidden="true" />
            <h3>Daily measurement checklist</h3>
          </div>
          <span className="routine-checklist-count">
            {completedCount} of {totalCount} items complete
          </span>
        </div>

        <ul className="routine-checklist-items" role="list">
          {ROUTINE_CHECKLIST_ITEMS.map((item) => {
            const checked = isItemComplete(item.id);
            const inputId = `checklist-${scenarioId}-${startSol}-${item.id}`;
            return (
              <li key={item.id} className={`routine-checklist-item ${checked ? 'is-checked' : ''}`}>
                <label htmlFor={inputId} className="routine-checklist-label">
                  <input
                    type="checkbox"
                    id={inputId}
                    checked={checked}
                    onChange={() => { toggleChecklistItem(item.id, startSol); void confirmTap(); }}
                    className="routine-checklist-checkbox"
                  />
                  <div>
                    <strong>{item.label}</strong>
                    <span className="routine-checklist-hint">{item.hint}</span>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="routine-reminder-footer">
        <Link to={isLogged ? '/assessment' : '/check-in'} className="button button-secondary">
          {isLogged ? 'Inspect assessment' : `Complete Sol ${startSol} check-in`}
        </Link>
      </div>
    </section>
  );
}
