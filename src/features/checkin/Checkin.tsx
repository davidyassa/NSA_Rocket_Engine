import { ArrowLeft, ArrowRight, Check, ExternalLink, Pencil } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  METRIC_IDS,
  METRICS,
  SYMPTOM_OPTIONS,
  measurementValueError,
  type AstronautProfile,
  type CheckinEntry,
  type MeasurementCapture,
  type MetricId,
} from '../../contracts';
import { MEASUREMENT_GUIDES, SOURCES } from '../../content';
import { CameraPulseCheck, type CameraVitalsEstimate } from './CameraPulseCheck';
import type { CameraPulseEstimate } from './pulseQuality';
import { FIELD_HINTS, PLAIN_FIELD_LABEL } from '../../content/plainLanguage';
import './checkin.css';

interface CheckinProps {
  sol: number;
  profile: AstronautProfile;
  demoPrefill: CheckinEntry['values'];
  initialEntry?: CheckinEntry;
  onSubmit: (entry: CheckinEntry) => void;
}

/** One short page per measurement, then symptoms, then a review. */
const STEPS: { id: string; title: string; metrics: readonly MetricId[]; intro: string }[] = [
  { id: 'heart', title: 'Heart rate', metrics: ['heart_rate'], intro: 'Type your resting pulse, or let the camera measure it for you.' },
  { id: 'breath', title: 'Breathing & HRV', metrics: ['respiratory_rate', 'hrv_rmssd'], intro: 'Optional, about 45 seconds. The camera reads your breathing rate and heart rate variability from the same face scan. No camera? Count your breaths for 60 seconds.' },
  { id: 'pressure', title: 'Blood pressure', metrics: ['bp_systolic', 'bp_diastolic'], intro: 'Use the arm cuff, then type both numbers from the screen.' },
  { id: 'stand', title: 'Stand-up test', metrics: ['bp_systolic_standing', 'bp_diastolic_standing', 'heart_rate_standing'], intro: 'Optional, about 3 minutes. Stand up and measure again to check how your body copes with gravity. Skip it if you feel unwell.' },
  { id: 'temperature', title: 'Body temperature', metrics: ['body_temp'], intro: 'Use the thermometer and type the reading in °C.' },
  { id: 'sugar', title: 'Blood sugar', metrics: ['blood_glucose'], intro: 'Use the finger-prick meter and type the number in mg/dL.' },
  { id: 'sleep', title: 'Sleep', metrics: ['sleep_duration'], intro: 'How many hours did you actually sleep last night?' },
  { id: 'mood', title: 'Mood', metrics: ['mood'], intro: 'Pick the number closest to how you feel right now.' },
  { id: 'water', title: 'Water & exercise', metrics: ['fluid_intake', 'exercise_minutes'], intro: 'Your daily countermeasures: what you drank and how long you exercised.' },
  { id: 'food', title: 'Food & weight', metrics: ['calorie_intake', 'body_mass'], intro: 'Optional. Far from Earth there is no resupply, so eating enough matters. Add up today’s food labels and weigh yourself.' },
  { id: 'feel', title: 'How you feel', metrics: [], intro: 'Tick anything you noticed today. Leave it empty if you feel fine.' },
  { id: 'review', title: 'Review & save', metrics: [], intro: 'Check your answers. Tap Edit to change anything.' },
];
const REVIEW_STEP = STEPS.length - 1;
const FEEL_STEP = STEPS.findIndex(step => step.id === 'feel');
const MEASUREMENT_STEPS = STEPS.filter(step => step.metrics.length > 0);

/** Symptom checkboxes grouped so related ones sit together. */
const SYMPTOM_GROUPS: { title: string; ids: string[] }[] = [
  { title: 'General', ids: ['headache', 'fatigue', 'muscle_ache', 'chest_discomfort', 'shortness_of_breath', 'digestive_discomfort', 'poor_appetite'] },
  { title: 'Dizziness and balance (motion sickness)', ids: ['dizziness', 'vertigo', 'nausea', 'vomiting', 'balance_problems'] },
  { title: 'Eyes and head (fluid shift)', ids: ['vision_changes', 'head_fullness'] },
  { title: 'Kidneys', ids: ['flank_pain'] },
  { title: 'Mind', ids: ['feeling_hopeless'] },
];

function stepForMetric(metric: MetricId): number {
  return Math.max(0, STEPS.findIndex(step => step.metrics.includes(metric)));
}

const moodChoices = [
  '1 · Very low',
  '2 · Low',
  '3 · Midpoint',
  '4 · Positive',
  '5 · Very positive',
];

function readingDraft(values: CheckinEntry['values']) {
  const draft: Partial<Record<MetricId, string>> = {};
  for (const metric of METRIC_IDS) {
    const value = values[metric];
    if (value !== undefined) draft[metric] = String(value);
  }
  return draft;
}

function MeasurementGuide({ metric, label }: { metric: MetricId; label: string }) {
  const guide = MEASUREMENT_GUIDES[metric];
  const source = SOURCES[guide.sourceId];

  return (
    <details className="measurement-guide">
      <summary aria-label={`How to measure ${label.toLowerCase()}`}>How to measure</summary>
      <ol className="measurement-guide-steps">
        {guide.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <dl className="measurement-guide-facts">
        <div><dt>Why it matters in space</dt><dd>{guide.whyInSpace}</dd></div>
        <div><dt>Typical range</dt><dd>{guide.typicalRange}</dd></div>
        <div><dt>Watch for</dt><dd>{guide.watchFor}</dd></div>
      </dl>
      <p className="measurement-guide-note">General reference only. Sol Check compares readings with your own baseline. Not a diagnosis.</p>
      {source && (source.url
        ? <a href={source.url} target="_blank" rel="noreferrer">{source.publisher} reference<ExternalLink size={13} aria-hidden="true" className="external-icon" /></a>
        : <small>{source.title}</small>)}
    </details>
  );
}

export function Checkin({ sol, profile, demoPrefill, initialEntry, onSubmit }: CheckinProps) {
  const [draft, setDraft] = useState(() => readingDraft(initialEntry?.values ?? {}));
  const [prefilled, setPrefilled] = useState(
    () => METRIC_IDS.filter(metric => initialEntry?.provenance[metric] === 'synthetic_demo'),
  );
  const [symptomIds, setSymptomIds] = useState<string[]>(initialEntry?.symptomIds ?? []);
  const [note, setNote] = useState(initialEntry?.note ?? '');
  const [errors, setErrors] = useState<Partial<Record<MetricId, string>>>({});
  const [saveError, setSaveError] = useState('');
  const [capture, setCapture] = useState<CheckinEntry['capture']>(() => initialEntry?.capture ?? {});
  const formRef = useRef<HTMLFormElement>(null);
  // Editing an existing check-in opens on the review page; a new one starts at heart rate.
  const [step, setStep] = useState(initialEntry ? REVIEW_STEP : 0);
  const [reviewVisited, setReviewVisited] = useState(Boolean(initialEntry));
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  function goTo(next: number, focusId?: string) {
    const clamped = Math.min(REVIEW_STEP, Math.max(0, next));
    if (clamped === REVIEW_STEP) setReviewVisited(true);
    setStep(clamped);
    setFocusTarget(focusId ?? null);
  }

  // Move focus to the new page (or a field with an error) so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const target = focusTarget ? formRef.current?.querySelector<HTMLElement>(`#${focusTarget}`) : stepHeading.current;
    target?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, focusTarget]);

  function edit(metric: MetricId, value: string) {
    setDraft(previous => ({ ...previous, [metric]: value }));
    setPrefilled(previous => previous.filter(id => id !== metric));
    // Manual typing replaces the estimate; camera provenance must not survive an edit.
    setCapture(previous => {
      if (!previous[metric]) return previous;
      const next = { ...previous };
      delete next[metric];
      return next;
    });
    setErrors(previous => {
      const next = { ...previous };
      delete next[metric];
      if (metric === 'bp_systolic' || metric === 'bp_diastolic') {
        delete next.bp_systolic;
        delete next.bp_diastolic;
      }
      return next;
    });
  }

  function fillDemo() {
    setDraft(readingDraft(demoPrefill));
    setPrefilled(METRIC_IDS.filter(metric => demoPrefill[metric] !== undefined));
    setCapture({});
    setErrors({});
    setSaveError('');
    goTo(REVIEW_STEP);
  }

  function acceptCameraEstimate(estimate: CameraPulseEstimate) {
    const measurementCapture: MeasurementCapture = {
      capturedAtUtc: estimate.capturedAtUtc,
      source: 'camera_estimate',
      status: 'accepted',
      signalQuality: estimate.sqi,
      algorithm: estimate.algorithm,
      device: 'browser webcam · on-device WebAssembly',
      synthetic: false,
    };
    setDraft(previous => ({ ...previous, heart_rate: String(estimate.bpm) }));
    setPrefilled(previous => previous.filter(id => id !== 'heart_rate'));
    setCapture(previous => ({ ...previous, heart_rate: measurementCapture }));
    setErrors(previous => {
      const next = { ...previous };
      delete next.heart_rate;
      return next;
    });
    // Reading accepted: move on to the next page automatically.
    window.setTimeout(() => goTo(1), 700);
  }

  function acceptCameraVitals(estimate: CameraVitalsEstimate) {
    const readings: [MetricId, number | null, number | null][] = [
      ['respiratory_rate', estimate.brpm, estimate.breathingQuality],
      ['hrv_rmssd', estimate.rmssd, null],
    ];
    const accepted = readings.filter((entry): entry is [MetricId, number, number | null] => entry[1] !== null);
    setDraft(previous => ({ ...previous, ...Object.fromEntries(accepted.map(([metric, value]) => [metric, String(value)])) }));
    setPrefilled(previous => previous.filter(id => !accepted.some(([metric]) => metric === id)));
    setCapture(previous => ({
      ...previous,
      ...Object.fromEntries(accepted.map(([metric, , quality]) => [metric, {
        capturedAtUtc: estimate.capturedAtUtc,
        source: 'camera_estimate',
        status: 'accepted',
        signalQuality: quality,
        algorithm: estimate.algorithm,
        device: 'browser webcam · on-device WebAssembly',
        synthetic: false,
      } satisfies MeasurementCapture])),
    }));
    setErrors(previous => {
      const next = { ...previous };
      for (const [metric] of accepted) delete next[metric];
      return next;
    });
    const breathStep = STEPS.findIndex(page => page.id === 'breath');
    window.setTimeout(() => goTo(breathStep + 1), 700);
  }

  /** Parse and check every reading; returns values plus any problems. */
  function validate() {
    const values: CheckinEntry['values'] = {};
    const provenance: CheckinEntry['provenance'] = {};
    const issues: Partial<Record<MetricId, string>> = {};

    for (const metric of METRIC_IDS) {
      const raw = draft[metric]?.trim();
      if (!raw) continue;
      const value = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) ? Number(raw) : NaN;
      const issue = measurementValueError(metric, value);
      if (issue) {
        issues[metric] = issue;
        continue;
      }
      values[metric] = value;
      provenance[metric] = prefilled.includes(metric) ? 'synthetic_demo' : 'user_entered';
    }

    const systolic = values.bp_systolic;
    const diastolic = values.bp_diastolic;
    if (!issues.bp_systolic && !issues.bp_diastolic) {
      if (systolic === undefined && diastolic !== undefined) {
        issues.bp_systolic = 'Enter the top number (systolic) too.';
      } else if (diastolic === undefined && systolic !== undefined) {
        issues.bp_diastolic = 'Enter the bottom number (diastolic) too.';
      } else if (systolic !== undefined && diastolic !== undefined && systolic <= diastolic) {
        issues.bp_systolic = 'Systolic pressure must be greater than diastolic pressure. The top number should be the bigger one.';
      }
    }
    return { values, provenance, issues };
  }

  /** Next: check only this page's readings, then continue. */
  function next() {
    const { issues } = validate();
    const pageIssues = Object.fromEntries(
      Object.entries(issues).filter(([metric]) => STEPS[step].metrics.includes(metric as MetricId)),
    ) as Partial<Record<MetricId, string>>;
    setErrors(pageIssues);
    const firstError = STEPS[step].metrics.find(metric => pageIssues[metric]);
    if (firstError) {
      formRef.current?.querySelector<HTMLElement>(`#reading-${firstError}`)?.focus();
      return;
    }
    goTo(step + 1);
  }

  function skip() {
    setDraft(previous => {
      const nextDraft = { ...previous };
      for (const metric of STEPS[step].metrics) delete nextDraft[metric];
      return nextDraft;
    });
    setErrors({});
    goTo(step + 1);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    if (submitter?.dataset.action !== 'save' && step !== REVIEW_STEP) {
      next(); // Enter key or Next button
      return;
    }
    setSaveError('');
    const { values, provenance, issues } = validate();

    const firstError = METRIC_IDS.find(metric => issues[metric]);
    setErrors(issues);
    if (firstError) {
      // Jump back to the page with the problem and put the cursor in that field.
      goTo(stepForMetric(firstError), `reading-${firstError}`);
      return;
    }
    const captureForSubmit: CheckinEntry['capture'] = {};
    for (const metric of METRIC_IDS) {
      if (values[metric] !== undefined && provenance[metric] === 'user_entered' && capture[metric]) {
        captureForSubmit[metric] = capture[metric];
      }
    }
    try {
      onSubmit({ values, symptomIds, note: note.trim(), provenance, capture: captureForSubmit });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this check-in. Try again.');
    }
  }

  function readingField(metric: MetricId) {
    const metadata = METRICS[metric];
    const id = `reading-${metric}`;
    const label = PLAIN_FIELD_LABEL[metric] ?? metadata.label;
    const isSynthetic = prefilled.includes(metric);
    const cameraCapture = capture[metric]?.source === 'camera_estimate' ? capture[metric] : undefined;
    const descriptions = [`${id}-hint`, `${id}-unit`];
    if (isSynthetic) descriptions.push(`${id}-origin`);
    if (cameraCapture) descriptions.push(`${id}-origin`);
    if (errors[metric]) descriptions.push(`${id}-error`);
    const fieldProps = {
      id,
      value: draft[metric] ?? '',
      'aria-invalid': Boolean(errors[metric]),
      'aria-describedby': descriptions.join(' '),
    };

    return (
      <div className="reading-field" key={metric}>
        <label htmlFor={id}>{label}</label>
        <p className="reading-hint" id={`${id}-hint`}>{FIELD_HINTS[metric]}</p>
        <div className="reading-control">
          {metric === 'mood' ? (
            <select {...fieldProps} onChange={event => edit(metric, event.target.value)}>
              <option value="">Not measured</option>
              {moodChoices.map((choice, index) => (
                <option key={choice} value={index + 1}>{choice}</option>
              ))}
            </select>
          ) : (
            <input
              {...fieldProps}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="—"
              onChange={event => edit(metric, event.target.value)}
            />
          )}
          <span className="reading-unit" id={`${id}-unit`}>{metadata.unitLabel}</span>
        </div>
        {isSynthetic && <span className="badge badge-synthetic reading-origin" id={`${id}-origin`}>Synthetic</span>}
        {cameraCapture && (
          <span
            className="badge reading-origin reading-origin--camera"
            id={`${id}-origin`}
            title={`${cameraCapture.algorithm ?? 'Camera estimate'} · captured ${cameraCapture.capturedAtUtc ?? 'during this session'}`}
          >
            Camera estimate · SQI {Math.round((cameraCapture.signalQuality ?? 0) * 100)}%
          </span>
        )}
        {errors[metric] && (
          <span className="reading-error" id={`${id}-error`} role="alert">{errors[metric]}</span>
        )}
      </div>
    );
  }

  const current = STEPS[step];
  const progress = Math.round(((step + 1) / STEPS.length) * 100);
  const displayValue = (metric: MetricId) => {
    const raw = draft[metric]?.trim();
    if (!raw) return null;
    if (metric === 'mood') return moodChoices[Number(raw) - 1] ?? raw;
    return `${raw} ${METRICS[metric].unitLabel}`;
  };

  return (
    <>
      <header className="page-intro checkin-intro">
        <div>
          <h1>Check-in</h1>
          <p className="muted">Sol {sol}. One question at a time for {profile.displayName}. You can skip anything you did not measure.</p>
        </div>
        <div className="checkin-intro-actions">
          {profile.isSynthetic && <span className="badge badge-synthetic">Synthetic crew profile</span>}
          <button className="button button-sm button-secondary" type="button" onClick={fillDemo}>
            Fill demo readings
          </button>
        </div>
      </header>

      <form ref={formRef} className="checkin-wizard" noValidate onSubmit={submit}>
        <nav className="wizard-progress" aria-label="Check-in steps">
          <p className="wizard-progress-label">
            Step {step + 1} of {STEPS.length} · <strong>{current.title}</strong>
          </p>
          <div className="wizard-progress-track" role="progressbar" aria-label="Check-in progress"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="wizard-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <ol className="wizard-steps">
            {STEPS.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`wizard-step-chip${index === step ? ' is-current' : ''}${index < step ? ' is-done' : ''}`}
                  aria-current={index === step ? 'step' : undefined}
                  onClick={() => goTo(index)}
                >
                  <span aria-hidden="true">{index < step ? <Check size={12} /> : index + 1}</span>
                  {item.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <p className="checkin-demo-status" aria-live="polite">
          {prefilled.length > 0 && 'Demo readings loaded. Anything you change is saved as your own entry.'}
        </p>

        {STEPS.map((item, index) => (
          <section
            key={item.id}
            className="panel wizard-page"
            hidden={index !== step}
            aria-labelledby={`step-title-${item.id}`}
          >
            <h2 id={`step-title-${item.id}`} ref={index === step ? stepHeading : undefined} tabIndex={-1}>{item.title}</h2>
            <p className="wizard-intro">{item.intro}</p>

            {item.metrics.length > 0 && (
              <fieldset className="checkin-metric">
                {item.metrics.length > 1 && <legend className="sr-only">{item.title}</legend>}
                <div className={item.metrics.length > 1 ? 'pressure-grid' : undefined}>
                  {item.metrics.map(readingField)}
                </div>
                {/* The camera only runs while the heart-rate page is open. */}
                {item.id === 'heart' && index === step && (
                  <CameraPulseCheck onAcceptEstimate={acceptCameraEstimate} />
                )}
                {item.id === 'breath' && index === step && (
                  <CameraPulseCheck mode="breathing" onAcceptVitals={acceptCameraVitals} />
                )}
                {item.id === 'breath' && (capture.respiratory_rate?.source === 'camera_estimate' || capture.hrv_rmssd?.source === 'camera_estimate') && (
                  <p className="checkin-capture-note">
                    These values came from the camera. Typing a new number replaces it with your own entry.
                  </p>
                )}
                {item.id === 'heart' && capture.heart_rate?.source === 'camera_estimate' && (
                  <p className="checkin-capture-note">
                    This value came from the camera. Typing a new number replaces it with your own entry.
                  </p>
                )}
                <MeasurementGuide metric={item.metrics[0]} label={item.metrics.length > 1 ? item.title : METRICS[item.metrics[0]].label} />
              </fieldset>
            )}

            {item.id === 'feel' && (
              <div className="checkin-context">
                {SYMPTOM_GROUPS.map(group => (
                <fieldset className="symptom-group" key={group.title}>
                <legend>{group.title}</legend>
                <div className="symptom-list">
                  {SYMPTOM_OPTIONS.filter(symptom => group.ids.includes(symptom.id)).map(symptom => (
                    <label key={symptom.id} className="symptom-option" htmlFor={`symptom-${symptom.id}`}>
                      <input
                        id={`symptom-${symptom.id}`}
                        type="checkbox"
                        value={symptom.id}
                        checked={symptomIds.includes(symptom.id)}
                        onChange={event => {
                          const checked = event.target.checked;
                          setSymptomIds(previous => checked
                            ? [...previous, symptom.id]
                            : previous.filter(id => id !== symptom.id));
                        }}
                      />
                      {symptom.label}
                    </label>
                  ))}
                </div>
                </fieldset>
                ))}
                <label className="checkin-note-label" htmlFor="checkin-note">Anything else? <span>Optional</span></label>
                <textarea id="checkin-note" rows={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
              </div>
            )}

            {item.id === 'review' && (
              <dl className="review-list">
                {MEASUREMENT_STEPS.map(page => (
                  <div key={page.id} className={page.metrics.some(metric => errors[metric]) ? 'has-error' : undefined}>
                    <dt>{page.title}</dt>
                    <dd>
                      {page.metrics.map(metric => displayValue(metric)).filter(Boolean).join(' / ') || <span className="muted">Not measured</span>}
                    </dd>
                    <button type="button" className="button button-sm button-ghost" onClick={() => goTo(STEPS.indexOf(page))}>
                      <Pencil size={14} aria-hidden="true" /> Edit<span className="sr-only"> {page.title}</span>
                    </button>
                  </div>
                ))}
                <div>
                  <dt>How you feel</dt>
                  <dd>
                    {symptomIds.length
                      ? SYMPTOM_OPTIONS.filter(option => symptomIds.includes(option.id)).map(option => option.label).join(', ')
                      : <span className="muted">Nothing ticked</span>}
                    {note.trim() && <span className="review-note">Note: {note.trim()}</span>}
                  </dd>
                  <button type="button" className="button button-sm button-ghost" onClick={() => goTo(FEEL_STEP)}>
                    <Pencil size={14} aria-hidden="true" /> Edit<span className="sr-only"> how you feel</span>
                  </button>
                </div>
              </dl>
            )}
          </section>
        ))}

        <div className="wizard-nav">
          {Object.keys(errors).length > 0 && <p className="reading-error">Please check the highlighted number before going on.</p>}
          {saveError && <p className="reading-error" role="alert">{saveError}</p>}
          <div className="wizard-nav-buttons">
            <button className="button button-secondary" type="button" onClick={() => goTo(step - 1)} disabled={step === 0}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            {step < REVIEW_STEP && current.metrics.length > 0 && (
              <button className="button button-ghost" type="button" onClick={skip} aria-label="Skip, not measured today">Skip</button>
            )}
            {step < REVIEW_STEP && (
              <button className={`button ${reviewVisited ? 'button-secondary' : 'button-primary'}`} type="submit" data-action="next">
                Next <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
            {/* Always in the page so a fix made on any page can be saved straight away. */}
            <button className="button button-primary" type="submit" data-action="save"
              hidden={step !== REVIEW_STEP && !reviewVisited}>
              Save and assess <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
