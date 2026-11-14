import { useState, type FormEvent } from 'react';
import { ArrowRight, Brain, Moon, Smile } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DailyCheckin, DemoScenario, RiskAssessment } from '../../contracts';
import { metricBaseline, usableMeasurement } from '../../engine';
import { BASELINE_LOOKBACK_SOLS, DEMO_DELTAS, MIN_BASELINE_READINGS, MIN_TREND_READINGS, TREND_LOOKBACK_SOLS } from '../../engine/rules';
import { VigilanceReadings } from '../cognitive/VigilanceReadings';
import { sessionsForSol, type VigilanceSession } from '../cognitive/vigilance';
import { NASA_FIVE_HAZARDS } from './hazardsData';
import { ACTIVITIES, emptyIsolationPlan, type IsolationPlan, type IsolationPlanTask } from './isolationPlan';
import './hazards.css';

const hazard = NASA_FIVE_HAZARDS.find(({ id }) => id === 'isolation')!;
const number = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

function CountermeasurePlan({ sol, plan, previous, delay, onSave }: {
  sol: number;
  plan?: IsolationPlan;
  previous?: { sol: number; plan: IsolationPlan };
  delay: number;
  onSave: (plan: IsolationPlan) => void;
}) {
  const [draft, setDraft] = useState(plan ?? emptyIsolationPlan);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  function update<K extends keyof IsolationPlan>(key: K, value: IsolationPlan[K], task?: IsolationPlanTask) {
    setDraft((previous) => ({
      ...previous, [key]: value,
      ...(task ? { completed: previous.completed.filter((id) => id !== task) } : {}),
    }));
    setStatus('');
    setError('');
  }

  function completed(task: IsolationPlanTask, label: string, enabled: boolean) {
    const checked = draft.completed.includes(task);
    return (
      <label className="isolation-complete">
        <input type="checkbox" checked={checked} disabled={!enabled}
          onChange={() => update('completed', checked ? draft.completed.filter((id) => id !== task) : [...draft.completed, task])} />
        {label}
      </label>
    );
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (Boolean(draft.sleepAt) !== Boolean(draft.wakeAt) || (draft.sleepAt && draft.sleepAt === draft.wakeAt)) {
      setError('Choose different sleep and wake times, or clear both.');
      return;
    }
    if (Boolean(draft.contactAt) !== Boolean(draft.contactMethod) || Boolean(draft.activityAt) !== Boolean(draft.activity)) {
      setError('Choose a time and an option for each Earth contact or activity you plan.');
      return;
    }
    try {
      onSave(draft);
      setStatus(`Plan for Sol ${sol} saved on this device.`);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The plan could not be saved. Try again.');
    }
  }

  return (
    <section className="panel isolation-section" aria-labelledby="countermeasure-title">
      <h2 id="countermeasure-title">Countermeasure plan</h2>
      <p className="muted">Plan Sol {sol} in simulated habitat time. Save your plan and mark actions as you complete them.</p>
      {previous && <details className="isolation-previous-plan">
        <summary>Previous plan · Sol {previous.sol}</summary>
        <p>{previous.plan.completed.length} of 4 actions completed.</p>
        <button className="button button-secondary" type="button" onClick={() => {
          setDraft({ ...previous.plan, completed: [] });
          setStatus('Previous plan copied. Save it for this sol when ready.');
          setError('');
        }}>Copy times and activities</button>
      </details>}
      <form onSubmit={save}>
        <div className="isolation-plan-grid">
          <fieldset>
            <legend>Protected sleep</legend>
            <div className="isolation-fields">
              <label>Sleep time<input type="time" value={draft.sleepAt} onChange={(e) => update('sleepAt', e.target.value, 'sleep')} /></label>
              <label>Wake time<input type="time" value={draft.wakeAt} onChange={(e) => update('wakeAt', e.target.value, 'sleep')} /></label>
            </div>
            <p>Keep the sleep period quiet and allow time to wind down.</p>
            {completed('sleep', 'Sleep period protected', Boolean(draft.sleepAt && draft.wakeAt))}
          </fieldset>
          <fieldset>
            <legend>Habitat lighting</legend>
            <p>Plan brighter, blue-enriched white light after waking and dimmer, blue-depleted light before sleep.</p>
            {draft.sleepAt && draft.wakeAt && <p>Wake light at {draft.wakeAt} · Dim before {draft.sleepAt}</p>}
            {completed('lighting', 'Lighting plan followed', true)}
          </fieldset>
          <fieldset>
            <legend>Earth contact</legend>
            <div className="isolation-fields">
              <label>Contact time<input type="time" value={draft.contactAt} onChange={(e) => update('contactAt', e.target.value, 'contact')} /></label>
              <label>Message format<select value={draft.contactMethod} onChange={(e) => update('contactMethod', e.target.value as IsolationPlan['contactMethod'], 'contact')}>
                <option value="">Choose format</option><option>Written message</option><option>Recorded voice</option><option>Recorded video</option>
              </select></label>
            </div>
            <p>{delay} min one way in this scenario. Record a contact plan for a written or recorded message.</p>
            {completed('contact', 'Earth contact completed', Boolean(draft.contactAt && draft.contactMethod))}
          </fieldset>
          <fieldset>
            <legend>Activity and sensory variety</legend>
            <div className="isolation-fields">
              <label>Activity time<input type="time" value={draft.activityAt} onChange={(e) => update('activityAt', e.target.value, 'activity')} /></label>
              <label>Activity<select value={draft.activity} onChange={(e) => update('activity', e.target.value as IsolationPlan['activity'], 'activity')}>
                <option value="">Choose activity</option>{ACTIVITIES.map((activity) => <option key={activity}>{activity}</option>)}
              </select></label>
            </div>
            {completed('activity', 'Activity completed', Boolean(draft.activityAt && draft.activity))}
          </fieldset>
        </div>
        <div className="hazard-actions"><button type="submit" className="button button-primary">Save plan</button></div>
        {status && <p role="status">{status}</p>}
        {error && <p role="alert" className="reading-error">{error}</p>}
      </form>
    </section>
  );
}

export function IsolationHazard({ scenario, current, assessment, records, vigilance, plans, onSavePlan, onAdvance }: {
  scenario: DemoScenario;
  current: DailyCheckin | null;
  assessment: RiskAssessment | null;
  records: readonly DailyCheckin[];
  vigilance: readonly VigilanceSession[];
  plans?: Record<string, IsolationPlan>;
  onSavePlan: (plan: IsolationPlan) => void;
  onAdvance: () => void;
}) {
  const sol = scenario.startSol;
  const [advanceError, setAdvanceError] = useState('');
  const [confirmAdvance, setConfirmAdvance] = useState(false);
  const sleep = current && usableMeasurement(current, 'sleep_duration');
  const mood = current && usableMeasurement(current, 'mood');
  const sleepBaseline = current && metricBaseline('sleep_duration', current, records);
  const moodBaseline = current && metricBaseline('mood', current, records);
  const sleepChange = sleep && sleepBaseline ? sleep.value - sleepBaseline.median : null;
  const sleepPercentage = sleepChange !== null && sleepBaseline && sleepBaseline.median > 0
    ? Math.round(Math.abs(sleepChange / sleepBaseline.median) * 100) : null;
  const combined = assessment?.findings.some(({ ruleId }) => ruleId === 'combined-sleep-mood');
  const fatigue = current?.symptoms.some(({ id, present }) => id === 'fatigue' && present);
  const hasVigilance = sessionsForSol(vigilance, sol).length > 0;
  const previousSol = Object.keys(plans ?? {}).map(Number).filter((day) => day < sol).sort((a, b) => b - a)[0];
  const previousPlan = plans?.[previousSol];

  function advance() {
    try {
      onAdvance();
    } catch (error) {
      setAdvanceError(error instanceof Error ? error.message : 'The next sol could not be opened. Try again.');
    }
  }

  return (
    <div className="isolation-page">
      <header className="page-intro">
        <Link to="/hazards" className="text-link">All five hazards</Link>
        <h1>Isolation and confinement</h1>
        <p>Hazard 2 · {hazard.hrpRiskId} · Sol {sol}</p>
      </header>

      <section className="panel isolation-section" aria-labelledby="isolation-monitoring">
        <h2 id="isolation-monitoring">Sol {sol} monitoring</h2>
        {!current && <p>No check-in saved for this sol. Record sleep, mood, and any symptoms to see your assessment.</p>}
        {combined && <p className="isolation-review"><strong>Crew Medical Officer review recommended.</strong> Sleep and mood both met the sustained lower-trend rule.</p>}
        <div className="isolation-readings">
          <article>
            <h3><Moon size={18} aria-hidden="true" /> Sleep duration</h3>
            <strong>{sleep ? `${number.format(sleep.value)} h` : 'No reading'}</strong>
            {sleepBaseline && <p>Personal baseline {number.format(sleepBaseline.median)} h{sleepChange !== null && sleepChange !== 0
              ? ` · ${number.format(Math.abs(sleepChange))} h ${sleepChange < 0 ? 'lower' : 'higher'}${sleepPercentage === null ? '' : ` (${sleepPercentage}%)`}` : ''}</p>}
            <Link to="/trends?metric=sleep_duration" className="text-link">Sleep trend</Link>
          </article>
          <article>
            <h3><Smile size={18} aria-hidden="true" /> Mood</h3>
            <strong>{mood ? `${mood.value}/5` : 'No reading'}</strong>
            {moodBaseline && <p>Personal baseline {number.format(moodBaseline.median)}/5</p>}
            <Link to="/trends?metric=mood" className="text-link">Mood trend</Link>
          </article>
          <article>
            <h3><Brain size={18} aria-hidden="true" /> Vigilance</h3>
            <strong>{hasVigilance ? 'Result saved' : 'No result'}</strong>
            {(combined || fatigue) && !hasVigilance && <p>A vigilance check is recommended.</p>}
            <Link to="/cognitive" className="text-link">Open Cognitive Lab</Link>
            <Link to="/trends?metric=vigilance" className="text-link">Vigilance history</Link>
          </article>
        </div>
        <div className="hazard-actions">
          <Link className="button button-primary" to={current ? '/assessment' : '/check-in'}>
            {current ? 'Review assessment' : 'Start check-in'} <ArrowRight size={16} aria-hidden="true" />
          </Link>
          {assessment?.recommendedTier === 'crew_medical_officer' && <Link to="/cmo" className="button button-secondary">CMO console</Link>}
        </div>
        <details>
          <summary>How the trend works</summary>
          <p>Sol Check uses the median of the prior {BASELINE_LOOKBACK_SOLS} sols, with at least {MIN_BASELINE_READINGS} usable readings. Lower sleep by {DEMO_DELTAS.sleep_duration} hour or lower mood by {DEMO_DELTAS.mood} point qualifies on a given sol. Each indicator needs at least {MIN_TREND_READINGS} qualifying readings in the last {TREND_LOOKBACK_SOLS} sols and a usable current reading. These are demo rules for follow-up.</p>
        </details>
      </section>

      {hasVigilance && <VigilanceReadings sol={sol} history={vigilance} />}
      <CountermeasurePlan sol={sol} plan={plans?.[sol]} previous={previousPlan ? { sol: previousSol, plan: previousPlan } : undefined}
        delay={scenario.missionContext.oneWayDelayMinutes} onSave={onSavePlan} />

      <section className="panel isolation-section" aria-labelledby="isolation-followup">
        <h2 id="isolation-followup">Follow-up check-in</h2>
        <p>Compare sleep, mood, and vigilance over later sols. When you’re ready, open Sol {sol + 1} to record new readings.</p>
        {current ? (
          <div className="hazard-actions">
            {confirmAdvance
              ? <><button className="button button-primary" type="button" onClick={advance}>Start Sol {sol + 1} check-in</button>
                <button className="button button-secondary" type="button" onClick={() => setConfirmAdvance(false)}>Cancel</button></>
              : <button className="button button-secondary" type="button" onClick={() => setConfirmAdvance(true)}>Open next simulated sol</button>}
          </div>
        ) : <Link to="/check-in" className="text-link">Record this sol first</Link>}
        {advanceError && <p role="alert" className="reading-error">{advanceError}</p>}
      </section>

      <section className="panel isolation-section" aria-labelledby="isolation-evidence">
        <h2 id="isolation-evidence">Hazard and evidence</h2>
        <p>{hazard.spaceflightMechanism}</p>
        <ul className="hazard-list">{hazard.clinicalImpacts.map((impact) => <li key={impact}>{impact}</li>)}</ul>
        <details>
          <summary>NASA and research sources</summary>
          <ul className="hazard-list">{hazard.officialReferences.map(({ title, link }) => (
            <li key={title}><a href={link} target="_blank" rel="noreferrer">{title}</a></li>
          ))}</ul>
        </details>
      </section>
    </div>
  );
}
