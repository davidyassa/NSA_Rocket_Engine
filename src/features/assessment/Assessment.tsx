import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  METRICS,
  type DailyCheckin,
  type EscalationTier,
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
import { WhatIfSimulator } from './WhatIfSimulator';
import { HandoffSimulator } from './HandoffSimulator';
import { ORIGIN_META } from '../../ui/tokens';
import { generateMedicalHandoffPackage, formatMedicalHandoffMarkdown } from './medicalHandoff';
import { FollowUpCenter } from '../followups/FollowUpCenter';
import { useFollowUpStore } from '../followups/useFollowUpStore';
import type { FollowUpTask } from '../followups/followUpEngine';
import { EvidencePassport } from './EvidencePassport';
import { PLAIN_NEXT_STEP, plainFinding } from '../../content/plainLanguage';
import './assessment.css';

interface AssessmentProps {
  assessment: RiskAssessment | null;
  records: readonly DailyCheckin[];
  mission: MissionContext;
}

type IndexedReading = { sol: number; measurement: HealthMeasurement };

function MedicalHandoffSection({ record, assessment }: { record: DailyCheckin; assessment: RiskAssessment }) {
  const [downloadMsg, setDownloadMsg] = useState('');

  const pkg = generateMedicalHandoffPackage(record, assessment);

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
        Traceable clinical evidence package prepared autonomously under a simulated 20-minute one-way
        communication delay.
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

const tierLabels: Record<EscalationTier, string> = {
  self_care: 'Self-care',
  crew_medical_officer: 'Crew Medical Officer',
  ground_flight_surgeon: 'Ground Flight Surgeon',
};

const escalationSteps = [
  { tier: 'self_care', text: 'Record or verify your check-in.' },
  { tier: 'crew_medical_officer', text: 'Ask the onboard officer to review the check-in.' },
  { tier: 'ground_flight_surgeon', text: 'Prepare a ground summary if the officer requests one.' },
] as const satisfies readonly { tier: EscalationTier; text: string }[];

function ReadingTable({ ids, readings }: {
  ids: readonly string[];
  readings: ReadonlyMap<string, IndexedReading>;
}) {
  const inputs = [...new Set(ids)]
    .flatMap(id => {
      const reading = readings.get(id);
      return reading ? [reading] : [];
    })
    .sort((first, second) => first.sol - second.sol);

  if (!inputs.length) return <p className="muted">Measurement inputs unavailable for this finding.</p>;
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

function FindingCard({ finding, readings, assessment, tasks }: {
  finding: Finding;
  readings: ReadonlyMap<string, IndexedReading>;
  assessment: RiskAssessment;
  tasks?: FollowUpTask[];
}) {
  const rule = RULES[finding.ruleId];
  return (
    <article className={`panel assessment-finding assessment-finding--${finding.kind}`}>
      <span className="badge assessment-kind">{findingLabels[finding.kind]}</span>
      <h3>{plainFinding(finding)}</h3>
      <p className="finding-technical"><span>Technical:</span> {finding.summary}</p>
      <details className="assessment-why">
        <summary aria-label={`Why this finding? ${finding.summary}`}>Why this finding?</summary>
        <div className="assessment-evidence">
          <dl className="assessment-rule">
            <div>
              <dt>Rule</dt>
              <dd><code>{finding.ruleId}</code>{rule && ` · v${rule.version}`}</dd>
            </div>
            <div>
              <dt>Review status</dt>
              <dd>{reviewLabels[finding.reviewStatus]}</dd>
            </div>
          </dl>
          {rule && <p>{rule.reason}</p>}
          {rule && rule.conditions.length > 0 && (
            <ul className="assessment-conditions">
              {rule.conditions.map(condition => <li key={condition}>{condition}</li>)}
            </ul>
          )}

          {finding.baselineUsed.length > 0 && (
            <>
              <h4>Personal baseline</h4>
              <ul className="assessment-baselines">
                {finding.baselineUsed.map(baseline => (
                  <li key={baseline.metric}>
                    <strong>{METRICS[baseline.metric].label}</strong>{' · '}
                    {baseline.median} {METRICS[baseline.metric].unitLabel} median ·{' '}
                    {baseline.count} readings over {baseline.lookbackSols} prior sols
                    <details className="assessment-baseline-readings">
                      <summary>Baseline readings for {METRICS[baseline.metric].label.toLowerCase()}</summary>
                      <ReadingTable ids={baseline.inputMeasurementIds} readings={readings} />
                    </details>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4>Readings used</h4>
          <ReadingTable ids={finding.inputMeasurementIds} readings={readings} />
          <h4>Evidence sources</h4>
          <EvidenceSources ids={finding.sourceRefs} />

          <EvidencePassport
            finding={finding}
            readings={readings}
            assessment={assessment}
            tasks={tasks}
          />
        </div>
      </details>
    </article>
  );
}

export function Assessment({ assessment, records, mission }: AssessmentProps) {
  const findingsHeading = useRef<HTMLHeadingElement>(null);
  const record = records.find(entry => entry.id === assessment?.checkinId);
  const readings = new Map<string, IndexedReading>();
  for (const entry of records) {
    for (const measurement of entry.measurements) {
      readings.set(measurement.id, { sol: entry.sol, measurement });
    }
  }
  const cards = assessment?.actionCardIds.flatMap(id => ACTION_CARDS[id] ? [ACTION_CARDS[id]] : []) ?? [];
  const symptoms = record?.symptoms.filter(symptom => symptom.present) ?? [];
  const warnings = assessment && !assessment.findings.some(finding => finding.kind === 'data_quality')
    ? assessment.dataQualityWarnings
    : [];

  const { tasks, syncWithAssessment, setTasks } = useFollowUpStore();

  useEffect(() => {
    if (record && assessment) {
      syncWithAssessment(record, assessment);
    }
  }, [record, assessment, syncWithAssessment]);

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

      {assessment && (
        <section className="panel plain-summary" aria-labelledby="plain-summary-title">
          <h2 id="plain-summary-title">{PLAIN_NEXT_STEP[assessment.recommendedTier].title}</h2>
          <p className="plain-summary-action">{PLAIN_NEXT_STEP[assessment.recommendedTier].action}</p>
          {assessment.findings.length > 0 ? (
            <ul className="plain-summary-list">
              {assessment.findings.map((finding, index) => (
                <li key={`${finding.ruleId}-${index}`}>{plainFinding(finding)}</li>
              ))}
            </ul>
          ) : (
            <p className="plain-summary-action">All the readings that could be compared look like your usual.</p>
          )}
          <p className="plain-summary-note">This is a helper, not a diagnosis. If you feel unwell, tell your crew medical officer whatever this page says.</p>
        </section>
      )}

      {record && (
        <GroundCommunication
          key={record.id}
          record={record}
          mission={mission}
          onReview={() => findingsHeading.current?.focus()}
        />
      )}

      {assessment ? (
        <>
          <div className="assessment-layout">
          <section className="assessment-findings" aria-labelledby="findings-title">
            <h2 id="findings-title" ref={findingsHeading} tabIndex={-1}>Findings</h2>
            {symptoms.length > 0 && (
              <p className="muted assessment-symptoms">
                Reported symptoms · {symptoms.map(symptom => symptom.label).join(', ')}
              </p>
            )}
            {warnings.length > 0 && (
              <ul className="panel assessment-warnings">
                {warnings.map(warning => <li key={warning}>{warning}</li>)}
              </ul>
            )}
            {assessment.findings.map((finding, index) => (
              <FindingCard
                key={`${finding.ruleId}-${index}`}
                finding={finding}
                readings={readings}
                assessment={assessment}
                tasks={tasks}
              />
            ))}
            {assessment.findings.length === 0 && (
              <p className="panel assessment-empty">No change detected in the readings that could be compared.</p>
            )}
          </section>

          <section className="assessment-actions" aria-labelledby="assessment-actions-title">
            <h2 id="assessment-actions-title">Next steps</h2>
            <div className="panel assessment-action">
              <h3>Suggested route: {tierLabels[assessment.recommendedTier]}</h3>
              <ol className="assessment-ladder" role="list" aria-label="Escalation ladder">
                {escalationSteps.map(({ tier, text }) => (
                  <li key={tier} aria-current={tier === assessment.recommendedTier ? 'step' : undefined}>
                    <strong>{tierLabels[tier]}</strong>
                    <span>{text}</span>
                  </li>
                ))}
              </ol>
            </div>
            {record && <MedicalHandoffSection record={record} assessment={assessment} />}
            {record && <WhatIfSimulator currentRecord={record} records={records} />}
            {cards.map(card => (
              <article className="panel assessment-action" key={card.id}>
                <h3>{card.title}</h3>
                <span className="badge action-card-status">{reviewLabels[card.reviewStatus]}</span>
                <ol>
                  {card.steps.map(step => <li key={step}>{step}</li>)}
                </ol>
                <details className="assessment-why">
                  <summary>Action sources</summary>
                  <EvidenceSources ids={card.sourceRefs} />
                </details>
              </article>
            ))}
            <p className="muted assessment-version">Rules engine {assessment.engineVersion}</p>
          </section>
        </div>

          {record && (
            <FollowUpCenter
              tasks={tasks}
              onTasksChange={setTasks}
              currentUserRole="astronaut"
            />
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
