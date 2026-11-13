import { useRef, useState, type FormEvent } from 'react';
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
import { CameraPulseCheck } from './CameraPulseCheck';
import type { CameraPulseEstimate } from './pulseQuality';
import './checkin.css';

interface CheckinProps {
  sol: number;
  profile: AstronautProfile;
  demoPrefill: CheckinEntry['values'];
  initialEntry?: CheckinEntry;
  onSubmit: (entry: CheckinEntry) => void;
}

const groups = [
  ['heart_rate'],
  ['bp_systolic', 'bp_diastolic'],
  ['body_temp'],
  ['blood_glucose'],
  ['sleep_duration'],
  ['mood'],
] as const satisfies readonly (readonly MetricId[])[];

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
      <p>{guide.text}</p>
      {source && (source.url
        ? <a href={source.url} target="_blank" rel="noreferrer">{source.publisher} reference ↗</a>
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
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError('');
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
        issues.bp_systolic = 'Enter systolic pressure to complete the pair.';
      } else if (diastolic === undefined && systolic !== undefined) {
        issues.bp_diastolic = 'Enter diastolic pressure to complete the pair.';
      } else if (systolic !== undefined && diastolic !== undefined && systolic <= diastolic) {
        issues.bp_systolic = 'Systolic pressure must be greater than diastolic pressure.';
      }
    }

    const firstError = METRIC_IDS.find(metric => issues[metric]);
    setErrors(issues);
    if (firstError) {
      formRef.current?.querySelector<HTMLElement>(`#reading-${firstError}`)?.focus();
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
    const label = metric === 'bp_systolic' ? 'Systolic'
      : metric === 'bp_diastolic' ? 'Diastolic' : metadata.label;
    const isSynthetic = prefilled.includes(metric);
    const cameraCapture = capture[metric]?.source === 'camera_estimate' ? capture[metric] : undefined;
    const descriptions = [`${id}-unit`];
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

  return (
    <>
      <header className="page-intro checkin-intro">
        <div>
          <p className="eyebrow">Sol {sol} · Daily log</p>
          <h1>Check-in</h1>
          <p className="muted">Record your measurements for {profile.displayName}. Blank readings stay unmeasured.</p>
        </div>
        {profile.isSynthetic && <span className="badge badge-synthetic">Synthetic crew profile</span>}
      </header>

      <form ref={formRef} className="checkin-layout" noValidate onSubmit={submit}>
        <section className="panel checkin-readings" aria-labelledby="checkin-readings-title">
          <div className="checkin-panel-heading">
            <h2 id="checkin-readings-title">Measurements</h2>
            <button className="button button-secondary" type="button" onClick={fillDemo}>
              Fill demo readings
            </button>
          </div>
          <p className="checkin-demo-status" aria-live="polite">
            {prefilled.length > 0 && 'Synthetic readings loaded. Edited readings are marked as user-entered.'}
          </p>
          <div className="checkin-metric-grid">
            {groups.map(group => (
              <fieldset className="checkin-metric" key={group[0]}>
                {group.length > 1 && <legend>Blood pressure</legend>}
                <div className={group.length > 1 ? 'pressure-grid' : undefined}>
                  {group.map(readingField)}
                </div>
                {group[0] === 'heart_rate' && (
                  <CameraPulseCheck onAcceptEstimate={acceptCameraEstimate} />
                )}
                {group[0] === 'heart_rate' && capture.heart_rate?.source === 'camera_estimate' && (
                  <p className="checkin-capture-note">
                    This value came from the optional camera estimate. Typing a new value clears the camera
                    attribution and records it as manual entry.
                  </p>
                )}
                <MeasurementGuide metric={group[0]} label={group.length > 1 ? 'blood pressure' : METRICS[group[0]].label} />
              </fieldset>
            ))}
          </div>
        </section>

        <section className="panel checkin-context" aria-labelledby="checkin-context-title">
          <h2 id="checkin-context-title">Symptoms</h2>
          <p className="muted">Select any symptoms you noticed this sol.</p>
          <div className="symptom-list">
            {SYMPTOM_OPTIONS.map(symptom => (
              <label key={symptom.id} className="symptom-option">
                <input
                  type="checkbox"
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
          <label className="checkin-note-label" htmlFor="checkin-note">Note <span>Optional</span></label>
          <textarea id="checkin-note" rows={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
        </section>

        <div className="checkin-actions">
          {Object.keys(errors).length > 0 && <p className="reading-error">Recheck the original measurements and units before saving.</p>}
          {saveError && <p className="reading-error" role="alert">{saveError}</p>}
          <button className="button button-primary" type="submit">Save and assess <span aria-hidden="true">→</span></button>
        </div>
      </form>
    </>
  );
}
