import { useEffect, useRef, useState } from 'react';
import { Copy, Radio } from 'lucide-react';
import type { DailyCheckin, MissionContext } from '../../contracts';
import { EvidenceSources } from './EvidenceSources';
import { formatGroundSummary } from './groundSummary';

const communicationSources = ['nasa-delay', 'nasa-eimo'];
const minuteFormatter = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

function delayClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function GroundSummary({ record, mission, startedAt, onReview }: {
  record: DailyCheckin;
  mission: MissionContext;
  startedAt: number;
  onReview: () => void;
}) {
  const roundTrip = mission.oneWayDelayMinutes * 2;
  const earliestReplyAt = startedAt + roundTrip * 60_000;
  const [secondsRemaining, setSecondsRemaining] = useState(() => Math.ceil(roundTrip * 60));
  const [includeNote, setIncludeNote] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const draftField = useRef<HTMLTextAreaElement>(null);
  const draft = formatGroundSummary(record, includeNote);

  useEffect(() => {
    let timer: number | undefined;
    function updateClock() {
      const remaining = Math.max(0, Math.ceil((earliestReplyAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining > 0) timer = window.setTimeout(updateClock, 1000);
    }

    updateClock();
    return () => window.clearTimeout(timer);
  }, [earliestReplyAt]);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(draft);
      if (draftField.current?.value === draft) setCopyStatus('Summary copied.');
    } catch {
      const field = draftField.current;
      if (field?.value === draft) {
        field.focus();
        field.select();
        setCopyStatus('Summary selected. Use your device’s Copy command.');
      }
    }
  }

  return (
    <section className="ground-summary" id="ground-summary" aria-labelledby="ground-summary-title">
      <h3 id="ground-summary-title">Ground communication summary</h3>
      <div className="ground-summary-grid">
        <div>
          <label className="ground-label" htmlFor="ground-draft">Draft for the Ground Flight Surgeon</label>
          <textarea id="ground-draft" ref={draftField} value={draft} rows={9} readOnly spellCheck={false} />
          {record.note.trim() && (
            <label className="ground-include-note">
              <input type="checkbox" checked={includeNote} onChange={(event) => {
                setIncludeNote(event.target.checked);
                setCopyStatus('');
              }} />
              Include recorded note
            </label>
          )}
          <div className="ground-copy-row">
            <button className="button button-secondary" type="button" onClick={copySummary}>
              <Copy size={15} aria-hidden="true" /> Copy summary
            </button>
            <span className="muted" role="status">{copyStatus}</span>
          </div>
        </div>
        <div className="ground-timing">
          <dl>
            <div><dt>Simulated one-way delay</dt><dd>{minuteFormatter.format(mission.oneWayDelayMinutes)} min</dd></div>
            <div><dt>Earliest possible reply</dt><dd>{minuteFormatter.format(roundTrip)} min</dd></div>
            <div><dt>Simulated time remaining</dt><dd role="timer" aria-live="off">{delayClock(secondsRemaining)}</dd></div>
          </dl>
          <p className="muted">The countdown starts when you prepare the draft. Nothing is transmitted.</p>
          <button type="button" className="text-link" onClick={onReview}>Review findings and evidence</button>
          <details className="assessment-why">
            <summary>Communication sources</summary>
            <EvidenceSources ids={communicationSources} />
          </details>
        </div>
      </div>
    </section>
  );
}

export function GroundCommunication({ record, mission, onReview }: {
  record: DailyCheckin;
  mission: MissionContext;
  onReview: () => void;
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null);

  return (
    <section className="panel ground-communication" aria-labelledby="ground-communication-title">
      <div className="ground-banner">
        <div className="ground-heading">
          <span className="ground-icon"><Radio size={21} aria-hidden="true" /></span>
          <div>
            <h2 id="ground-communication-title">Earth communication</h2>
            <p className="muted">Prepare a local draft for the flight surgeon.</p>
          </div>
        </div>
        <button className="button button-secondary" type="button" aria-expanded={startedAt !== null}
          aria-controls={startedAt !== null ? 'ground-summary' : undefined}
          onClick={() => setStartedAt(startedAt === null ? Date.now() : null)}>
          {startedAt === null ? 'Prepare summary for ground' : 'Close summary'}
        </button>
      </div>
      {startedAt !== null && <GroundSummary record={record} mission={mission} startedAt={startedAt} onReview={onReview} />}
    </section>
  );
}
