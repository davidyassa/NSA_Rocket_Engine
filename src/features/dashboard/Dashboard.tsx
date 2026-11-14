import {
  ArrowRight, ArrowUpRight, CalendarClock, CircleAlert, MapPin, Radiation, Radio,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DailyCheckin, DemoScenario, RiskAssessment } from '../../contracts';
import { RecentReadings } from './RecentReadings';
import { CrewBodyFigure } from './CrewBodyFigure';
import { RoutineChecklist, useRoutineChecklist } from './RoutineChecklist';
import { MissedCheckin, missedPreviousSol } from './MissedCheckin';
import { tasksForScenario, useFollowUpStore } from '../followups/useFollowUpStore';
import { radiationSimCondition, useRadiationSimStore } from '../radiation/radiationSimStore';
import type { VehicleRadiationStatus } from '../radiation/radiationEngine';
import { plainFinding } from '../../content/plainLanguage';
import './dashboard.css';

export { domainReading } from './HealthMetricCards';

const RADIATION_TONE: Record<VehicleRadiationStatus, { color: string; tint: string }> = {
  GREEN: { color: 'var(--status-steady)', tint: 'var(--tint-steady)' },
  YELLOW: { color: 'var(--status-change)', tint: 'color-mix(in srgb, var(--status-change) 16%, transparent)' },
  ORANGE: { color: 'var(--status-trend)', tint: 'color-mix(in srgb, var(--status-trend) 18%, transparent)' },
  RED: { color: 'var(--nasa-red)', tint: 'color-mix(in srgb, var(--nasa-red) 18%, transparent)' },
};

export function Dashboard({ scenario, records, latest, assessment }: {
  scenario: DemoScenario;
  records?: readonly DailyCheckin[];
  latest: DailyCheckin | null;
  assessment: RiskAssessment | null;
}) {
  const { missionContext, startSol } = scenario;
  const logged = latest?.sol === startSol;
  const findings = assessment?.findings ?? [];
  const overviewFindings = [
    ...findings.filter(({ kind }) => kind !== 'data_unavailable'),
    ...findings.filter(({ kind }) => kind === 'data_unavailable'),
  ].slice(0, 2);
  const checklist = useRoutineChecklist(startSol, latest);
  const showHealthSummary = checklist.completeCount === checklist.items.length && assessment;

  const activeRecords = records ?? (latest ? [...scenario.history, latest] : scenario.history);
  const missedSol = missedPreviousSol(startSol, activeRecords);
  const { tasks } = useFollowUpStore();
  const pendingTasks = tasksForScenario(tasks, scenario.id).filter(t => t.status !== 'resolved');

  // Same simulated transit condition the Radiation Monitor is showing.
  const simKey = useRadiationSimStore((state) => state.scenarioKey);
  const simFrame = useRadiationSimStore((state) => state.frameIndex);
  const radiation = radiationSimCondition(simKey, simFrame);
  const { status, statusLabel } = radiation.assessment;
  const tone = RADIATION_TONE[status];

  return (
    <div className="dashboard">
      {missedSol !== null && <MissedCheckin key={missedSol} scenarioId={scenario.id} missedSol={missedSol} />}
      <div className="dashboard-start">
        <section className="mission-hero" aria-labelledby="mission-heading">
          <div className="mission-hero-content">
            <p className="mission-habitat"><MapPin size={15} aria-hidden="true" /> {missionContext.habitat}</p>
            <h1 id="mission-heading">Mission dashboard<span aria-hidden="true">.</span></h1>
            <p className="mission-scenario">Sol {startSol} · {scenario.profile.isSynthetic ? 'Synthetic demo' : scenario.profile.displayName}</p>
            <Link to={logged ? '/assessment' : '/check-in'} className="button button-primary">
              {logged ? 'View today’s assessment' : 'Start check-in'} <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <p className="mission-photo-credit">Lunar habitat concept</p>
        </section>

        <RoutineChecklist {...checklist} />
      </div>

      {/* Deep-Space Transit Space Radiation Health Status Banner (mirrors the Radiation Monitor simulation) */}
      <aside
        className="panel dashboard-radiation-status"
        data-status={status}
        style={{ borderColor: `color-mix(in srgb, ${tone.color} 35%, var(--border-subtle))` }}
        aria-label="Space Radiation Health Telemetry"
      >
        <div className="dashboard-radiation-main">
          <span className="dashboard-radiation-icon" style={{ background: tone.tint, color: tone.color }}>
            <Radiation size={20} aria-hidden="true" />
          </span>
          <div>
            <div className="dashboard-radiation-title">
              <span className="badge" style={{ background: tone.tint, color: tone.color }}>
                VEHICLE: {status} · {statusLabel.toUpperCase()}
              </span>
              <strong>Space Radiation Health Monitoring</strong>
            </div>
            <p className="muted" role="status">
              {radiation.isDefault
                ? 'NASA-STD-3001 Universal 600 mSv Career Ceiling · CARN Compartment Sensors · Dynamic Lockdown Active'
                : <>Simulated transit condition: <strong>{radiation.scenario.name}</strong>
                  {radiation.frameCount > 1 && ` · sample ${radiation.frameIndex + 1} of ${radiation.frameCount}`}</>}
            </p>
          </div>
          <span className="badge badge-synthetic">Simulated</span>
        </div>
        <Link to="/hazards/radiation" className="button button-secondary" style={{ whiteSpace: 'nowrap' }}>
          Open Radiation Monitor <ArrowRight size={15} aria-hidden="true" style={{ marginLeft: '4px' }} />
        </Link>
      </aside>

      {showHealthSummary && (
        <section className="panel dashboard-health-summary" aria-labelledby="health-summary-heading">
          <div className="section-title">
            <h2 id="health-summary-heading">General health status</h2>
            <Link to="/assessment" className="text-link">View assessment <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          {overviewFindings.length > 0 ? (
            <ul>{overviewFindings.map((finding, index) => <li key={`${finding.ruleId}-${index}`}>{plainFinding(finding)}</li>)}</ul>
          ) : <p>No change detected in the readings that could be compared.</p>}
          {latest && <p className="muted">Sol {latest.sol} check-in{findings.length > overviewFindings.length ? ` · ${findings.length} findings` : ''}</p>}
        </section>
      )}

      <CrewBodyFigure latest={latest} assessment={assessment} />

      {pendingTasks.length > 0 && (
        <aside className="panel action-center-banner" aria-label="Pending clinical follow-up tasks">
          <div>
            <p className="action-center-title">
              <CircleAlert size={16} aria-hidden="true" /> Action required:{' '}
              {pendingTasks[0].title}
              {pendingTasks.length > 1 && ` (plus ${pendingTasks.length - 1} more pending)`}
            </p>
          </div>
          <Link to="/assessment?view=follow-up" className="button button-warning">
            View follow-up <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </aside>
      )}

      <div className="dashboard-recent"><RecentReadings records={activeRecords} /></div>

      <div className="mission-stats panel">
        <div><CalendarClock size={19} aria-hidden="true" /><span>Last check-in</span><strong>{latest ? `Sol ${latest.sol}` : 'None recorded'}</strong></div>
        <div><Radio size={19} aria-hidden="true" /><span>Simulated one-way delay</span><strong>{missionContext.oneWayDelayMinutes} min</strong></div>
      </div>

      <section className="mission-explore" aria-labelledby="mission-explore-title">
        <div className="mission-explore-content">
          <h2 id="mission-explore-title">Explore human<br />spaceflight.</h2>
          <p>See what shapes crew health beyond Earth, from cabin conditions to deep-space radiation.</p>
          <div className="mission-explore-actions">
            <Link className="button button-primary" to="/hazards">Explore NASA’s five hazards <ArrowUpRight size={16} aria-hidden="true" /></Link>
            <Link className="button button-secondary" to="/demo?view=media">Browse mission imagery <ArrowUpRight size={16} aria-hidden="true" /></Link>
            <Link className="button button-secondary" to="/demo?view=iss">Explore the ISS in 3D <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
        <p className="mission-photo-credit">Lunar outpost concept</p>
      </section>
    </div>
  );
}
