import { useEffect, useRef, useState } from 'react';
import { Clock, FileCheck, Radio } from 'lucide-react';
import { verifyMedicalHandoffPackage, type MedicalHandoffPackage } from './medicalHandoff';

type RehearsalStatus = 'local_only' | 'counting_down' | 'complete';

interface ImportResult {
  valid: boolean;
  message: string;
  details?: string;
}

export function HandoffSimulator({ pkg }: { pkg: MedicalHandoffPackage }) {
  const [status, setStatus] = useState<RehearsalStatus>('local_only');
  const [delayMinutes, setDelayMinutes] = useState(pkg.communicationLatencyOneWayMin);
  const [fastMode, setFastMode] = useState(true);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  useEffect(() => clearTimer, []);

  function startRehearsal() {
    clearTimer();
    const durationSeconds = fastMode ? 4 : Math.round(delayMinutes * 120);
    setCountdownSeconds(durationSeconds);
    setStatus('counting_down');
    timerRef.current = setInterval(() => {
      setCountdownSeconds(previous => {
        if (previous <= 1) {
          clearTimer();
          setStatus('complete');
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
  }

  function resetRehearsal() {
    clearTimer();
    setCountdownSeconds(0);
    setStatus('local_only');
  }

  function verifyUploadedJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = verifyMedicalHandoffPackage(JSON.parse(String(reader.result)));
        if (!result.valid) {
          setImportResult({ valid: false, message: result.message });
          return;
        }
        setImportResult({
          valid: true,
          message: 'Schema and change-detection value match.',
          details: `${result.checksum} · Sol ${result.pkg.missionSol} · ${result.pkg.astronautName}. This does not establish authorship or clinician review.`,
        });
      } catch {
        setImportResult({ valid: false, message: 'The selected file is not valid JSON.' });
      }
    };
    reader.onerror = () => setImportResult({ valid: false, message: 'The selected file could not be read.' });
    reader.readAsText(file);
    event.target.value = '';
  }

  return (
    <section className="panel panel-padded" style={{ marginTop: '14px', borderTop: '3px solid var(--accent)' }} aria-labelledby="delay-rehearsal-title">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <p className="eyebrow" style={{ color: 'var(--accent)' }}>Local communication rehearsal</p>
          <h3 id="delay-rehearsal-title" style={{ margin: '2px 0', fontSize: '1.12rem' }}>Round-trip delay timer</h3>
        </div>
        <span className="badge">{status.replace(/_/g, ' ').toUpperCase()}</span>
      </div>

      <p className="muted" style={{ fontSize: '0.82rem', margin: '6px 0 10px' }}>
        Rehearses the scenario&apos;s round-trip light-time delay in this browser. It does not queue or transmit data,
        contact a flight surgeon, or generate a clinician response.
      </p>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-raised)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.8rem' }}>
        <label>
          <strong>Scenario one-way delay:</strong>{' '}
          <select
            value={delayMinutes}
            onChange={event => setDelayMinutes(Number(event.target.value))}
            style={{ fontSize: '0.78rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}
            disabled={status === 'counting_down'}
          >
            {[...new Set([pkg.communicationLatencyOneWayMin, 4, 14, 20, 22])].sort((a, b) => a - b).map(minutes => (
              <option key={minutes} value={minutes}>{minutes} min</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={fastMode}
            onChange={event => setFastMode(event.target.checked)}
            disabled={status === 'counting_down'}
          />
          <span>Four-second rehearsal (otherwise two times the one-way delay)</span>
        </label>
      </div>

      <div style={{ marginTop: '10px' }}>
        {status === 'local_only' && (
          <button type="button" className="button button-secondary" onClick={startRehearsal}>
            <Radio size={14} aria-hidden="true" /> Start local delay rehearsal
          </button>
        )}
        {status === 'counting_down' && (
          <div role="status" style={{ background: 'var(--bg-raised)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', borderRadius: '6px', padding: '10px 14px' }}>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={15} aria-hidden="true" /> Rehearsal timer running
            </p>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>
              {countdownSeconds}s remaining · No network request is being made.
            </p>
            <button type="button" className="button button-ghost" onClick={resetRehearsal}>Cancel timer</button>
          </div>
        )}
        {status === 'complete' && (
          <div role="status" style={{ background: 'var(--bg-raised)', border: '1px solid color-mix(in srgb, var(--status-steady) 40%, transparent)', borderRadius: '6px', padding: '10px 14px' }}>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--status-steady)' }}>Delay rehearsal complete</p>
            <p className="muted" style={{ margin: '2px 0 8px', fontSize: '0.78rem' }}>
              No data left this browser and no clinical response was generated. Use an authorized mission process to share the downloaded draft.
            </p>
            <button type="button" className="button button-ghost" onClick={resetRehearsal}>Reset timer</button>
          </div>
        )}
      </div>

      <details style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--accent)' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          <FileCheck size={13} style={{ display: 'inline', marginRight: '4px' }} aria-hidden="true" />
          Check an exported handoff JSON
        </summary>
        <div style={{ marginTop: '8px', padding: '10px', background: 'var(--bg-raised)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.76rem' }}>
            Validates schema v1.1.0 and recomputes FNV-1a-32 over the package content. This detects accidental changes; it is not cryptographic authentication.
          </p>
          <input type="file" accept=".json,application/json" onChange={verifyUploadedJson} style={{ fontSize: '0.76rem' }} />
          {importResult && (
            <div
              role={importResult.valid ? 'status' : 'alert'}
              style={{
                marginTop: '8px', padding: '6px 10px', borderRadius: '4px',
                background: importResult.valid ? 'var(--bg-raised)' : 'var(--bg-surface)',
                border: `1px solid ${importResult.valid ? 'color-mix(in srgb, var(--status-steady) 40%, transparent)' : 'color-mix(in srgb, var(--nasa-red) 40%, transparent)'}`,
                color: importResult.valid ? 'var(--status-steady)' : 'var(--nasa-red)', fontSize: '0.78rem',
              }}
            >
              <strong>{importResult.message}</strong>
              {importResult.details && <p style={{ margin: '2px 0 0', fontSize: '0.74rem' }}>{importResult.details}</p>}
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
