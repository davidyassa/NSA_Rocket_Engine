import { ArrowLeft, ArrowRight, Check, ExternalLink, Pencil } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CORE_SYMPTOM_OPTIONS,
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
import { MicCheck, type MicReading } from './audio/MicCheck';
import type { CameraPulseEstimate } from './pulseQuality';
import { FIELD_HINTS, PLAIN_FIELD_LABEL } from '../../content/plainLanguage';
import {
  MOOD_QUESTIONS,
  evaluateFullMoodAssessment,
  type MoodMcqAnswers,
  type MoodEvaluationContext,
} from './moodAssessment';
import './checkin.css';
import type { CheckinPatch } from '../assistant/checkinCommands';
import type { MissionEvidence } from '../assistant/missionAnswers';

interface CheckinProps {
  sol: number;
  profile: AstronautProfile;
  demoPrefill?: CheckinEntry['values'];
  initialEntry?: CheckinEntry;
  voiceDraft?: readonly CheckinPatch[];
  onAssistantDraft?: (draft: MissionEvidence['checkinDraft']) => void;
  onSubmit: (entry: CheckinEntry) => void;
}

/** 8 sequential pages: Heart Rate (Pulse), Breathing & HRV, Blood Pressure, Temperature & Sugar, Sleep, Mood, Symptoms & Activity, Review & Save */
const STEPS: { id: string; title: string; metrics: readonly MetricId[]; intro: string }[] = [
  { id: 'heart', title: 'Heart rate', metrics: ['heart_rate'], intro: 'Page 1 of 8: Type your resting pulse or read it with the camera.' },
  { id: 'breath', title: 'Breathing & HRV', metrics: ['respiratory_rate', 'hrv_rmssd'], intro: 'Page 2 of 8: Camera-derived breathing rate and heart rate variability (HRV), or enter breath count manually.' },
  { id: 'pressure', title: 'Blood pressure', metrics: ['bp_systolic', 'bp_diastolic', 'bp_systolic_standing', 'bp_diastolic_standing', 'heart_rate_standing'], intro: 'Page 3 of 8: Use the arm cuff to record seated blood pressure (mmHg). Includes optional stand-up test.' },
  { id: 'temp_sugar', title: 'Temperature & Sugar', metrics: ['body_temp', 'blood_glucose'], intro: 'Page 4 of 8: Core body temperature (°C) with thermometer and blood glucose (mg/dL) with finger-prick meter.' },
  { id: 'sleep', title: 'Sleep', metrics: ['sleep_duration'], intro: 'Page 5 of 8: How many hours did you actually sleep last night?' },
  { id: 'mood', title: 'Mood', metrics: ['mood', 'voice_pitch_variability', 'voice_articulation_rate', 'voice_pause_ratio'], intro: 'Page 6 of 8: Complete the 6-question psychological assessment. Score and clinical adjustments are computed live. Optional: a 40-second voice check.' },
  { id: 'feel', title: 'How you feel & Activity', metrics: ['fluid_intake', 'exercise_minutes', 'calorie_intake', 'body_mass'], intro: 'Page 7 of 8: Tick any symptoms noticed today, log your daily countermeasures (water, exercise, food, weight), and any notes.' },
  { id: 'review', title: 'Review & save', metrics: [], intro: 'Page 8 of 8: Review all answers from Pages 1–7. Tap Edit to change anything, then save your check-in.' },
];
const REVIEW_STEP = STEPS.length - 1;
const FEEL_STEP = STEPS.findIndex(step => step.id === 'feel');
const EXTRA_SYMPTOMS = SYMPTOM_OPTIONS.slice(CORE_SYMPTOM_OPTIONS.length);

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

export function Checkin({ sol, profile, demoPrefill, initialEntry, voiceDraft, onAssistantDraft, onSubmit }: CheckinProps) {
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
  const [step, setStep] = useState(initialEntry ? REVIEW_STEP : 0);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Standardized 6-question Crew Mood Assessment MCQ state
  const [mcqAnswers, setMcqAnswers] = useState<MoodMcqAnswers>(() => {
    const existing = initialEntry?.values?.mood;
    if (existing && existing >= 1 && existing <= 5) {
      return {
        q1_emotional_state: existing,
        q2_sleep_restfulness: existing,
        q3_workload: existing,
        q4_crew_connection: existing,
        q5_focus_concentration: existing,
        q6_physical_comfort: existing,
      };
    }
    return {};
  });
  const [isManualMoodOverride, setIsManualMoodOverride] = useState(false);
  const [voiceMoodSuggested, setVoiceMoodSuggested] = useState(false);
  const appliedVoiceDraft = useRef<number>(0);
  useEffect(() => {
    onAssistantDraft?.({ page: STEPS[step].title, readings: draft, symptoms: SYMPTOM_OPTIONS.filter(option => symptomIds.includes(option.id)).map(option => option.label), note });
  }, [onAssistantDraft, step, draft, symptomIds, note]);
  useEffect(() => () => onAssistantDraft?.(undefined), [onAssistantDraft]);

  // Cross-metric context evaluation
  const sitSys = Number(draft.bp_systolic);
  const standSys = Number(draft.bp_systolic_standing);
  const sitDia = Number(draft.bp_diastolic);
  const standDia = Number(draft.bp_diastolic_standing);
  const sitHr = Number(draft.heart_rate);
  const standHr = Number(draft.heart_rate_standing);

  const hasOrthostatic = (
    (!isNaN(sitSys) && !isNaN(standSys) && sitSys - standSys >= 20) ||
    (!isNaN(sitDia) && !isNaN(standDia) && sitDia - standDia >= 10) ||
    (!isNaN(sitHr) && !isNaN(standHr) && standHr - sitHr >= 30)
  );

  const moodEvaluationContext: MoodEvaluationContext = {
    symptomIds,
    sleepDuration: draft.sleep_duration ? Number(draft.sleep_duration) : undefined,
    fluidIntakeLiters: draft.fluid_intake ? Number(draft.fluid_intake) : undefined,
    exerciseMinutes: draft.exercise_minutes ? Number(draft.exercise_minutes) : undefined,
    hasOrthostaticIntolerance: hasOrthostatic,
    habitatCo2Mmhg: 1.2,
    personalMedianBaseline: 4,
  };

  const moodAssessment = evaluateFullMoodAssessment(mcqAnswers, moodEvaluationContext);

  useEffect(() => {
    if (!isManualMoodOverride && moodAssessment.finalIntegerScore !== null && Object.keys(mcqAnswers).length > 0) {
      const scoreStr = String(moodAssessment.finalIntegerScore);
      if (draft.mood !== scoreStr) {
        setDraft(prev => ({ ...prev, mood: scoreStr }));
        setErrors(prev => {
          if (!prev.mood) return prev;
          const next = { ...prev };
          delete next.mood;
          return next;
        });
      }
    }
  }, [moodAssessment.finalIntegerScore, mcqAnswers, isManualMoodOverride, draft.mood]);

  function handleSelectMcq(questionId: keyof MoodMcqAnswers, score: number) {
    setVoiceMoodSuggested(false);
    setIsManualMoodOverride(false);
    const updated = { ...mcqAnswers, [questionId]: score };
    setMcqAnswers(updated);
    const evaluated = evaluateFullMoodAssessment(updated, moodEvaluationContext);
    if (evaluated.finalIntegerScore !== null) {
      edit('mood', String(evaluated.finalIntegerScore));
    }
  }

  function goTo(next: number, focusId?: string) {
    const clamped = Math.min(REVIEW_STEP, Math.max(0, next));
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
    if (metric === 'mood') setVoiceMoodSuggested(false);
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

  useEffect(() => {
    if (!voiceDraft || appliedVoiceDraft.current === voiceDraft.length) return;
    const pending = voiceDraft.slice(appliedVoiceDraft.current);
    appliedVoiceDraft.current = voiceDraft.length;
    let updatedNote = note;
    setSaveError('');
    for (const { readings, symptoms, note: voiceNote, moodSuggested } of pending) {
      for (const metric of METRIC_IDS) {
        const value = readings[metric];
        if (value !== undefined) edit(metric, String(value));
      }
      const mood = readings.mood;
      if (mood !== undefined) {
        setIsManualMoodOverride(true);
        if (moodSuggested) setMcqAnswers(previous => ({ ...previous, q1_emotional_state: mood }));
        setVoiceMoodSuggested(Boolean(moodSuggested));
      }
      setSymptomIds(previous => [...new Set([
        ...previous.filter(id => symptoms[id] !== false),
        ...Object.keys(symptoms).filter(id => symptoms[id]),
      ])]);
      if (voiceNote) {
        const next = voiceNote.append && updatedNote.trim() ? `${updatedNote.trim()}\n${voiceNote.text}` : voiceNote.text;
        if (next.length <= 500) updatedNote = next;
        else setSaveError('The voice note would exceed 500 characters. Shorten the existing note and try again.');
      }
    }
    if (updatedNote !== note) setNote(updatedNote);
    goTo(REVIEW_STEP);
  }, [voiceDraft, note]);

  function fillDemo() {
    if (!demoPrefill) return;
    const filled = METRIC_IDS.filter(metric => demoPrefill[metric] !== undefined);
    const values = readingDraft(demoPrefill);
    setDraft(values);
    setPrefilled(filled);
    setCapture({});
    setErrors({});
    setSaveError('');
    if (demoPrefill.mood) {
      const m = Number(demoPrefill.mood);
      setMcqAnswers({
        q1_emotional_state: m,
        q2_sleep_restfulness: m,
        q3_workload: m,
        q4_crew_connection: m,
        q5_focus_concentration: m,
        q6_physical_comfort: m,
      });
      setIsManualMoodOverride(false);
    }
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

  function acceptMicReading(reading: MicReading) {
    const accepted = Object.entries(reading.values) as [MetricId, number][];
    setDraft(previous => ({ ...previous, ...Object.fromEntries(accepted.map(([metric, value]) => [metric, String(value)])) }));
    setPrefilled(previous => previous.filter(id => !accepted.some(([metric]) => metric === id)));
    setCapture(previous => ({
      ...previous,
      ...Object.fromEntries(accepted.map(([metric]) => [metric, {
        capturedAtUtc: reading.capturedAtUtc,
        source: 'microphone_estimate',
        status: 'accepted',
        signalQuality: reading.quality,
        algorithm: reading.algorithm,
        device: 'device microphone · on-device analysis',
        synthetic: false,
      } satisfies MeasurementCapture])),
    }));
    setErrors(previous => {
      const next = { ...previous };
      for (const [metric] of accepted) delete next[metric];
      return next;
    });
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

  function clearForm() {
    setDraft({});
    setPrefilled([]);
    setSymptomIds([]);
    setNote('');
    setErrors({});
    setSaveError('');
    setCapture({});
    setMcqAnswers({});
    setIsManualMoodOverride(false);
    setVoiceMoodSuggested(false);
    setStep(0);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    if (submitter?.dataset.action !== 'save' && step < REVIEW_STEP) {
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
    if (values.mood !== undefined && provenance.mood === 'user_entered') {
      captureForSubmit.mood = {
        capturedAtUtc: new Date().toISOString(),
        source: 'self_report',
        status: 'accepted',
        ...(!isManualMoodOverride ? { signalQuality: moodAssessment.isComplete ? 1.0 : 0.6 } : {}),
        algorithm: voiceMoodSuggested ? 'Crew-reviewed mood suggestion from self-report' : isManualMoodOverride ? 'Manual self-report' : 'NASA CHRA-M-04 standardized 6-question MCQ scoring engine',
        device: 'crew terminal',
        synthetic: false,
      };
    }
    try {
      const hasExtras = METRIC_IDS.some(metric => METRICS[metric].optional && values[metric] !== undefined)
        || EXTRA_SYMPTOMS.some(({ id }) => symptomIds.includes(id));
      onSubmit({
        values, symptomIds, note: note.trim(), provenance, capture: captureForSubmit,
        assessmentScope: hasExtras ? 'extended' : 'core',
      });
      clearForm();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this check-in. Try again.');
    }
  }

  function readingField(metric: MetricId) {
    const metadata = METRICS[metric];
    const id = `reading-${metric}`;
    const label = PLAIN_FIELD_LABEL[metric] ?? metadata.label;
    const isSynthetic = prefilled.includes(metric);
    const cameraCapture = capture[metric]?.source === 'camera_estimate' || capture[metric]?.source === 'microphone_estimate' ? capture[metric] : undefined;
    const captureName = capture[metric]?.source === 'microphone_estimate' ? 'Microphone estimate' : 'Camera estimate';
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
            <select
              {...fieldProps}
              onChange={event => {
                setIsManualMoodOverride(true);
                edit(metric, event.target.value);
              }}
            >
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
              placeholder="Not measured"
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
            title={`${cameraCapture.algorithm ?? captureName} · captured ${cameraCapture.capturedAtUtc ?? 'during this session'}`}
          >
            {captureName} · quality {Math.round((cameraCapture.signalQuality ?? 0) * 100)}%
          </span>
        )}
        {errors[metric] && (
          <span className="reading-error" id={`${id}-error`} role="alert">{errors[metric]}</span>
        )}
      </div>
    );
  }

  function symptomOption({ id, label }: { id: string; label: string }) {
    return (
      <label key={id} className="symptom-option" htmlFor={`symptom-${id}`}>
        <input id={`symptom-${id}`} type="checkbox" value={id} checked={symptomIds.includes(id)}
          onChange={({ target: { checked } }) => setSymptomIds(previous => checked
            ? [...previous, id]
            : previous.filter(value => value !== id))} />
        {label}
      </label>
    );
  }

  const noteField = (
    <>
      <label className="checkin-note-label" htmlFor="checkin-note">Anything else? <span>Optional</span></label>
      <textarea id="checkin-note" rows={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
    </>
  );
  const current = STEPS[step];
  const progress = Math.round(((step + 1) / STEPS.length) * 100);
  const displayValue = (metric: MetricId) => {
    const raw = draft[metric]?.trim();
    if (!raw) return null;
    if (metric === 'mood') {
      const choice = moodChoices[Number(raw) - 1] ?? raw;
      const mcqSuffix = moodAssessment.rawMean !== null ? ` (MCQ: ${moodAssessment.rawMean}/5)` : '';
      return `${choice}${mcqSuffix}`;
    }
    return `${raw} ${METRICS[metric].unitLabel}`;
  };

  return (
    <>
      <header className="page-intro checkin-intro">
        <div>
          <h1>Check-in</h1>
          <p className="muted">Sol {sol} · {profile.displayName}. 8-step guided health check-in.</p>
        </div>
        <div className="checkin-intro-actions">
          {profile.isSynthetic && <span className="badge badge-synthetic">Synthetic crew profile</span>}
          {demoPrefill && (
            <button className="button button-sm button-secondary" type="button" onClick={fillDemo}>
              Fill demo readings
            </button>
          )}
          <span className="badge badge-subtle" style={{ fontSize: '0.85rem' }}>
            Page {step + 1} of {STEPS.length}
          </span>
        </div>
      </header>

      <form ref={formRef} className="checkin-wizard" noValidate onSubmit={submit}>
        <nav className="wizard-progress" aria-label="Check-in steps">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 4px' }}>
            <p className="wizard-progress-label" style={{ margin: 0 }}>
              Page <strong>{step + 1}</strong> of <strong>{STEPS.length}</strong> · <strong>{current.title}</strong>
            </p>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'var(--mono)' }}>
              {progress}%
            </span>
          </div>
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
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
              <h2 id={`step-title-${item.id}`} ref={index === step ? stepHeading : undefined} tabIndex={-1}>{item.title}</h2>
              <span className="badge badge-subtle" style={{ fontSize: '0.85rem' }}>Page {index + 1} of {STEPS.length}</span>
            </div>
            <p className="wizard-intro">{item.intro}</p>

            {/* Page 1: Heart rate */}
            {item.id === 'heart' && (
              <fieldset className="checkin-metric">
                <legend className="sr-only">Heart rate</legend>
                <div className="reading-field">
                  {readingField('heart_rate')}
                </div>
                {index === step && (
                  <CameraPulseCheck onAcceptEstimate={acceptCameraEstimate} />
                )}
                {capture.heart_rate?.source === 'camera_estimate' && (
                  <p className="checkin-capture-note">
                    ✓ Heart rate captured from camera. Typing a new number replaces it with manual entry.
                  </p>
                )}
                <MeasurementGuide metric="heart_rate" label="Heart rate" />
              </fieldset>
            )}

            {/* Page 2: Breathing & HRV */}
            {item.id === 'breath' && (
              <fieldset className="checkin-metric">
                <legend className="sr-only">Breathing and HRV</legend>
                <div className="pressure-grid">
                  {readingField('respiratory_rate')}
                  {readingField('hrv_rmssd')}
                </div>
                {index === step && (
                  <CameraPulseCheck mode="breathing" onAcceptVitals={acceptCameraVitals} />
                )}
                {(capture.respiratory_rate?.source === 'camera_estimate' || capture.hrv_rmssd?.source === 'camera_estimate') && (
                  <p className="checkin-capture-note">
                    ✓ Vitals captured from camera. Typing a new number replaces it with manual entry.
                  </p>
                )}
                <MeasurementGuide metric="respiratory_rate" label="Breathing rate" />
              </fieldset>
            )}

            {/* Page 3: Blood pressure & stand-up test */}
            {item.id === 'pressure' && (
              <fieldset className="checkin-metric">
                <legend className="sr-only">Blood pressure</legend>
                <div className="pressure-grid">
                  {readingField('bp_systolic')}
                  {readingField('bp_diastolic')}
                </div>
                <MeasurementGuide metric="bp_systolic" label="Blood pressure" />

                <details className="checkin-extra-symptoms" style={{ marginTop: '1.2rem' }} open={Boolean(draft.bp_systolic_standing || draft.bp_diastolic_standing || draft.heart_rate_standing) || undefined}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--accent)' }}>Optional: Stand-up (orthostatic) test</summary>
                  <p className="wizard-intro" style={{ margin: '0.4rem 0 0.8rem', fontSize: '0.88rem' }}>
                    Stand up for 3 minutes, then re-measure blood pressure and pulse to test cardiovascular adaptation to gravity.
                  </p>
                  <div className="pressure-grid">
                    {readingField('bp_systolic_standing')}
                    {readingField('bp_diastolic_standing')}
                    {readingField('heart_rate_standing')}
                  </div>
                </details>
              </fieldset>
            )}

            {/* Page 4: Temperature & Sugar */}
            {item.id === 'temp_sugar' && (
              <fieldset className="checkin-metric">
                <legend className="sr-only">Temperature and Blood Sugar</legend>
                <div className="pressure-grid">
                  <div>
                    {readingField('body_temp')}
                    <MeasurementGuide metric="body_temp" label="Body temperature" />
                  </div>
                  <div>
                    {readingField('blood_glucose')}
                    <MeasurementGuide metric="blood_glucose" label="Blood sugar" />
                  </div>
                </div>
              </fieldset>
            )}

            {/* Page 5: Sleep */}
            {item.id === 'sleep' && (
              <fieldset className="checkin-metric">
                <legend className="sr-only">Sleep</legend>
                <div className="reading-field">
                  {readingField('sleep_duration')}
                </div>
                <MeasurementGuide metric="sleep_duration" label="Sleep duration" />
              </fieldset>
            )}

            {/* Page 6: Mood */}
            {item.id === 'mood' && (
              <div className="checkin-metric">
                <div className="mood-mcq-container">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '0.4rem' }}>
                    <p className="wizard-intro" style={{ margin: 0 }}>
                      Standardized Crew Psychological &amp; Behavioral Assessment (6 questions)
                    </p>
                    <span className={`badge ${moodAssessment.isComplete ? 'badge-steady' : 'badge-subtle'}`}>
                      {moodAssessment.isComplete ? '6 of 6 answered' : `${Object.keys(mcqAnswers).length} of 6 answered`}
                    </span>
                  </div>

                  {MOOD_QUESTIONS.map(q => {
                    const selectedScore = mcqAnswers[q.id];
                    return (
                      <fieldset key={q.id} className="mood-question-card">
                        <legend className="sr-only">Question {q.number}: {q.title}</legend>
                        <div className="mood-question-header">
                          <span className="mood-q-badge">Q{q.number}</span>
                          <h3>{q.title}</h3>
                        </div>
                        <p className="mood-question-prompt">{q.prompt}</p>

                        <div className="mood-options-list" role="radiogroup" aria-label={`Options for ${q.title}`}>
                          {q.options.map(option => {
                            const isSelected = selectedScore === option.score;
                            return (
                              <button
                                key={option.score}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                className={`mood-option-item${isSelected ? ' is-selected' : ''}`}
                                onClick={() => handleSelectMcq(q.id, option.score)}
                              >
                                <span className="mood-option-score">{option.score}</span>
                                <span className="mood-option-label">{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                    );
                  })}

                  {/* Clinical Scoring & Cross-Metric Evaluation Panel */}
                  <div className="mood-evaluation-panel" aria-live="polite">
                    <div className="mood-eval-header">
                      <h3 className="mood-eval-title">
                        <span>Clinical Scoring &amp; Cross-Metric Engine</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>(NASA CHRA-M-04)</span>
                      </h3>
                      <span className={`badge ${moodAssessment.isProvisional ? 'badge-warning' : 'badge-steady'}`}>
                        {moodAssessment.isProvisional ? 'Provisional (Incomplete Data)' : 'Validated Assessment'}
                      </span>
                    </div>

                    <div className="mood-scores-summary">
                      <div className="mood-score-box">
                        <span className="mood-score-box-label">Step 1: Base MCQ</span>
                        <span className="mood-score-box-value">
                          {moodAssessment.rawMean !== null ? `${moodAssessment.rawMean} / 5` : '—'}
                        </span>
                        <span className="mood-score-box-sub">
                          {moodAssessment.baseClassification || 'Pending answers'}
                        </span>
                      </div>

                      <div className="mood-score-box">
                        <span className="mood-score-box-label">Step 2: Adjusted Score</span>
                        <span className="mood-score-box-value" style={{ color: 'var(--accent)' }}>
                          {moodAssessment.adjustedScore !== null ? `${moodAssessment.adjustedScore} / 5` : '—'}
                        </span>
                        <span className="mood-score-box-sub">
                          {moodAssessment.modifiers.length > 0 ? `${moodAssessment.modifiers.length} clinical adjustment(s)` : 'No cross-metric penalty'}
                        </span>
                      </div>

                      <div className="mood-score-box">
                        <span className="mood-score-box-label">Final Integer Grade</span>
                        <span className="mood-score-box-value" style={{ color: 'var(--status-steady)' }}>
                          {moodAssessment.finalIntegerScore !== null ? `${moodAssessment.finalIntegerScore} / 5` : '—'}
                        </span>
                        <span className="mood-score-box-sub">
                          {moodAssessment.finalClassification || 'Synced to log'}
                        </span>
                      </div>
                    </div>

                    <div className="mood-modifiers-section">
                      <h4 className="mood-modifiers-heading">Clinical Cross-Metric Rules</h4>
                      {moodAssessment.modifiers.length > 0 ? (
                        <div className="mood-modifiers-list">
                          {moodAssessment.modifiers.map(mod => (
                            <div
                              key={mod.ruleId}
                              className={`mood-modifier-badge${mod.ruleId === 'urgent-symptoms' ? ' is-critical' : mod.cmoReview ? ' is-cmo' : ''}`}
                            >
                              <div>
                                <strong>{mod.name}:</strong> {mod.adjustmentDescription}
                                {mod.cmoReview && (
                                  <span style={{ display: 'block', fontSize: '0.8rem', marginTop: '2px', fontWeight: 600 }}>
                                    ⚠ Flagged for Flight Surgeon / CMO Review
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mood-clean-note">
                          ✓ No cross-metric risk factors detected. Standard psychosocial baseline applied.
                        </p>
                      )}
                    </div>
                  </div>

                  {errors.mood && (
                    <span className="reading-error" role="alert" style={{ display: 'block', marginTop: '0.5rem' }}>
                      {errors.mood}
                    </span>
                  )}

                  {/* Direct Override / Manual Sync details */}
                  <details style={{ marginTop: '0.6rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Direct reading override / quick select
                    </summary>
                    <div style={{ marginTop: '0.6rem' }}>
                      {readingField('mood')}
                    </div>
                  </details>

                  <MeasurementGuide metric="mood" label="Mood" />

                  <fieldset className="checkin-metric mic-voice-section">
                    <legend>Optional: voice check</legend>
                    <p className="wizard-intro">
                      Read the same short passage aloud each sol. Sol Check compares your pitch movement, speaking pace and pauses with your own usual.
                    </p>
                    {index === step && (
                      <MicCheck mode="voice" onAccept={reading => acceptMicReading(reading)} />
                    )}
                    {capture.voice_pitch_variability?.source === 'microphone_estimate' && (
                      <p className="checkin-capture-note">
                        ✓ Voice markers captured. Typing a new number replaces it with manual entry.
                      </p>
                    )}
                    <div className="pressure-grid">
                      {readingField('voice_pitch_variability')}
                      {readingField('voice_articulation_rate')}
                      {readingField('voice_pause_ratio')}
                    </div>
                    <MeasurementGuide metric="voice_pitch_variability" label="Voice check" />
                  </fieldset>
                </div>
              </div>
            )}

            {/* Page 7: How you feel & Activity */}
            {item.id === 'feel' && (
              <div className="checkin-context">
                <fieldset className="checkin-metric" style={{ marginBottom: '1.2rem', padding: '0.8rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)' }}>
                  <legend style={{ fontWeight: 650, color: 'var(--text-primary)', padding: '0 4px' }}>Daily Countermeasures &amp; Nutrition</legend>
                  <div className="pressure-grid" style={{ marginTop: '0.4rem' }}>
                    {readingField('fluid_intake')}
                    {readingField('exercise_minutes')}
                    {readingField('calorie_intake')}
                    {readingField('body_mass')}
                  </div>
                </fieldset>

                <h3 style={{ margin: '1rem 0 0.5rem', fontSize: '1.15rem' }}>Symptoms</h3>
                {SYMPTOM_GROUPS.map(group => (
                  <fieldset className="symptom-group" key={group.title}>
                    <legend>{group.title}</legend>
                    <div className="symptom-list">
                      {SYMPTOM_OPTIONS.filter(symptom => group.ids.includes(symptom.id)).map(symptomOption)}
                    </div>
                  </fieldset>
                ))}
                {noteField}
              </div>
            )}

            {/* Page 8: Review & save */}
            {item.id === 'review' && (
              <dl className="review-list">
                {voiceMoodSuggested && (
                  <div><dt>Mood suggestion</dt><dd>Sol suggested this rating from what you said. Confirm it before saving.</dd></div>
                )}
                {STEPS.filter(page => page.metrics.length > 0).map(page => (
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
                  <dt>Symptoms &amp; Notes</dt>
                  <dd>
                    {symptomIds.length
                      ? SYMPTOM_OPTIONS.filter(option => symptomIds.includes(option.id)).map(option => option.label).join(', ')
                      : <span className="muted">No symptoms reported</span>}
                    {note.trim() && <span className="review-note">Note: {note.trim()}</span>}
                  </dd>
                  <button type="button" className="button button-sm button-ghost" onClick={() => goTo(FEEL_STEP)}>
                    <Pencil size={14} aria-hidden="true" /> Edit<span className="sr-only"> symptoms and notes</span>
                  </button>
                </div>
              </dl>
            )}
          </section>
        ))}

        <div className="wizard-nav">
          {Object.keys(errors).length > 0 && <p className="reading-error">Please check the highlighted readings above.</p>}
          {saveError && <p className="reading-error" role="alert">{saveError}</p>}
          <div className="wizard-nav-buttons">
            <button className="button button-secondary" type="button" onClick={() => goTo(step - 1)} disabled={step === 0}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            {step < REVIEW_STEP && (
              <button className="button button-ghost" type="button" onClick={skip} aria-label="Skip, not measured today">Skip</button>
            )}
            {step < REVIEW_STEP ? (
              <button className="button button-primary" type="submit" data-action="next">
                {step === REVIEW_STEP - 1 ? 'Review entries' : 'Next'} <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button className="button button-primary" type="submit" data-action="save" style={{ fontWeight: 700, padding: '0.65rem 1.4rem' }}>
                <Check size={18} aria-hidden="true" /> Save and assess check-in
              </button>
            )}
          </div>
        </div>
      </form>
    </>
  );
}
