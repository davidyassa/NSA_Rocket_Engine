import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  METRICS,
  type DailyCheckin,
  type Finding,
  type FindingKind,
  type HealthMeasurement,
  type MissionContext,
  type ReviewStatus,
  type RiskAssessment,
} from '../../contracts';
import { ACTION_CARDS } from '../../content';
import { RULES } from '../../engine';
import { EvidenceSources } from './EvidenceSources';
import { GroundCommunication } from './GroundCommunication';
import { HandoffSimulator } from './HandoffSimulator';
import { ORIGIN_META } from '../../ui/tokens';
import { generateMedicalHandoffPackage, formatMedicalHandoffMarkdown } from './medicalHandoff';
import { FollowUpCenter } from '../followups/FollowUpCenter';
import { tasksForScenario, useFollowUpStore } from '../followups/useFollowUpStore';
import { VigilanceReadings } from '../cognitive/VigilanceReadings';
import { sessionsForSol, type VigilanceSession } from '../cognitive/vigilance';
import type { ScenarioId } from '../../scenarios';
import { KitItemsList } from './KitItems';
import { PLAIN_NEXT_STEP, plainFinding } from '../../content/plainLanguage';
import './assessment.css';

interface AssessmentProps {
  assessment: RiskAssessment | null;
  records: readonly DailyCheckin[];
  mission: MissionContext;
  scenarioId: ScenarioId;
  vigilance: readonly VigilanceSession[];
}

type IndexedReading = { sol: number; measurement: HealthMeasurement };

function MedicalHandoffSection({ record, assessment, mission, vigilance }: {
  record: DailyCheckin; assessment: RiskAssessment; mission: MissionContext; vigilance: readonly VigilanceSession[];
}) {
  const [downloadMsg, setDownloadMsg] = useState('');

  const pkg = generateMedicalHandoffPackage(record, assessment, undefined, mission.oneWayDelayMinutes, undefined, vigilance);

  function downloadJson() {
    const jsonStr = JSON.stringify(pkg, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sol-check-flight-surgeon-handoff-sol-${record.sol}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadMsg(`Downloaded JSON package (Checksum: ${pkg.localDraft.checksum})`);
  }

  function downloadMarkdown() {
    const mdStr = formatMedicalHandoffMarkdown(pkg);
    const blob = new Blob([mdStr], { type: 'text/markdown; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sol-check-clinical-briefing-sol-${record.sol}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadMsg(`Downloaded Clinical Briefing Markdown`);
  }

  return (
    <div className="panel assessment-action">
      <h3>Evidence Passport & Flight Surgeon Handoff</h3>
      <p style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--text-secondary)', margin: '0.3rem 0 0.6rem' }}>
        Local evidence package for a simulated {mission.oneWayDelayMinutes}-minute one-way communication delay.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0' }}>
        <button type="button" className="button button-secondary" onClick={downloadJson}>
          Download handoff (JSON)
        </button>
        <button type="button" className="button button-secondary" onClick={downloadMarkdown}>
          Download briefing (MD)
        </button>
      </div>
      {downloadMsg && (
        <p className="muted" style={{ fontSize: '0.75rem', color: 'var(--status-steady)', marginTop: '0.2rem' }}>
          <Check size={14} aria-hidden="true" className="inline-icon" /> {downloadMsg}
        </p>
      )}
      <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.4rem' }}>
        <strong>Integrity Checksum:</strong> <code>{pkg.localDraft.checksum}</code> · Triage: <strong>{pkg.triageTier.toUpperCase()}</strong>
      </p>

      <HandoffSimulator pkg={pkg} />
    </div>
  );
}

const findingLabels: Record<FindingKind, string> = {
  observation: 'Observed',
  trend: 'Trend detected',
  contextual_association: 'Possible contextual association',
  data_quality: 'Check entry',
  data_unavailable: 'Data unavailable',
};

const reviewLabels: Record<ReviewStatus, string> = {
  sourced: 'Sourced',
  demo_heuristic: 'Demo heuristic',
  needs_clinical_review: 'Needs clinical review',
};

const hiddenActions = new Set(['record-and-monitor', 'crew-review', 'exercise-plan', 'co2-check']);
const previewLength = 4;

function ReadingTable({ inputs }: { inputs: readonly IndexedReading[] }) {
  return (
    <div className="assessment-table-wrap" tabIndex={0} role="region" aria-label="Recorded readings">
      <table className="assessment-table data-table">
        <thead>
          <tr><th scope="col">Sol</th><th scope="col">Indicator</th><th scope="col">Value</th><th scope="col">Origin</th></tr>
        </thead>
        <tbody>
          {inputs.map(({ sol, measurement }) => {
            const metric = METRICS[measurement.metric];
            return (
              <tr key={measurement.id}>
                <td className="num">{sol}</td>
                <th scope="row">{metric.label}</th>
                <td className="num">{measurement.value} {metric.unitLabel}</td>
                <td>
                  <span className={ORIGIN_META[measurement.provenance].className}>
                    {ORIGIN_META[measurement.provenance].label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FindingCard({ finding, readings }: { finding: Finding; readings: ReadonlyMap<string, IndexedReading> }) {
  const inputs = [...new Set(finding.inputMeasurementIds)]
    .flatMap((id) => {
      const reading = readings.get(id);
      return reading ? [reading] : [];
    })
    .sort((first, second) => second.sol - first.sol);
  const summary = finding.kind === 'data_unavailable' || finding.kind === 'data_quality'
    ? finding.summary : plainFinding(finding);
  const rule = RULES[finding.ruleId];

  return (
    <article className={`panel assessment-finding assessment-finding--${finding.kind}`}>
      <span className="badge assessment-kind">{findingLabels[finding.kind]}</span>
      <h3>{summary}</h3>
      {finding.baselineUsed.length > 0 && (
        <p className="assessment-baseline-preview">
          Personal baseline · {finding.baselineUsed.map(({ metric, median, count }) =>
            `${METRICS[metric].label} ${median} ${METRICS[metric].unitLabel} (${count} readings)`).join(' · ')}
        </p>
      )}
      {inputs.length > 0 && (
        <div className="assessment-reading-preview">
          <h4>Readings used</h4>
          <ReadingTable inputs={inputs.slice(0, previewLength)} />
          {inputs.length > previewLength && (
            <details className="assessment-why">
              <summary>Show {inputs.length - previewLength} more readings</summary>
              <ReadingTable inputs={inputs.slice(previewLength)} />
            </details>
          )}
        </div>
      )}
      <details className="assessment-why">
        <summary>Why this finding?</summary>
        <p><code>{finding.ruleId}</code> · {reviewLabels[finding.reviewStatus]}</p>
        {rule && (
          <>
            <p>{rule.reason}</p>
            <ul>{rule.conditions.map(condition => <li key={condition}>{condition}</li>)}</ul>
          </>
        )}
        <EvidenceSources ids={finding.sourceRefs} />
      </details>
    </article>
  );
}

export function Assessment({ assessment, records, mission, scenarioId, vigilance }: AssessmentProps) {
  const findingsHeading = useRef<HTMLHeadingElement>(null);
  const followUp = useRef<HTMLDetailsElement>(null);
  const [searchParams] = useSearchParams();
  const showFollowUp = searchParams.get('view') === 'follow-up';
  useEffect(() => {
    if (!showFollowUp || !followUp.current) return;
    const section = followUp.current;
    section.open = true;
    const frame = requestAnimationFrame(() => {
      section.querySelector('summary')?.focus({ preventScroll: true });
      section.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [showFollowUp, assessment?.checkinId]);
  const record = records.find(entry => entry.id === assessment?.checkinId);
  const readings = new Map<string, IndexedReading>();
  for (const entry of records) {
    for (const measurement of entry.measurements) {
      readings.set(measurement.id, { sol: entry.sol, measurement });
    }
  }
  const cards = assessment?.actionCardIds.flatMap(id => !hiddenActions.has(id) && ACTION_CARDS[id] ? [ACTION_CARDS[id]] : []) ?? [];
  const symptoms = record?.symptoms.filter(symptom => symptom.present) ?? [];
  const warnings = assessment && !assessment.findings.some(finding => finding.kind === 'data_quality')
    ? assessment.dataQualityWarnings
    : [];

  const { tasks: allTasks, setTasks } = useFollowUpStore();
  const tasks = tasksForScenario(allTasks, scenarioId);
  const groundReviewRequested = record && tasks.some(task => task.sol === record.sol
    && task.astronautId === record.astronautId && task.assignedRole === 'crew_medical_officer' && task.status === 'escalated');
  const reviewTier = groundReviewRequested ? 'ground_flight_surgeon' : assessment?.recommendedTier;
  const needsVigilance = assessment?.findings.some(({ ruleId }) => ruleId === 'combined-sleep-mood')
    || symptoms.some(({ id }) => id === 'fatigue');
  const vigilanceResults = record ? sessionsForSol(vigilance, record.sol) : [];

  return (
    <>
      <header className="page-intro assessment-intro">
        <h1>Assessment</h1>
        <p className="page-subtitle">{record ? `Results of your Sol ${record.sol} check-in` : 'Crew health log'}</p>
        <div className="assessment-notice">
          <span className="badge">Not a diagnosis</span>
          {record?.measurements.some(reading => reading.provenance === 'synthetic_demo') && (
            <span className="badge badge-synthetic">Includes synthetic readings</span>
          )}
        </div>
      </header>

      {assessment ? (
        <>
          <section className="assessment-findings" aria-labelledby="findings-title">
            <h2 id="findings-title" ref={findingsHeading} tabIndex={-1}>Findings</h2>
            {reviewTier && (
              <p className="assessment-review-note">{PLAIN_NEXT_STEP[reviewTier].title}</p>
            )}
            {symptoms.length > 0 && (
              <p className="muted assessment-symptoms">Reported symptoms · {symptoms.map(symptom => symptom.label).join(', ')}</p>
            )}
            {warnings.length > 0 && (
              <ul className="panel assessment-warnings">
                {warnings.map(warning => <li key={warning}>{warning}</li>)}
              </ul>
            )}
            {assessment.findings.map((finding, index) => (
              <FindingCard key={`${finding.ruleId}-${index}`} finding={finding} readings={readings} />
            ))}
            {assessment.findings.length === 0 && (
              <p className="panel assessment-empty">No change detected in the readings that could be compared.</p>
            )}
          </section>

          {record && (needsVigilance || vigilanceResults.length > 0) && (
            <div className="assessment-vigilance">
              {vigilanceResults.length > 0 && <VigilanceReadings sol={record.sol} history={vigilance} />}
              {needsVigilance && vigilanceResults.length === 0 && (
                <div className="panel cognitive-arena-card">
                  <h2>Vigilance check recommended</h2>
                  <p className="muted">Check reaction time and attention in Cognitive Lab.</p>
                  <Link to="/cognitive" className="text-link">Open Cognitive Lab</Link>
                </div>
              )}
              <Link to="/hazards/isolation" className="text-link">Open Hazard 2 and plan follow-up</Link>
            </div>
          )}

          {cards.length > 0 && (
            <details className="panel assessment-support">
              <summary>Suggested actions</summary>
              <div className="assessment-actions">
                {cards.map(card => (
                  <article className="assessment-action" key={card.id}>
                    <h3>{card.title}</h3>
                    <span className="badge action-card-status">{reviewLabels[card.reviewStatus]}</span>
                    <ol>{card.steps.map(step => <li key={step}>{step}</li>)}</ol>
                    {card.kitItemIds && record && (
                      <KitItemsList ids={card.kitItemIds} currentSol={record.sol} />
                    )}
                    <details className="assessment-why">
                      <summary>Action sources</summary>
                      <EvidenceSources ids={card.sourceRefs} />
                    </details>
                  </article>
                ))}
              </div>
            </details>
          )}

          {record && (
            <details ref={followUp} className="panel assessment-support">
              <summary className="assessment-handoff-toggle">Follow-up tasks and ground handoff</summary>
              <div className="assessment-actions">
                <FollowUpCenter tasks={tasks} onTasksChange={(next) => setTasks(next, scenarioId)} currentUserRole="astronaut" />
                <GroundCommunication key={record.id} record={record} mission={mission} vigilance={vigilanceResults}
                  onReview={() => findingsHeading.current?.focus()} />
                <MedicalHandoffSection record={record}
                  assessment={groundReviewRequested ? { ...assessment, recommendedTier: 'ground_flight_surgeon' } : assessment}
                  mission={mission} vigilance={vigilance} />
              </div>
            </details>
          )}
        </>
      ) : (
        <section className="panel assessment-empty">
          <h2>Check-in needed</h2>
          <p className="muted">Save a check-in to see its assessment here.</p>
          <Link className="button button-primary" to="/check-in">Go to check-in</Link>
        </section>
      )}
    </>
  );
}
