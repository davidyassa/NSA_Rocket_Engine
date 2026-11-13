import { useState } from 'react';
import {
  Activity, ArrowRight, Brain, Equal, ExternalLink, Globe, Radiation, SatelliteDish, Triangle, Weight, X,
  type LucideIcon,
} from 'lucide-react';
import { NASA_FIVE_HAZARDS, type NasaHazard } from './hazardsData';
import './hazards.css';

const HAZARD_ICONS: Record<string, LucideIcon> = {
  radiation: Radiation,
  isolation: Brain,
  distance: SatelliteDish,
  gravity: Weight,
  environment: Globe,
};

/** Status in three channels: icon + label + colour tone. */
const STATE_META: Record<NasaHazard['sol43Status']['state'], { label: string; Icon: LucideIcon; tone: string }> = {
  nominal: { label: 'Nominal', Icon: Equal, tone: 'steady' },
  elevated: { label: 'Elevated', Icon: Triangle, tone: 'change' },
  active_monitoring: { label: 'Active monitoring', Icon: Activity, tone: 'monitor' },
};

const INDICATOR_LABELS: Record<string, string> = {
  msl_rad_curiosity: 'Curiosity RAD dose rate',
  hourly_median_radiation: 'Hourly median dose',
  peak_event_radiation: 'Peak event dose',
  sleep_duration: 'Sleep duration',
  mood: 'Mood',
  pvt_reaction_time: 'PVT reaction time',
  lapses_count: 'PVT lapses',
  simulated_delay_sec: 'One-way comms delay',
  autonomous_assessment_tier: 'Triage tier',
  handoff_package: 'Ground handoff package',
  bp_systolic: 'Systolic pressure',
  bp_diastolic: 'Diastolic pressure',
  muscle_symptoms: 'Muscle symptoms',
  body_temp: 'Body temperature',
  headache_symptom: 'Headache',
  nausea_symptom: 'Nausea',
  respiratory_symptoms: 'Breathing symptoms',
};

const PIPELINE = [
  'Observation',
  'Signal quality check',
  'Personal baseline',
  'Decision rule',
  'Clinical rationale',
  'Ground handoff',
];

function indicatorLabel(id: string) {
  return INDICATOR_LABELS[id] ?? id.replace(/_/g, ' ');
}

export function NasaHazards() {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focused = focusedId ? NASA_FIVE_HAZARDS.find((h) => h.id === focusedId) ?? null : null;

  return (
    <div className="hazards-container">
      <header className="page-intro">
        <p className="eyebrow">NASA Human Research Program (HRP)</p>
        <h1>The five hazards of human spaceflight</h1>
        <p>
          A Mars mission exposes crew to five connected hazards. Each card shows which Sol Check readings
          relate to it, its Sol 43 status, and the NASA evidence behind it.
        </p>
      </header>

      {focused && (
        <aside className="hazard-focus" aria-live="polite" aria-label={`Focused hazard: ${focused.name}`}>
          <div className="hazard-focus-head">
            <div>
              <p className="eyebrow">Focused hazard · {focused.hrpRiskId}</p>
              <h2>{focused.name.replace(/^\d+\.\s*/, '')}</h2>
              <p className="hazard-element">NASA HRP element: {focused.hrpElement}</p>
            </div>
            <button type="button" className="button button-sm button-ghost" onClick={() => setFocusedId(null)}>
              <X size={16} aria-hidden="true" /> Clear focus
            </button>
          </div>
          <p className="hazard-focus-action">
            <strong>First countermeasure:</strong> {focused.operationalCountermeasures[0]}
          </p>
        </aside>
      )}

      <div className="hazards-grid">
        {NASA_FIVE_HAZARDS.map((hazard) => {
          const Icon = HAZARD_ICONS[hazard.id] ?? Globe;
          const state = STATE_META[hazard.sol43Status.state];
          const isFocused = focusedId === hazard.id;
          const headingId = `hazard-${hazard.id}`;
          return (
            <article key={hazard.id} className={`hazard-card${isFocused ? ' is-focused' : ''}`} aria-labelledby={headingId}>
              <div className="hazard-card-header">
                <span className="hazard-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.8} /></span>
                <div className="hazard-title">
                  <h2 className="hazard-name" id={headingId}>{hazard.name}</h2>
                  <span className="hazard-id-badge" title="Sol Check internal reference, not an official NASA code">{hazard.hrpRiskId}</span>
                </div>
                <span className={`hazard-status-badge status-${state.tone}`}>
                  <state.Icon size={13} aria-hidden="true" /> {state.label}
                </span>
              </div>

              <p className="hazard-tagline">{hazard.tagline}</p>

              <div className="hazard-sol43-box">
                <strong>Sol 43 status</strong>
                <p>{hazard.sol43Status.summary}</p>
              </div>

              <section>
                <h3 className="hazard-section-title">Sol Check indicators</h3>
                <ul className="hazard-metrics-chips">
                  {hazard.solCheckMetrics.map((m) => <li key={m} className="hazard-metric-chip">{indicatorLabel(m)}</li>)}
                </ul>
              </section>

              <section>
                <h3 className="hazard-section-title">Spaceflight health impacts</h3>
                <ul className="hazard-list">
                  {hazard.clinicalImpacts.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>

              <section>
                <h3 className="hazard-section-title">Countermeasures</h3>
                <ul className="hazard-list">
                  {hazard.operationalCountermeasures.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>

              <section className="hazard-ref-list">
                <h3 className="hazard-section-title">Evidence sources</h3>
                <ul className="hazard-list">
                  {hazard.officialReferences.map((ref) => (
                    <li key={ref.title}>
                      {ref.link ? (
                        <a href={ref.link} target="_blank" rel="noreferrer">
                          {ref.title}<ExternalLink size={13} aria-hidden="true" className="external-icon" />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : <span>{ref.title}</span>}
                      <span className="hazard-ref-publisher"> · {ref.publisher}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <button
                type="button"
                className={`button button-sm button-secondary tab-toggle hazard-focus-toggle${isFocused ? ' is-selected' : ''}`}
                aria-pressed={isFocused}
                onClick={() => setFocusedId(isFocused ? null : hazard.id)}
              >
                {isFocused ? 'Focused' : 'Focus this hazard'}
              </button>
            </article>
          );
        })}
      </div>

      <section className="hazard-card hazard-pipeline" aria-labelledby="pipeline-heading">
        <h2 id="pipeline-heading" className="hazard-name">Evidence-to-action pipeline</h2>
        <p className="hazard-tagline">Every finding follows the same deterministic, inspectable steps. No opaque risk scores.</p>
        <ol className="hazard-pipeline-steps">
          {PIPELINE.map((step, index) => (
            <li key={step}>
              <span className="hazard-pipeline-num">{index + 1}</span>
              <span>{step}</span>
              {index < PIPELINE.length - 1 && <ArrowRight size={14} aria-hidden="true" className="hazard-pipeline-arrow" />}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
