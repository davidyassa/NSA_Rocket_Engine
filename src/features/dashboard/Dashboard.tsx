import {
  ArrowRight, ArrowUpRight, Brain, CalendarClock, CircleAlert, HeartPulse, Moon,
  Radio, ShieldAlert, Smile, Stethoscope, Thermometer, TrendingDown, Waves,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { HEALTH_DOMAINS, METRICS } from '../../contracts';
import type { DailyCheckin, DemoScenario, HealthDomain, MetricId, RiskAssessment } from '../../contracts';
import { ORIGIN_META, STATUS_META } from '../../ui/tokens';
import { RecentReadings } from './RecentReadings';
import { CrewBodyFigure, DOMAIN_TARGETS } from './CrewBodyFigure';
import { RoutineChecklist } from './RoutineChecklist';
import { HabitatAir } from './HabitatAir';
import { useFollowUpStore } from '../followups/useFollowUpStore';
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
  const flags = assessment?.findings.filter((finding) => finding.kind !== 'data_unavailable') ?? [];
  const readings = latest?.measurements ?? [];
  const hasSynthetic = readings.some((reading) => reading.provenance === 'synthetic_demo');
  const hasEntered = readings.some((reading) => reading.provenance === 'user_entered');

  const activeRecords = records ?? (latest ? [latest] : scenario.history);
  const { tasks } = useFollowUpStore();
  const pendingTasks = tasks.filter(t => t.status !== 'resolved');

  return (
    <div className="dashboard">
      <section className="mission-hero" aria-labelledby="mission-heading">
        <div className="mission-hero-content">
          <h1 id="mission-heading">Dashboard<span aria-hidden="true">.</span></h1>
          <p className="mission-scenario">{scenario.title}</p>
          <Link to={logged ? '/assessment' : '/check-in'} className="button button-primary">
            {logged ? 'View today’s assessment' : 'Start check-in'} <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <div className="mission-stats panel">
        <div><CalendarClock size={19} aria-hidden="true" /><span>Last check-in</span><strong>{latest ? `Sol ${latest.sol}` : 'None recorded'}</strong></div>
        <div><Radio size={19} aria-hidden="true" /><span>Simulated one-way delay</span><strong>{missionContext.oneWayDelayMinutes} min</strong></div>
      </div>

      {pendingTasks.length > 0 && (
        <aside className="panel action-center-banner" aria-label="Pending clinical follow-up tasks">
          <div>
            <p className="action-center-title">
              <CircleAlert size={16} aria-hidden="true" /> Action required:{' '}
              {pendingTasks[0].title}
              {pendingTasks.length > 1 && ` (plus ${pendingTasks.length - 1} more pending)`}
            </p>
          </div>
          <Link to="/assessment" className="button button-warning">
            Review &amp; sign off <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </aside>
      )}

      <div className="dashboard-overview">
        <RecentReadings records={activeRecords} />
        <section className="panel dashboard-flags" aria-labelledby="open-flags-heading">
          <div className="flags-title">
            <span className="domain-icon"><TrendingDown size={18} aria-hidden="true" /></span>
            <h2 id="open-flags-heading">Open flags</h2>
            <Link to="/assessment" className="round-link" aria-label="Review open flags"><ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>
          <p className="flag-total"><strong>{flags.length}</strong><span>{latest ? `From Sol ${latest.sol}` : 'No check-in yet'}</span></p>
          {flags.length === 0
            ? <p className="flag-summary muted">No open flags for the latest check-in.</p>
            : <p className="flag-summary">{plainFinding(flags[0])}</p>}
          <Link to="/assessment" className="text-link">View assessment <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
      </div>

      <RoutineChecklist scenario={scenario} latest={latest} />

      <section aria-labelledby="health-domains-heading" className="dashboard-health">
        <div className="section-title">
          <div>
            <h2 id="health-domains-heading">Health status</h2>
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
              <Link
                to={target.path}
                className="panel domain-card domain-card-interactive"
                key={domain}
                data-tone={status.tone}
                aria-label={`View ${label} details: ${domainReading(domain, latest)}. Status: ${status.label}`}
              >
                <div className="domain-title">
                  <span className="domain-icon"><Icon size={18} strokeWidth={1.75} aria-hidden="true" /></span>
                  <h3>{label}</h3>
                  <ArrowRight size={14} className="domain-card-arrow" aria-hidden="true" />
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
              </Link>
            );
          })}
        </div>

        <CrewBodyFigure
          latest={latest}
          assessment={assessment}
          domainReading={domainReading}
        />
      </section>

      <section className="dashboard-quick-intel-grid" aria-label="Operational Health Intelligence">
        <HabitatAir environment={scenario.environment} sol={startSol} />
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
            <h2>NASA’s five hazards</h2>
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
          </div>
        </div>
      </section>
    </div>
  );
}
