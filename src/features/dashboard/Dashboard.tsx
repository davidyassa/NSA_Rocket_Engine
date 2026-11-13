import {
  ArrowRight, ArrowUpRight, Brain, CalendarClock, CircleAlert, HeartPulse, Info, MapPin, Moon,
  Radiation, Radio, ShieldAlert, Smile, Stethoscope, Thermometer, Waves,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { HEALTH_DOMAINS, METRICS } from '../../contracts';
import type { DailyCheckin, DemoScenario, HealthDomain, MetricId, RiskAssessment } from '../../contracts';
import { ORIGIN_META, STATUS_META } from '../../ui/tokens';
import { RecentReadings } from './RecentReadings';
import { CrewBodyFigure, DOMAIN_TARGETS } from './CrewBodyFigure';
import { RoutineChecklist, useRoutineChecklist } from './RoutineChecklist';
import { MissedCheckin, missedPreviousSol } from './MissedCheckin';
import { HabitatAir } from './HabitatAir';
import { tasksForScenario, useFollowUpStore } from '../followups/useFollowUpStore';
import { PLAIN_DOMAIN, PLAIN_STATUS, plainFinding } from '../../content/plainLanguage';
import './dashboard.css';

const domainInfo = {
  cardiovascular: { label: PLAIN_DOMAIN.cardiovascular, Icon: HeartPulse },
  metabolic: { label: PLAIN_DOMAIN.metabolic, Icon: Waves },
  temperature: { label: PLAIN_DOMAIN.temperature, Icon: Thermometer },
  sleep: { label: PLAIN_DOMAIN.sleep, Icon: Moon },
  behavioral: { label: PLAIN_DOMAIN.behavioral, Icon: Smile },
  symptoms: { label: PLAIN_DOMAIN.symptoms, Icon: Stethoscope },
} satisfies Record<HealthDomain, { label: string; Icon: typeof HeartPulse }>;


const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

export function domainReading(domain: HealthDomain, latest: DailyCheckin | null) {
  const readings = new Map(latest?.measurements.map((measurement) => [measurement.metric, measurement]));
  const value = (metric: MetricId) => {
    const reading = readings.get(metric);
    return reading ? numberFormat.format(reading.value) : null;
  };
  const withUnit = (metric: MetricId, unit: string) => {
    const reading = value(metric);
    return reading === null ? '—' : `${reading} ${unit}`;
  };

  switch (domain) {
    case 'cardiovascular': {
      const systolic = value('bp_systolic');
      const diastolic = value('bp_diastolic');
      const heartRate = value('heart_rate');
      const pressure = systolic && diastolic ? `${systolic}/${diastolic} mmHg` : null;
      return [heartRate && `${heartRate} bpm`, pressure].filter(Boolean).join(' · ') || '—';
    }
    case 'metabolic': return withUnit('blood_glucose', 'mg/dL');
    case 'temperature': return withUnit('body_temp', '°C');
    case 'sleep': return withUnit('sleep_duration', 'h');
    case 'behavioral': return withUnit('mood', '/ 5');
    case 'symptoms': {
      if (!latest || latest.symptoms.length === 0) return '—';
      const count = latest.symptoms.filter(({ present }) => present).length;
      return count > 0 ? `${count} reported` : 'None reported';
    }
  }
}

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
  const readings = latest?.measurements ?? [];
  const hasSynthetic = readings.some((reading) => reading.provenance === 'synthetic_demo');
  const hasEntered = readings.some((reading) => reading.provenance === 'user_entered');

  const activeRecords = records ?? (latest ? [...scenario.history, latest] : scenario.history);
  const missedSol = missedPreviousSol(startSol, activeRecords);
  const { tasks } = useFollowUpStore();
  const pendingTasks = tasksForScenario(tasks, scenario.id).filter(t => t.status !== 'resolved');

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

      {/* Deep-Space Transit Space Radiation Health Status Banner */}
      <aside className="panel" style={{ padding: '12px 18px', background: 'var(--bg-surface)', border: '1px solid color-mix(in srgb, var(--status-steady) 35%, var(--border-subtle))', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }} aria-label="Space Radiation Health Telemetry">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="hazard-icon" style={{ width: '38px', height: '38px', background: 'var(--tint-steady)', color: 'var(--status-steady)', borderRadius: '10px', display: 'grid', placeItems: 'center' }}>
            <Radiation size={20} aria-hidden="true" />
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge" style={{ background: 'var(--tint-steady)', color: 'var(--status-steady)', fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px' }}>
                VEHICLE: GREEN · SAFE BASELINE
              </span>
              <strong style={{ fontSize: '0.98rem' }}>Space Radiation Health Monitoring</strong>
            </div>
            <p className="muted" style={{ margin: '3px 0 0', fontSize: '0.84rem' }}>
              NASA-STD-3001 Universal 600 mSv Career Ceiling · CARN Compartment Sensors · Dynamic Lockdown Active
            </p>
          </div>
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

      <CrewBodyFigure latest={latest} assessment={assessment} domainReading={domainReading} />

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

      <section aria-labelledby="health-domains-heading" className="dashboard-health">
        <div className="section-title">
          <div>
            <h2 id="health-domains-heading">Health metrics</h2>
            {latest && <p>From the Sol {latest.sol} check-in</p>}
          </div>
          <div className="status-provenance">
            {hasSynthetic && <span className={ORIGIN_META.synthetic_demo.className}>{ORIGIN_META.synthetic_demo.label}</span>}
            {hasEntered && <span className={ORIGIN_META.user_entered.className}>{ORIGIN_META.user_entered.label}</span>}
          </div>
        </div>

        <div className="domain-grid">
          {HEALTH_DOMAINS.map((domain) => {
            const { label, Icon } = domainInfo[domain];
            const status = STATUS_META[assessment?.domainStatuses[domain] ?? 'not_measured'];
            const domainReadings = readings.filter((reading) => METRICS[reading.metric].domain === domain);
            const origins = new Set(domainReadings.map((reading) => reading.provenance));
            const target = DOMAIN_TARGETS[domain];
            return (
              <article className="panel domain-card" key={domain} data-tone={status.tone}>
                <div className="domain-title">
                  <span className="domain-icon"><Icon size={18} strokeWidth={1.75} aria-hidden="true" /></span>
                  <h3>{label}</h3>
                </div>
                <p className="domain-value">{domainReading(domain, latest)}</p>
                <span className={`domain-status status-${status.tone}`}><status.Icon size={14} aria-hidden="true" />{status.label}</span>
                <p className="domain-plain">{PLAIN_STATUS[assessment?.domainStatuses[domain] ?? 'not_measured']}</p>
                {origins.size === 1 && (
                  <span className={`${ORIGIN_META[[...origins][0]].className} domain-origin-badge`}>{ORIGIN_META[[...origins][0]].label}</span>
                )}
                {origins.size > 1 && (
                  <ul className="domain-origin">
                    {domainReadings.map((reading) => (
                      <li key={reading.id}>{METRICS[reading.metric].label} · <span className={ORIGIN_META[reading.provenance].className}>{ORIGIN_META[reading.provenance].label}</span></li>
                    ))}
                  </ul>
                )}
                <Link to={domain === 'symptoms' ? '/trends?metric=symptoms' : target.path} className="domain-info-link" aria-label={`View ${label} trends`}>
                  <Info size={19} aria-hidden="true" />
                </Link>
              </article>
            );
          })}
        </div>

      </section>

      <div className="dashboard-recent"><RecentReadings records={activeRecords} /></div>

      <div className="mission-stats panel">
        <div><CalendarClock size={19} aria-hidden="true" /><span>Last check-in</span><strong>{latest ? `Sol ${latest.sol}` : 'None recorded'}</strong></div>
        <div><Radio size={19} aria-hidden="true" /><span>Simulated one-way delay</span><strong>{missionContext.oneWayDelayMinutes} min</strong></div>
      </div>

      <section className="dashboard-quick-intel-grid" aria-label="Operational Health Intelligence">
        <HabitatAir environment={scenario.environment} sol={startSol} />
        <article className="panel dashboard-intel-card dashboard-intel-image radiation-feature">
          <div className="flags-title">
            <span className="domain-icon"><Radiation size={18} aria-hidden="true" /></span>
            <h2>Radiation health</h2>
          </div>
          <p>CARN compartment sensors, 600 mSv career limit, and dynamic room lockdown.</p>
          <Link to="/hazards/radiation" className="button button-secondary">Open monitor <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </article>
        <article className="panel dashboard-intel-card dashboard-intel-image cognitive-feature">
          <div className="flags-title">
            <span className="domain-icon"><Brain size={18} aria-hidden="true" /></span>
            <h2>Cognitive lab</h2>
          </div>
          <p>Check reaction time and lapses with the brief vigilance test.</p>
          <Link to="/cognitive" className="button button-secondary">Open lab <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </article>

        <article className="panel dashboard-intel-card dashboard-intel-image hazards-feature">
          <div className="flags-title">
            <span className="domain-icon"><ShieldAlert size={18} aria-hidden="true" /></span>
            <h2>Hazards</h2>
          </div>
          <p>See how radiation, isolation, distance, gravity and habitat conditions connect to crew readings.</p>
          <Link to="/hazards" className="button button-secondary">Explore the hazards <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </article>
      </section>

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
