import { ArrowRight, CheckCircle2, Clock, FileText, Radio, ShieldAlert, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CORE_METRIC_IDS, CORE_SYMPTOM_OPTIONS, METRICS, type DemoScenario } from '../../contracts';
import { BASELINE_LOOKBACK_SOLS, MIN_BASELINE_READINGS, MIN_TREND_READINGS, TREND_LOOKBACK_SOLS } from '../../engine/rules';
import { RADLAB_SOURCE, RADLAB_UNIT } from '../../data/nasa';
import { EvidenceSources } from '../assessment/EvidenceSources';
import './hazards.css';

const evidence = ['nasa-delay', 'nasa-monitoring', 'nasa-human-system-risks', 'nasa-eimo', RADLAB_SOURCE.id];

const CLAIM_VERSUS_EVIDENCE = [
  {
    source: 'NASA Hazard: Distance from Earth',
    sourceRef: 'nasa-delay',
    component: 'Delay Clock (P0-4), Hazard Risk Badges',
    supports: 'Mars communication latency reaches up to 20 min one-way (40 min round-trip); mandates autonomous crew self-reliance.',
    doesNotSupport: 'Does not define clinical diagnostic criteria, drug therapies, or treatment protocols.',
  },
  {
    source: 'NASA-STD-3001 Vol 1 Rev C',
    sourceRef: 'nasa-monitoring',
    component: 'Daily 60s Check-in (P0-1), 7 Frozen Metrics',
    supports: 'Mandatory in-mission monitoring of vital signs, sleep duration, and behavioral health (§3.1.4, §3.1.5); establishes Crew Medical Officer (CMO) role (§3.1).',
    doesNotSupport: 'Does not provide normative clinical cutoffs (HR, BP, temperature, glucose, mood thresholds) for astronauts in space.',
  },
  {
    source: 'NASA Human System Risks',
    sourceRef: 'nasa-human-system-risks',
    component: 'Domain Taxonomy (P0-6), Rule References',
    supports: 'NASA tracks sleep loss, behavioral decrements, cardiovascular deconditioning, and nutrition across 30 spaceflight risks.',
    doesNotSupport: 'Does not provide decisive clinical criteria to classify an individual astronaut’s state as "safe" or "pathological".',
  },
  {
    source: 'NASA EIMO ConOps (2024)',
    sourceRef: 'nasa-eimo',
    component: 'Product Concept, 3-Tier Escalation Ladder',
    supports: 'NASA strategic direction for onboard clinical decision-support and progressive crew autonomy during deep space missions.',
    doesNotSupport: 'Does not constitute an official NASA certification or clinical validation of the Sol Check software.',
  },
  {
    source: 'RadLab MSL-RAD-Surface',
    sourceRef: RADLAB_SOURCE.id,
    component: 'Radiation Stream (P0-5), Context Alert',
    supports: 'Actual archival Mars surface absorbed dose rate (µGy/h) recorded by Curiosity, capturing the September 11, 2017 Solar Particle Event.',
    doesNotSupport: 'Does not measure crew absorbed dose, habitat shielding, or biological effect; cannot be compared to the 600 mSv career limit.',
  },
];

const SOFTWARE_LOGIC_MATRIX = [
  {
    hazard: 'Communication Delay (20-min one-way / 40-min round-trip)',
    impact: 'Impossible to obtain real-time guidance from Ground Flight Surgeon during acute physiological shifts.',
    logic: 'Dynamically computes sol from missionStartUtc and solLengthSeconds (88,775 s); executes simulated delay clock in escalation screen (F12); routes outcomes through 3-tier escalation ladder; generates local telemetry summary with zero runtime network calls.',
  },
  {
    hazard: 'Non-Physician Crew Autonomy',
    impact: 'Difficulty in detecting subtle health shifts early without specialist presence or published spaceflight clinical cutoffs.',
    logic: 'Enforces input validation guards (F02 / data_quality) setting check_entry for impossible values; computes personal baseline (F04) as 14-sol median (min 5 readings, else baseline_not_established); executes deterministic pure TypeScript rules with explainable "Why?" drawer.',
  },
  {
    hazard: 'No Resupply & Resource Constraints',
    impact: 'Absence of logistical replenishment or emergency medical evacuation; requires strict guidance restraint.',
    logic: 'Pairs each Finding with pre-authored ActionCards in src/content tied to SourceRecords; strictly restricted to self-care steps, measurement guidance, and escalation; zero medication names, dosages, or therapeutic plans.',
  },
  {
    hazard: 'Isolation & Compound Environmental Stress',
    impact: 'Sleep loss and mood changes interact with mission events and radiation without establishing medical causality.',
    logic: 'Mission Timeline (F08) synchronizes 3 separate streams (crew readings, synthetic mission events like shelter_protocol, and real Curiosity MSL-RAD archive); displays distinct provenance badges (nasa_archive vs synthetic_demo); classifies correlation strictly as contextual_association (not a cause).',
  },
  {
    hazard: 'Offline-First & Auditability',
    impact: 'Monitoring and mission records must remain 100% operational during communications blackouts and habitat isolation.',
    logic: 'Executes as a 100% client-side Static SPA with zero server, zero cloud, and zero runtime LLM dependency; stores all state in localStorage behind StorageRepository; logs all actions in AuditEvent records (id, atUtc, type, refId).',
  },
];

export function DistanceHazard({ scenario }: { scenario: DemoScenario }) {
  const { oneWayDelayMinutes, solLengthSeconds } = scenario.missionContext;
  const roundTripMinutes = oneWayDelayMinutes * 2;

  return (
    <div className="hazards-container">
      <header className="page-intro">
        <Link to="/hazards" className="text-link">All five hazards</Link>
        <h1>Hazard 3: Distance from Earth</h1>
        <p>Sol {scenario.startSol} · Gale Crater Habitat · Delayed ground support makes autonomous onboard health monitoring essential.</p>
        <div className="distance-contract-banner">
          <span className="badge">Not a diagnosis</span>
          <span className="contract-badge"><ShieldAlert size={13} aria-hidden="true" /> Frozen Design Contract v1</span>
          <span className="contract-badge"><FileText size={13} aria-hidden="true" /> Lane F / Docs Compliant</span>
          <span className="contract-badge"><Clock size={13} aria-hidden="true" /> SC-EXMC-01</span>
        </div>
      </header>

      {/* 1. Simulated Earth Communication & Latency */}
      <section className="hazard-card" aria-labelledby="distance-delay">
        <h2 className="hazard-name" id="distance-delay">Simulated Earth Communication & Signal Delay (P0-4 / F12)</h2>
        <dl className="distance-timing">
          <div><dt>One-way delay</dt><dd>{oneWayDelayMinutes} min</dd></div>
          <div><dt>Earliest possible reply</dt><dd>{roundTripMinutes} min</dd></div>
          <div><dt>Martian sol length</dt><dd>{solLengthSeconds.toLocaleString()} s</dd></div>
        </dl>
        <p>
          At an average Martian orbital distance, electromagnetic signals require up to 20 minutes one-way.
          A two-way query and response takes at least 40 minutes before specialist review time.
          Sol Check models this physical constraint with an onboard countdown and an offline store-and-forward telemetry package.
        </p>
        <div className="hazard-actions">
          <Link className="button button-primary" to="/assessment#ground-summary">
            Rehearse Ground Handoff Draft <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <Link className="button button-secondary" to="/cmo">
            Open CMO Console <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* 2. Three-Tier Escalation Ladder */}
      <section className="hazard-card" aria-labelledby="distance-ladder">
        <h2 className="hazard-name" id="distance-ladder">Three-Tier Escalation Ladder (EscalationTier)</h2>
        <p className="muted">
          Under delayed ground communications, every evaluation routes strictly through a deterministic 3-tier escalation ladder:
        </p>
        <div className="distance-ladder-grid">
          <article className="distance-tier-card">
            <h3><span className="distance-tier-step">1</span> Self-Care (<code>self_care</code>)</h3>
            <p>For nominal readings, initial baseline changes, or input issues. The crew member reviews baseline comparisons, verifies entry problems, and applies general operational self-care (hydration, rest, sleep hygiene).</p>
            <span className="contract-badge"><UserCheck size={13} /> Onboard Crew Member</span>
          </article>
          <article className="distance-tier-card">
            <h3><span className="distance-tier-step">2</span> Crew Medical Officer (<code>crew_medical_officer</code>)</h3>
            <p>Triggered when sustained trends emerge (3 of last 5 sols), combined domain trends occur (sleep + mood), or acute symptoms are reported. The onboard CMO reviews transparent rule rationale and supplies.</p>
            <span className="contract-badge"><ShieldAlert size={13} /> Onboard CMO Console</span>
          </article>
          <article className="distance-tier-card">
            <h3><span className="distance-tier-step">3</span> Ground Flight Surgeon (<code>ground_flight_surgeon</code>)</h3>
            <p>For severe or unresolved clinical trends. Prepares a local store-and-forward telemetry handoff draft with FNV-1a-32 checksum. Zero runtime network transmission; protected for burst habitat uplink.</p>
            <span className="contract-badge"><Radio size={13} /> Earth Store-and-Forward</span>
          </article>
        </div>
      </section>

      {/* 3. Claim-versus-Evidence Matrix */}
      <section className="hazard-card" aria-labelledby="distance-matrix">
        <h2 className="hazard-name" id="distance-matrix">Claim-versus-Evidence Matrix (Section 2)</h2>
        <p className="muted">
          Every capability in Sol Check is grounded in published NASA documentation, with explicit non-clinical boundaries:
        </p>
        <div className="distance-table-wrapper">
          <table className="distance-contract-table">
            <thead>
              <tr>
                <th scope="col">Reference Source</th>
                <th scope="col">Supported Component</th>
                <th scope="col">Scientifically Proven (Supports)</th>
                <th scope="col">Prohibited Clinical Boundaries (Does Not Support)</th>
              </tr>
            </thead>
            <tbody>
              {CLAIM_VERSUS_EVIDENCE.map((row) => (
                <tr key={row.source}>
                  <td><strong>{row.source}</strong></td>
                  <td><code>{row.component}</code></td>
                  <td>{row.supports}</td>
                  <td className="muted">{row.doesNotSupport}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Frozen Design Parameters & Mandatory Wording Rules */}
      <section className="hazard-card" aria-labelledby="distance-params">
        <h2 className="hazard-name" id="distance-params">Frozen Design Parameters & Mandatory Wording Rules (Contract Sections 5 & 7)</h2>
        <div className="distance-params-grid">
          <div className="distance-param-box">
            <h3>Personal Baseline Window (F04)</h3>
            <p>Calculated as the mathematical median of previous readings in a <strong>{BASELINE_LOOKBACK_SOLS}-sol window</strong> with a minimum of <strong>{MIN_BASELINE_READINGS} distinct measured sols</strong>.</p>
            <p className="muted">If fewer than {MIN_BASELINE_READINGS} readings exist, status is strictly <code>baseline_not_established</code> (never default or assumed normal).</p>
          </div>
          <div className="distance-param-box">
            <h3>Sustained Trend Rule</h3>
            <p>Defined as a qualifying change in the same direction on at least <strong>{MIN_TREND_READINGS} of the last {TREND_LOOKBACK_SOLS} sols</strong> (e.g. Maya Chen on Sol 43: sleep and mood down on 4 of last 5 sols).</p>
            <p className="muted">Evaluated deterministically in pure TypeScript with max 8 rules in P0.</p>
          </div>
          <div className="distance-param-box">
            <h3>7 Frozen Metrics & 8 Symptoms</h3>
            <p>Core 7 metrics: {CORE_METRIC_IDS.map(id => METRICS[id].label).join(', ')}.</p>
            <p className="muted">Fixed 8 symptoms: {CORE_SYMPTOM_OPTIONS.map(opt => opt.label).join(' · ')}.</p>
          </div>
          <div className="distance-param-box">
            <h3>Mandatory Wording Rules</h3>
            <p>Banned clinical adjectives (never use in evaluation):</p>
            <div className="wording-tags">
              <span className="wording-tag wording-tag--banned">normal</span>
              <span className="wording-tag wording-tag--banned">healthy</span>
              <span className="wording-tag wording-tag--banned">safe</span>
              <span className="wording-tag wording-tag--banned">high risk</span>
            </div>
            <p style={{ marginTop: '0.5rem' }}>Exclusively enforced status vocabulary:</p>
            <div className="wording-tags">
              <span className="wording-tag wording-tag--allowed">no_change_detected</span>
              <span className="wording-tag wording-tag--allowed">change_from_baseline</span>
              <span className="wording-tag wording-tag--allowed">sustained_trend</span>
              <span className="wording-tag wording-tag--allowed">baseline_not_established</span>
              <span className="wording-tag wording-tag--allowed">check_entry</span>
              <span className="wording-tag wording-tag--allowed">not_measured</span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Software Monitoring & Logic Architecture Matrix */}
      <section className="hazard-card" aria-labelledby="distance-software">
        <h2 className="hazard-name" id="distance-software">Software Monitoring & Architecture Logic Matrix (Section 4)</h2>
        <p className="muted">
          Mapping each operational challenge of the Distance from Earth hazard directly to Sol Check software implementation:
        </p>
        <div className="distance-table-wrapper">
          <table className="distance-contract-table">
            <thead>
              <tr>
                <th scope="col">Hazard Challenge</th>
                <th scope="col">Operational Impact</th>
                <th scope="col">Sol Check Software Architecture & Logic</th>
              </tr>
            </thead>
            <tbody>
              {SOFTWARE_LOGIC_MATRIX.map((row) => (
                <tr key={row.hazard}>
                  <td><strong>{row.hazard}</strong></td>
                  <td>{row.impact}</td>
                  <td>{row.logic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. Radiation and Mission Context */}
      <section className="hazard-card" aria-labelledby="distance-timeline">
        <h2 className="hazard-name" id="distance-timeline">Radiation & Mission Context (P0-5 / F08)</h2>
        <p>
          The Mission Timeline displays 3 distinct streams: crew physiological readings (<code>synthetic_demo</code> / <code>user_entered</code>),
          mission operational events (<code>shelter_protocol</code> on Sols 41–42), and the authentic NASA Curiosity rover radiation record (<code>nasa_archive</code>, September 2017 absorbed dose rate in {RADLAB_UNIT}).
        </p>
        <p>
          Any temporal alignment is classified strictly as a <code>contextual_association</code>.
          The rover archive cannot establish personal crew absorbed dose, habitat shielding efficiency, or clinical biological causality.
        </p>
        <Link className="text-link" to="/timeline">Open Mission Timeline <ArrowRight size={15} aria-hidden="true" /></Link>
      </section>

      {/* 7. Evidence Sources */}
      <section className="hazard-card" aria-labelledby="distance-evidence">
        <h2 className="hazard-name" id="distance-evidence">Evidence Sources & Peer-Reviewed References</h2>
        <p className="muted">
          Sol Check is a research-informed prototype. Baseline comparison parameters and thresholds are demo heuristics.
        </p>
        <EvidenceSources ids={evidence} />
        <div style={{ marginTop: '0.85rem' }}>
          <p className="muted">
            <CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px', color: 'var(--status-steady)' }} />
            Contract specifications documented in <code>docs/hazard-3-distance-from-earth.md</code> and <code>docs/مرجع-البعد-عن-الأرض-والمراقبة-الصحية-Sol-Check-Contract-v1.md</code>.
          </p>
        </div>
      </section>
    </div>
  );
}
