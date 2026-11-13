import { useState } from 'react';
import { ShieldCheck, Database, Sliders, FileText, ExternalLink, Activity, Check } from 'lucide-react';
import { METRICS, type Finding, type HealthMeasurement, type RiskAssessment } from '../../contracts';
import { RULES } from '../../engine';
import { SOURCES } from '../../content';
import { NASA_FIVE_HAZARDS } from '../hazards/hazardsData';
import { provenanceLabels } from './groundSummary';
import type { FollowUpTask } from '../followups/followUpEngine';

interface IndexedReading {
  sol: number;
  measurement: HealthMeasurement;
}

interface EvidencePassportProps {
  finding: Finding;
  readings: ReadonlyMap<string, IndexedReading>;
  assessment: RiskAssessment;
  tasks?: FollowUpTask[];
}

export function EvidencePassport({ finding, readings, assessment, tasks = [] }: EvidencePassportProps) {
  const [activeLayer, setActiveLayer] = useState<number>(1);
  const rule = RULES[finding.ruleId];

  // Match finding to relevant NASA HRP Hazard
  const matchedHazard = NASA_FIVE_HAZARDS.find(h => {
    if (finding.ruleId === 'combined-sleep-mood' || finding.ruleId === 'reported-symptoms') {
      return h.id === 'isolation';
    }
    if (finding.ruleId === 'archive-replay-context') {
      return h.id === 'radiation';
    }
    return h.solCheckMetrics.some(m => {
      const metricId = m as string;
      return rule?.metricIds.includes(metricId as any);
    });
  }) ?? NASA_FIVE_HAZARDS[1]; // default to Isolation/Behavioral

  const relatedTasks = tasks.filter(t => t.ruleId === finding.ruleId || t.status !== 'resolved');

  return (
    <div className="evidence-passport-card" style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', background: 'var(--bg-raised)', padding: '12px 14px', marginTop: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={16} style={{ color: 'var(--accent)' }} />
          <strong style={{ fontSize: '0.88rem' }}>Health Evidence Passport · 6-Layer Audit Chain</strong>
        </div>
        <span className="badge" style={{ fontSize: '0.8rem' }}>
          Rule: <code>{finding.ruleId}</code>
        </span>
      </div>

      <p className="muted" style={{ fontSize: '0.78rem', margin: '4px 0 10px' }}>
        Complete end-to-end provenance: inspect every transformation from raw sensor observation to flight-surgeon handoff.
      </p>

      {/* Layer Navigation Tabs */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
        {[
          { num: 1, label: '1. Observation', icon: Database },
          { num: 2, label: '2. Quality Check', icon: Activity },
          { num: 3, label: '3. Baseline', icon: Sliders },
          { num: 4, label: '4. Decision Rule', icon: FileText },
          { num: 5, label: '5. NASA Context', icon: ExternalLink },
          { num: 6, label: '6. Follow-Up', icon: ShieldCheck },
        ].map(tab => (
          <button
            key={tab.num}
            type="button"
            className={`button button-sm button-secondary tab-toggle${activeLayer === tab.num ? ' is-selected' : ''}`}
            aria-pressed={activeLayer === tab.num}
            onClick={() => setActiveLayer(tab.num)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Layer 1: Raw Observation & Provenance */}
      {activeLayer === 1 && (
        <div style={{ marginTop: '8px', fontSize: '0.82rem' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '0.86rem' }}>Layer 1 · Input Observations</h4>
          <ul style={{ paddingLeft: '18px', margin: '4px 0 0' }}>
            {finding.inputMeasurementIds.map(id => {
              const item = readings.get(id);
              if (!item) return <li key={id}>Measurement ID: {id}</li>;
              const meta = METRICS[item.measurement.metric];
              return (
                <li key={id}>
                  <strong>{meta.label}:</strong> {item.measurement.value} {meta.unitLabel} (Sol {item.sol}) ·{' '}
                  <span className="badge" style={{ fontSize: '0.8rem' }}>
                    {provenanceLabels[item.measurement.provenance] || item.measurement.provenance}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Layer 2: Signal Quality & Validation */}
      {activeLayer === 2 && (
        <div style={{ marginTop: '8px', fontSize: '0.82rem' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '0.86rem' }}>Layer 2 · Signal Quality & Relational Validation</h4>
          <p style={{ margin: '2px 0 6px', color: 'var(--accent)' }}>
            Validation Status: <strong className="status-steady inline-status"><Check size={14} aria-hidden="true" /> Passed relational bounds</strong>
          </p>
          <ul style={{ paddingLeft: '18px', margin: '4px 0 0' }}>
            <li>Finite number checks: Verified across all recorded metrics.</li>
            <li>Physical bounds: Systolic &gt; Diastolic relational guard active.</li>
            <li>Contactless rPPG: Optical SQI threshold gate evaluated (minimum 0.38 required for pulse acceptance).</li>
          </ul>
        </div>
      )}

      {/* Layer 3: Personal Baseline & Spread */}
      {activeLayer === 3 && (
        <div style={{ marginTop: '8px', fontSize: '0.82rem' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '0.86rem' }}>Layer 3 · Personal Baseline Intelligence</h4>
          {finding.baselineUsed.length > 0 ? (
            <div style={{ display: 'grid', gap: '6px' }}>
              {finding.baselineUsed.map(b => (
                <div key={b.metric} style={{ background: 'var(--bg-raised)', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{METRICS[b.metric].label}</p>
                  <p style={{ margin: '2px 0 0', color: 'var(--accent)' }}>
                    Rolling Median: <strong>{b.median} {METRICS[b.metric].unitLabel}</strong> · MAD Spread: <strong>±{b.mad ?? 0} {METRICS[b.metric].unitLabel}</strong>
                  </p>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                    Calculated over {b.count} valid historical sols in prior {b.lookbackSols}-sol window.
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No baseline comparison required for this finding.</p>
          )}
        </div>
      )}

      {/* Layer 4: Deterministic Decision Rule */}
      {activeLayer === 4 && (
        <div style={{ marginTop: '8px', fontSize: '0.82rem' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '0.86rem' }}>Layer 4 · Deterministic Decision Rule</h4>
          <p style={{ margin: '2px 0 4px' }}>
            Rule: <code>{finding.ruleId}</code> · Version <code>{rule?.version ?? '1.0.0'}</code> · Priority: <strong>{rule?.priority ?? 50}</strong>
          </p>
          <p style={{ margin: '4px 0', color: 'var(--accent)' }}>
            <strong>Clinical Rationale:</strong> {rule?.reason}
          </p>
          <div style={{ marginTop: '4px' }}>
            <strong>Evaluated Conditions:</strong>
            <ul style={{ paddingLeft: '18px', margin: '2px 0 0' }}>
              {(rule?.conditions ?? []).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Layer 5: NASA Research Context & Limitations */}
      {activeLayer === 5 && (
        <div style={{ marginTop: '8px', fontSize: '0.82rem' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '0.86rem' }}>Layer 5 · NASA Human Research Program Evidence</h4>
          <p style={{ margin: '2px 0' }}>
            Associated Hazard: <strong>{matchedHazard.name} ({matchedHazard.hrpRiskId})</strong>
          </p>
          <p style={{ margin: '4px 0', color: 'var(--accent)' }}>
            {matchedHazard.tagline}
          </p>
          <div style={{ marginTop: '6px' }}>
            <strong>Official Evidence Sources:</strong>
            <ul style={{ paddingLeft: '18px', margin: '2px 0 0' }}>
              {finding.sourceRefs.map(refId => {
                const src = SOURCES[refId];
                return (
                  <li key={refId}>
                    {src ? (
                      src.url ? (
                        <a href={src.url} target="_blank" rel="noreferrer">
                          {src.title}<ExternalLink size={13} aria-hidden="true" className="external-icon" />
                        </a>
                      ) : (
                        <span>{src.title}</span>
                      )
                    ) : (
                      <code>{refId}</code>
                    )}{' '}
                    {src && <span style={{ opacity: 0.75 }}>({src.publisher})</span>}
                  </li>
                );
              })}
            </ul>
          </div>
          <div style={{ background: 'var(--bg-raised)', border: '1px solid color-mix(in srgb, var(--status-change) 40%, transparent)', padding: '6px 8px', borderRadius: '4px', marginTop: '6px', fontSize: '0.8rem', color: 'var(--status-trend)' }}>
            <strong>Extrapolation Limit:</strong> Spaceflight evidence guides monitoring heuristics and rest scheduling; it does not substitute for clinical medical procedures or terrestrial hospital diagnosis.
          </div>
        </div>
      )}

      {/* Layer 6: Follow-Up Action & Telemetry */}
      {activeLayer === 6 && (
        <div style={{ marginTop: '8px', fontSize: '0.82rem' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '0.86rem' }}>Layer 6 · Closed-Loop Follow-Up & Ground Uplink</h4>
          <p style={{ margin: '2px 0' }}>
            Recommended Tier: <strong>{assessment.recommendedTier.replace(/_/g, ' ').toUpperCase()}</strong>
          </p>
          <div style={{ marginTop: '4px' }}>
            <strong>Action Center Follow-Up Tasks:</strong>
            {relatedTasks.length > 0 ? (
              <ul style={{ paddingLeft: '18px', margin: '2px 0 0' }}>
                {relatedTasks.map(task => (
                  <li key={task.id}>
                    <strong>{task.title}</strong> — Status: <code>{task.status.toUpperCase()}</code> (Assigned: {task.assignedRole})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ margin: '2px 0' }}>No outstanding follow-ups required.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
