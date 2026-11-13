import {
  Activity, ArrowRight, Brain, CalendarClock, CircleAlert, CircleCheck, Flame, HeartPulse, Moon,
  Radio, ShieldAlert, Smile, Stethoscope, Thermometer, TrendingDown, Waves,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { HEALTH_DOMAINS, METRICS } from '../../contracts';
import type { DailyCheckin, DemoScenario, DomainStatus, HealthDomain, MetricId, RiskAssessment } from '../../contracts';
import craterPhoto from '../../ui/assets/gale-crater.webp';
import { CrewBodyFigure, DOMAIN_TARGETS } from './CrewBodyFigure';
import { RoutineChecklist } from './RoutineChecklist';
import { calculateCheckinStreak } from './streak';
import './dashboard.css';

const domainInfo = {
  cardiovascular: { label: 'Cardiovascular', Icon: HeartPulse },
  metabolic: { label: 'Metabolic', Icon: Waves },
  temperature: { label: 'Temperature', Icon: Thermometer },
  sleep: { label: 'Sleep', Icon: Moon },
  behavioral: { label: 'Behavioral health', Icon: Smile },
  symptoms: { label: 'Symptoms', Icon: Stethoscope },
} satisfies Record<HealthDomain, { label: string; Icon: typeof HeartPulse }>;

const statusInfo = {
  no_change_detected: { label: 'No change detected', Icon: CircleCheck, tone: 'steady' },
  change_from_baseline: { label: 'Change from baseline', Icon: CircleAlert, tone: 'watch' },
  sustained_trend: { label: 'Sustained trend', Icon: Activity, tone: 'watch' },
  baseline_not_established: { label: 'Baseline not established', Icon: CircleAlert, tone: 'muted' },
  check_entry: { label: 'Check entry', Icon: CircleAlert, tone: 'watch' },
  not_measured: { label: 'Not measured', Icon: CircleAlert, tone: 'muted' },
} satisfies Record<DomainStatus, { label: string; Icon: typeof CircleCheck; tone: string }>;

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

function domainReading(domain: HealthDomain, latest: DailyCheckin | null) {
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
  const streak = useMemo(() => calculateCheckinStreak(activeRecords), [activeRecords]);

  return (
    <div className="dashboard">
      <div className="page-intro dashboard-intro">
        <h1>Mission dashboard</h1>
        <p>{scenario.title} · Daily crew health check-in</p>
      </div>

      <section className="mission-hero" aria-labelledby="mission-sol">
        <div className="mission-photo" style={{ backgroundImage: `url(${craterPhoto})` }} aria-hidden="true" />
        <div className="mission-hero-content">
          <p className="eyebrow"><span className="mission-beacon" /> {missionContext.habitat}</p>
          <h2 id="mission-sol">Sol {startSol}</h2>
          <p>{logged ? 'Today’s check-in is recorded.' : 'Your daily check-in is ready.'}</p>
          <Link to={logged ? '/assessment' : '/check-in'} className="button button-primary">
            {logged ? 'View today’s assessment' : 'Start check-in'} <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <a className="mission-photo-credit" href="https://science.nasa.gov/photojournal/curiosity-looks-downslope-from-the-sulfate-unit/" target="_blank" rel="noreferrer">
          NASA/JPL-Caltech/MSSS
        </a>
      </section>

      <div className="mission-stats panel">
        <div><CalendarClock size={19} aria-hidden="true" /><span>Last check-in</span><strong>{latest ? `Sol ${latest.sol}` : 'None recorded'}</strong></div>
        <div><CalendarClock size={19} aria-hidden="true" /><span>Next check-in due</span><strong>Sol {logged ? startSol + 1 : startSol}</strong></div>
        <div className="mission-stat-streak">
          <Flame size={19} aria-hidden="true" />
          <div className="mission-stat-label-wrap">
            <span>Check-in streak</span>
            <span className="streak-origin">
              {streak.syntheticCount > 0 && streak.userEnteredCount > 0
                ? `${streak.syntheticCount} syn · ${streak.userEnteredCount} entered`
                : streak.syntheticCount > 0
                  ? 'Seeded synthetic'
                  : streak.userEnteredCount > 0
                    ? 'User entered'
                    : 'No streak'}
            </span>
          </div>
          <strong>{streak.count} {streak.count === 1 ? 'sol' : 'sols'}</strong>
        </div>
        <div><Radio size={19} aria-hidden="true" /><span>Simulated one-way delay</span><strong>{missionContext.oneWayDelayMinutes} min</strong></div>
      </div>

      <RoutineChecklist scenario={scenario} latest={latest} />

      <section aria-labelledby="health-domains-heading" className="dashboard-health">
        <div className="section-title">
          <div>
            <h2 id="health-domains-heading">Health status</h2>
            {latest && <p>From the Sol {latest.sol} check-in</p>}
          </div>
          <div className="status-provenance">
            {hasSynthetic && <span className="badge badge-synthetic">Synthetic readings</span>}
            {hasEntered && <span className="badge">User entered readings</span>}
          </div>
        </div>

        <CrewBodyFigure
          latest={latest}
          assessment={assessment}
          domainReading={domainReading}
        />

        <div className="domain-grid">
          {HEALTH_DOMAINS.map((domain) => {
            const { label, Icon } = domainInfo[domain];
            const status = statusInfo[assessment?.domainStatuses[domain] ?? 'not_measured'];
            const domainReadings = readings.filter((reading) => METRICS[reading.metric].domain === domain);
            const origins = new Set(domainReadings.map((reading) => reading.provenance));
            const target = DOMAIN_TARGETS[domain];
            return (
              <Link
                to={target.path}
                className="panel domain-card domain-card-interactive"
                key={domain}
                aria-label={`View ${label} details: ${domainReading(domain, latest)}. Status: ${status.label}`}
              >
                <div className="domain-title">
                  <span className="domain-icon"><Icon size={18} strokeWidth={1.75} aria-hidden="true" /></span>
                  <h3>{label}</h3>
                  <ArrowRight size={14} className="domain-card-arrow" aria-hidden="true" />
                </div>
                <p className="domain-value">{domainReading(domain, latest)}</p>
                <span className={`domain-status status-${status.tone}`}><status.Icon size={14} aria-hidden="true" />{status.label}</span>
                {hasSynthetic && hasEntered && origins.size === 1 && (
                  <p className="domain-origin">{origins.has('synthetic_demo') ? 'Synthetic' : 'User-entered'}</p>
                )}
                {origins.size > 1 && (
                  <ul className="domain-origin">
                    {domainReadings.map((reading) => (
                      <li key={reading.id}>{METRICS[reading.metric].label} · {reading.provenance === 'synthetic_demo' ? 'Synthetic' : 'User-entered'}</li>
                    ))}
                  </ul>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="dashboard-quick-intel-grid" aria-label="Operational Health Intelligence">
        <article className="panel dashboard-intel-card">
          <div className="section-title">
            <div className="flags-title">
              <span className="domain-icon"><Brain size={18} aria-hidden="true" /></span>
              <h2>Cognitive lab (PVT-B)</h2>
            </div>
            <Link to="/cognitive" className="text-link">Open lab <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <p className="muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0.8rem', lineHeight: 1.4 }}>
            NASA Brief Psychomotor Vigilance Task tracks astronaut readiness, reaction times, and lapses (&gt;500ms).
          </p>
          <Link to="/cognitive" className="button button-secondary" style={{ width: 'fit-content', fontSize: '0.82rem' }}>
            Run vigilance test →
          </Link>
        </article>

        <article className="panel dashboard-intel-card">
          <div className="section-title">
            <div className="flags-title">
              <span className="domain-icon"><ShieldAlert size={18} aria-hidden="true" /></span>
              <h2>NASA 5 hazards context</h2>
            </div>
            <Link to="/hazards" className="text-link">View matrix <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <p className="muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0.8rem', lineHeight: 1.4 }}>
            Grounded in NASA HRP risk books: Radiation (Curiosity MSL-RAD), Behavioral Isolation, and Distance latency.
          </p>
          <Link to="/hazards" className="button button-secondary" style={{ width: 'fit-content', fontSize: '0.82rem' }}>
            Explore NASA HRP evidence →
          </Link>
        </article>
      </section>

      <section className="panel dashboard-flags" aria-labelledby="open-flags-heading">
        <div className="section-title">
          <div className="flags-title">
            <span className="domain-icon"><TrendingDown size={18} aria-hidden="true" /></span>
            <h2 id="open-flags-heading">Open flags</h2>
            <span className="badge">{flags.length}</span>
          </div>
          <Link to="/assessment" className="text-link">View assessment <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        {flags.length === 0 ? <p className="muted">No open flags for the latest check-in.</p> :
          <ul>{flags.slice(0, 3).map((flag, index) => <li key={`${flag.ruleId}-${index}`}>{flag.summary}</li>)}</ul>}
      </section>
    </div>
  );
}
