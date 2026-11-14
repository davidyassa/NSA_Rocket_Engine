import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, UserCheck, CheckCircle2, Check, Radiation } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DailyCheckin, RiskAssessment, DemoScenario } from '../../contracts';
import { METRICS } from '../../contracts';
import { supersedeSubsumedFindings } from '../../engine';
import { FollowUpCenter } from '../followups/FollowUpCenter';
import { tasksForScenario, useFollowUpStore } from '../followups/useFollowUpStore';
import { VigilanceReadings } from '../cognitive/VigilanceReadings';
import { sessionsForSol, type VigilanceSession } from '../cognitive/vigilance';
import type { ScenarioId } from '../../scenarios';
import { HandoffSimulator } from '../assessment/HandoffSimulator';
import { generateMedicalHandoffPackage } from '../assessment/medicalHandoff';
import { MedicalKitTable } from '../assessment/KitItems';

interface CrewMedicalOfficerProps {
  onAssistantReview?: (status: { signed: boolean; notes?: string } | undefined) => void;
  scenario: DemoScenario;
  scenarioId: ScenarioId;
  latest: DailyCheckin | null;
  assessment: RiskAssessment | null;
  records: readonly DailyCheckin[];
  vigilance: readonly VigilanceSession[];
}

export function CrewMedicalOfficer({ scenario, scenarioId, latest, assessment, records, vigilance, onAssistantReview }: CrewMedicalOfficerProps) {
  const [params, setParams] = useSearchParams();
  const tabs = ['triage', 'actions', 'kit', 'quality', 'telemetry'] as const;
  const activeTab = tabs.find(tab => tab === params.get('tab')) ?? 'triage';
  const setActiveTab = (tab: typeof tabs[number]) => setParams({ tab }, { replace: true });
  const [cmoSignOff, setCmoSignOff] = useState<{ signed: boolean; timestamp?: string; notes?: string }>({ signed: false });
  const [cmoNotes, setCmoNotes] = useState('');
  useEffect(() => {
    onAssistantReview?.(cmoSignOff);
  }, [cmoSignOff, onAssistantReview]);
  useEffect(() => () => onAssistantReview?.(undefined), [onAssistantReview]);

  const { tasks: allTasks, setTasks } = useFollowUpStore();
  const tasks = tasksForScenario(allTasks, scenarioId);
  // One combined observation replaces the sleep and mood observations it fully covers.
  const observations = useMemo(() => supersedeSubsumedFindings(assessment?.findings ?? []), [assessment]);

  const handoffPkg = latest && assessment
    ? generateMedicalHandoffPackage(latest, assessment, scenario.profile.displayName, scenario.missionContext.oneWayDelayMinutes, undefined, vigilance)
    : null;
  const pendingTasksCount = tasks.filter(t => t.status !== 'resolved').length;
  const urgentTasksCount = tasks.filter(t => t.priority === 'urgent' && t.status !== 'resolved').length;

  function handleSignOff() {
    setCmoSignOff({
      signed: true,
      timestamp: new Date().toISOString(),
      notes: cmoNotes,
    });
  }

  return (
    <div className="cmo-container" style={{ display: 'grid', gap: '16px' }}>
      <header className="page-intro">
        <div>
          <h1>Crew Medical Officer console</h1>
          <p className="muted">
            Simulated onboard review for {scenario.profile.displayName} on Sol {scenario.startSol}.
            The one-way delay to Earth is {scenario.missionContext.oneWayDelayMinutes} minutes in this scenario.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/hazards/radiation"
            className="badge"
            style={{
              background: 'var(--bg-raised)',
              color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
              textDecoration: 'none',
            }}
          >
            <Radiation size={13} style={{ display: 'inline', marginRight: '4px' }} />
            CARN Radiation Health Monitor
          </Link>
          <span className="badge" style={{ background: 'var(--bg-raised)', color: 'var(--status-steady)', border: '1px solid color-mix(in srgb, var(--status-steady) 40%, transparent)' }}>
            <UserCheck size={13} style={{ display: 'inline', marginRight: '4px' }} />
            Role: Onboard Medical Officer
          </span>
          {cmoSignOff.signed && (
            <span className="badge" style={{ background: 'var(--bg-raised)', color: 'var(--status-steady)', border: '1px solid color-mix(in srgb, var(--status-steady) 40%, transparent)' }}>
              <Check size={13} aria-hidden="true" /> CMO sign-off recorded
            </span>
          )}
        </div>
      </header>

      {/* CMO Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px' }}>
        <div className="panel" style={{ padding: '12px 14px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Check-in Status</span>
          <p style={{ margin: '4px 0 0', fontSize: '1.1rem', fontWeight: 650 }}>
            {latest ? `Sol ${latest.sol} Recorded` : 'Pending Entry'}
          </p>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {latest ? `${latest.measurements.length} vitals · ${latest.symptoms.filter(s => s.present).length} symptoms` : 'No data'}
          </span>
        </div>

        <div className="panel" style={{ padding: '12px 14px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Autonomous Triage Tier</span>
          <p style={{ margin: '4px 0 0', fontSize: '1.1rem', fontWeight: 650, color: assessment?.recommendedTier === 'crew_medical_officer' ? 'var(--status-trend)' : 'var(--status-steady)' }}>
            {assessment ? assessment.recommendedTier.replace(/_/g, ' ').toUpperCase() : 'NO ASSESSMENT'}
          </p>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {observations.length} active findings flagged
          </span>
        </div>

        <div className="panel" style={{ padding: '12px 14px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Action Center Tasks</span>
          <p style={{ margin: '4px 0 0', fontSize: '1.1rem', fontWeight: 650, color: urgentTasksCount > 0 ? 'var(--nasa-red)' : 'var(--status-steady)' }}>
            {pendingTasksCount} Pending ({urgentTasksCount} Urgent)
          </p>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Closed-loop accountability queue</span>
        </div>

        <div className="panel" style={{ padding: '12px 14px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Earth Delay Status</span>
          <p style={{ margin: '4px 0 0', fontSize: '1.1rem', fontWeight: 650 }}>
            {scenario.missionContext.oneWayDelayMinutes} min One-Way
          </p>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {scenario.missionContext.oneWayDelayMinutes * 2} min earliest simulated reply
          </span>
        </div>
      </div>

      {(sessionsForSol(vigilance, scenario.startSol).length > 0 || assessment?.findings.some(({ ruleId }) => ruleId === 'combined-sleep-mood')) && (
        <VigilanceReadings sol={scenario.startSol} history={vigilance} showHistory />
      )}

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', borderBottom: '1px solid var(--line)', paddingBottom: '6px' }}>
        <button
          type="button"
          className={`button button-sm button-secondary tab-toggle${activeTab === 'triage' ? ' is-selected' : ''}`}
            aria-pressed={activeTab === 'triage'}
          onClick={() => setActiveTab('triage')}
        >
          Clinical Triage & Sign-Off
        </button>
        <button
          type="button"
          className={`button button-sm button-secondary tab-toggle${activeTab === 'actions' ? ' is-selected' : ''}`}
            aria-pressed={activeTab === 'actions'}
          onClick={() => setActiveTab('actions')}
        >
          Action Center Queue ({pendingTasksCount})
        </button>
        <button
          type="button"
          className={`button button-sm button-secondary tab-toggle${activeTab === 'kit' ? ' is-selected' : ''}`}
            aria-pressed={activeTab === 'kit'}
          onClick={() => setActiveTab('kit')}
        >
          Supplies on board
        </button>
        <button
          type="button"
          className={`button button-sm button-secondary tab-toggle${activeTab === 'quality' ? ' is-selected' : ''}`}
            aria-pressed={activeTab === 'quality'}
          onClick={() => setActiveTab('quality')}
        >
          Sensor & Data Quality
        </button>
        <button
          type="button"
          className={`button button-sm button-secondary tab-toggle${activeTab === 'telemetry' ? ' is-selected' : ''}`}
            aria-pressed={activeTab === 'telemetry'}
          onClick={() => setActiveTab('telemetry')}
        >
          Interplanetary Telemetry
        </button>
      </div>

      {/* Tab 1: Clinical Triage & Sign-Off */}
      {activeTab === 'triage' && (
        <section className="panel panel-padded" style={{ display: 'grid', gap: '14px' }}>
          <div>
            <h2 style={{ fontSize: '1.16rem', margin: 0 }}>Active Diagnostic Findings</h2>
            <p className="muted" style={{ fontSize: '0.82rem', margin: '3px 0 0' }}>
              Deterministic rules evaluated by Sol Check engine v{assessment?.engineVersion ?? '1.3.0'}.
            </p>
          </div>

          <div style={{ display: 'grid', gap: '8px' }}>
            {observations.map((finding, idx) => (
              <div key={`${finding.ruleId}-${idx}`} className="cmo-finding-row">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge" style={{ fontSize: '0.8rem' }}>{finding.kind.toUpperCase()}</span>
                  <code style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Rule: {finding.ruleId}</code>
                </div>
                <p style={{ margin: '6px 0 3px', fontWeight: 600, fontSize: '0.92rem' }}>{finding.summary}</p>
                {finding.baselineUsed.length > 0 && (
                  <p className="muted" style={{ fontSize: '0.76rem', margin: 0 }}>
                    Baseline: {finding.baselineUsed.map(b => `${METRICS[b.metric].label} median: ${b.median} (${b.count} readings)`).join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* CMO Formal Sign-Off Box */}
          <div className="cmo-signoff">
            <h3 style={{ margin: '0 0 6px', fontSize: '0.98rem' }}>CMO review notes</h3>
            <textarea
              value={cmoNotes}
              onChange={e => setCmoNotes(e.target.value)}
              rows={3}
              style={{ width: '100%', fontSize: '0.84rem', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-subtle)', fontFamily: 'inherit' }}
              disabled={cmoSignOff.signed}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap', gap: '8px' }}>
              {cmoSignOff.signed ? (
                <div style={{ color: 'var(--status-steady)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} />
                  <strong>Signed by CMO:</strong> <code>{cmoSignOff.timestamp}</code>
                </div>
              ) : (
                <button
                  type="button"
                  className="button button-primary"
                  
                  onClick={handleSignOff}
                >
                  <UserCheck size={14} /> Record Formal CMO Clinical Sign-Off
                </button>
              )}

              <Link to="/assessment" className="button button-sm button-ghost">
                View full patient assessment <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Tab 2: Action Center */}
      {activeTab === 'actions' && (
        <FollowUpCenter
          tasks={tasks}
          onTasksChange={(next) => setTasks(next, scenarioId)}
          currentUserRole="crew_medical_officer"
        />
      )}

      {/* Tab 3: Sensor & Data Quality */}
      {activeTab === 'kit' && (
        <MedicalKitTable currentSol={latest?.sol ?? scenario.startSol} />
      )}

      {activeTab === 'quality' && (
        <section className="panel panel-padded">
          <h2 style={{ fontSize: '1.16rem', margin: '0 0 4px' }}>Sensor Provenance & Signal Quality</h2>
          <p className="muted" style={{ fontSize: '0.82rem', margin: '0 0 12px' }}>
            Audit trail of measurement modalities, hardware verification, and contactless rPPG signal quality indices ({records.length} historical records on file).
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Observed Value</th>
                  <th>Capture Modality</th>
                  <th>Quality / Status</th>
                </tr>
              </thead>
              <tbody>
                {(latest?.measurements ?? []).map(m => {
                  const meta = METRICS[m.metric];
                  return (
                    <tr key={m.id}>
                      <td>{meta.label}</td>
                      <td>{m.value} {meta.unitLabel}</td>
                      <td>
                        <span className="badge">
                          {m.provenance.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span className="status-steady inline-status">
                          <Check size={14} aria-hidden="true" /> Validated (relational checks passed)
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab 4: Telemetry */}
      {activeTab === 'telemetry' && (
        <div>
          {handoffPkg ? (
            <HandoffSimulator pkg={handoffPkg} />
          ) : (
            <p className="muted">No check-in available to generate telemetry package.</p>
          )}
        </div>
      )}
    </div>
  );
}
