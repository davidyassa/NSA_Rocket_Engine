import { useState } from 'react';
import { CheckCircle2, Clock, ArrowUpRight, Check } from 'lucide-react';
import type { FollowUpTask, FollowUpStatus } from './followUpEngine';
import { updateTaskStatus } from './followUpEngine';

interface FollowUpCenterProps {
  tasks: FollowUpTask[];
  onTasksChange: (tasks: FollowUpTask[]) => void;
  currentUserRole?: 'astronaut' | 'crew_medical_officer';
}

const priorityColors: Record<FollowUpTask['priority'], { bg: string; text: string }> = {
  urgent: { bg: 'var(--bg-raised)', text: 'var(--nasa-red)' },
  high: { bg: 'var(--tint-trend)', text: 'var(--status-trend)' },
  medium: { bg: 'var(--tint-change)', text: 'var(--status-trend)' },
  low: { bg: 'var(--bg-raised)', text: 'var(--accent)' },
};

const statusLabels: Record<FollowUpStatus, { label: string; tone: string }> = {
  open: { label: 'Open', tone: 'muted' },
  acknowledged: { label: 'Acknowledged', tone: 'watch' },
  in_progress: { label: 'In Progress', tone: 'watch' },
  awaiting_measurement: { label: 'Awaiting Measurement', tone: 'watch' },
  awaiting_medical_review: { label: 'Awaiting CMO Review', tone: 'urgent' },
  resolved: { label: 'Resolved', tone: 'steady' },
  escalated: { label: 'Ground review requested', tone: 'urgent' },
};

export function FollowUpCenter({ tasks, onTasksChange, currentUserRole = 'astronaut' }: FollowUpCenterProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('active');
  const [activeNoteTaskId, setActiveNoteTaskId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState<string>('');

  const filteredTasks = tasks.filter(t => {
    if (filter === 'active') return t.status !== 'resolved';
    if (filter === 'resolved') return t.status === 'resolved';
    return true;
  });

  function handleStatusChange(taskId: string, newStatus: FollowUpStatus, note?: string) {
    const actorName = currentUserRole === 'crew_medical_officer' ? 'Crew Medical Officer' : 'Astronaut (Self)';
    const updated = tasks.map(t => {
      if (t.id === taskId) {
        return updateTaskStatus(t, newStatus, actorName, note);
      }
      return t;
    });
    onTasksChange(updated);
    setActiveNoteTaskId(null);
    setNoteInput('');
  }

  return (
    <section className="panel panel-padded" style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h2 style={{ margin: '2px 0 0', fontSize: '1.25rem', fontWeight: 650 }}>Mission Health Action Center</h2>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.84rem' }}>
            Closed-loop tracking: Observation → Assessment → Action → Clinical Sign-Off.
          </p>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          <button
            type="button"
            className={`button button-sm button-secondary tab-toggle${filter === 'active' ? ' is-selected' : ''}`}
            aria-pressed={filter === 'active'}
            onClick={() => setFilter('active')}
          >
            Active ({tasks.filter(t => t.status !== 'resolved').length})
          </button>
          <button
            type="button"
            className={`button button-sm button-secondary tab-toggle${filter === 'resolved' ? ' is-selected' : ''}`}
            aria-pressed={filter === 'resolved'}
            onClick={() => setFilter('resolved')}
          >
            Resolved ({tasks.filter(t => t.status === 'resolved').length})
          </button>
          <button
            type="button"
            className={`button button-sm button-secondary tab-toggle${filter === 'all' ? ' is-selected' : ''}`}
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            All ({tasks.length})
          </button>
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <p className="muted" style={{ marginTop: '12px', fontSize: '0.88rem' }}>
          No {filter} follow-up tasks currently on record.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
          {filteredTasks.map(task => {
            const pColor = priorityColors[task.priority];
            const sInfo = statusLabels[task.status];
            const isResolved = task.status === 'resolved';

            return (
              <article
                key={task.id}
                className="followup-task"
                style={{ opacity: isResolved ? 0.85 : 1 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        background: pColor.bg,
                        color: pColor.text,
                      }}
                    >
                      {task.priority}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Assigned: <strong>{task.assignedRole.replace(/_/g, ' ')}</strong> · Sol {task.sol}
                    </span>
                  </div>

                  <span
                    className={`domain-status status-${sInfo.tone}`}
                    style={{ fontSize: '0.78rem', fontWeight: 600 }}
                  >
                    {isResolved ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                    {sInfo.label}
                  </span>
                </div>

                <h3 style={{ margin: '6px 0 3px', fontSize: '1rem', fontWeight: 650 }}>{task.title}</h3>
                <p style={{ margin: '0 0 6px', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{task.description}</p>
                <p className="muted" style={{ margin: '0 0 8px', fontSize: '0.75rem' }}>
                  <strong>Trigger Reason:</strong> {task.reason}
                </p>

                {task.notes && (
                  <div style={{ background: 'var(--bg-raised)', padding: '6px 8px', borderRadius: '4px', fontSize: '0.8rem', marginBottom: '8px' }}>
                    <strong>Clinical Note:</strong> {task.notes}
                  </div>
                )}

                {/* Action Buttons for non-resolved tasks */}
                {!isResolved && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {task.status !== 'acknowledged' && (
                      <button
                        type="button"
                        className="button button-sm button-secondary"
                        onClick={() => handleStatusChange(task.id, 'acknowledged')}
                      >
                        <Check size={12} /> Acknowledge
                      </button>
                    )}

                    <button
                      type="button"
                      className="button button-sm button-secondary"
                      onClick={() => {
                        if (activeNoteTaskId === task.id) {
                          handleStatusChange(task.id, 'resolved', noteInput);
                        } else {
                          setActiveNoteTaskId(task.id);
                        }
                      }}
                    >
                      <CheckCircle2 size={12} /> {activeNoteTaskId === task.id ? 'Confirm Resolve' : 'Resolve Task'}
                    </button>

                    {currentUserRole === 'crew_medical_officer' && task.assignedRole === 'crew_medical_officer' && task.status !== 'escalated' && (
                      <button
                        type="button"
                        className="button button-sm button-warning"
                        onClick={() => handleStatusChange(task.id, 'escalated', 'Requested a local draft for Ground Flight Surgeon review.')}
                      >
                        <ArrowUpRight size={12} /> Request ground review
                      </button>
                    )}
                  </div>
                )}

                {/* Optional Note Input Form */}
                {activeNoteTaskId === task.id && (
                  <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    <input
                      type="text"
                      placeholder="Add completion / clinical note..."
                      value={noteInput}
                      onChange={e => setNoteInput(e.target.value)}
                      style={{ flex: '1 1 10rem', minWidth: 0, fontSize: '1rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--line)' }}
                    />
                    <button
                      type="button"
                      className="button button-sm button-ghost"
                      onClick={() => setActiveNoteTaskId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Audit Trail Details */}
                <details style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <summary style={{ cursor: 'pointer' }}>Audit Trail ({task.auditTrail.length} events)</summary>
                  <ul style={{ paddingLeft: '16px', margin: '4px 0 0' }}>
                    {task.auditTrail.map((entry, idx) => (
                      <li key={idx}>
                        <code>{new Date(entry.timestampUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</code>{' '}
                        <strong>{entry.action}</strong> by <em>{entry.actor}</em>
                        {entry.details && ` — ${entry.details}`}
                      </li>
                    ))}
                  </ul>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
