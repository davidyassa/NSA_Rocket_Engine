import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, CircleCheck, Database, Download, FileJson, FlaskConical, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DailyCheckin, DemoScenario } from '../contracts';
import { RADLAB_CSV_URL, RADLAB_MANIFEST, RADLAB_SOURCE } from '../data/nasa';
import { DEMO_OPTIONS, SCENARIO_IDS, type ScenarioId } from '../scenarios';
import { buildRecordExport, parseAndValidateExport, type RecordExport } from './recordExport';
import './demo-data.css';

function OfflineStatus() {
  const serviceWorker = navigator.serviceWorker;
  const [ready, setReady] = useState(() => Boolean(serviceWorker?.controller));

  useEffect(() => {
    if (!serviceWorker) return;
    function update() {
      setReady(Boolean(serviceWorker.controller));
    }
    serviceWorker.addEventListener('controllerchange', update);
    update();
    return () => serviceWorker.removeEventListener('controllerchange', update);
  }, [serviceWorker]);

  return (
    <section className="panel demo-data-panel" aria-labelledby="offline-heading">
      <div className="demo-data-heading">
        <span className="demo-data-icon"><WifiOff size={20} aria-hidden="true" /></span>
        <h2 id="offline-heading">Offline demo</h2>
      </div>
      <p role="status" className="demo-offline-status">
        {ready && <CircleCheck size={16} aria-hidden="true" />}
        {ready ? 'Ready to run offline' : 'Offline cache pending'}
      </p>
      <p className="muted">
        {ready
          ? 'The app and RadLab archive are cached on this device. Check-ins are saved locally.'
          : 'Open the production build while connected and wait for offline readiness before disconnecting.'}
      </p>
    </section>
  );
}

export function DemoData({
  scenarioId,
  onLoad,
  scenario,
  records,
}: {
  scenarioId: ScenarioId;
  onLoad: (scenarioId: ScenarioId) => void;
  scenario?: DemoScenario;
  records?: readonly DailyCheckin[];
}) {
  const [error, setError] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const activeScenario = scenario ?? DEMO_OPTIONS[scenarioId].scenario;
  const activeRecords = records ?? activeScenario.history;

  function load(id: ScenarioId) {
    try {
      setError('');
      setExportMessage('');
      setExportStatus('idle');
      onLoad(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The scenario could not be loaded.');
    }
  }

  function handleExport() {
    try {
      setExportMessage('');
      setExportStatus('idle');

      // Build export payload
      const exportData: RecordExport = buildRecordExport(activeScenario, activeRecords);
      const jsonText = JSON.stringify(exportData, null, 2);

      // Verify offline parseability immediately
      const verified = parseAndValidateExport(jsonText);
      if (!verified || verified.recordCount !== exportData.recordCount) {
        throw new Error('Export validation failed.');
      }

      // Generate local download blob
      const blob = new Blob([jsonText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const filename = `sol-check-${activeScenario.id}-records.json`;

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      const sizeKb = (blob.size / 1024).toFixed(1);
      setExportStatus('success');
      setExportMessage(`Export downloaded: ${filename} (${sizeKb} KB, ${exportData.recordCount} records). Verified and parsed offline.`);
    } catch (err) {
      setExportStatus('error');
      setExportMessage(err instanceof Error ? err.message : 'Export failed.');
    }
  }

  // Calculate pre-download breakdown
  const totalCount = activeRecords.length;
  const userEnteredCount = activeRecords.filter(r => r.measurements.some(m => m.provenance === 'user_entered')).length;
  const syntheticCount = totalCount - userEnteredCount;
  const minSol = totalCount > 0 ? Math.min(...activeRecords.map(r => r.sol)) : activeScenario.startSol;
  const maxSol = totalCount > 0 ? Math.max(...activeRecords.map(r => r.sol)) : activeScenario.startSol;
  const hasNotes = activeRecords.some(r => r.note.trim().length > 0);

  return (
    <div className="demo-data">
      <header className="page-intro">
        <h1>Demo and data</h1>
        <p>Switch between synthetic crew histories, export local records, and inspect the Mars radiation archive.</p>
      </header>

      <section aria-labelledby="scenarios-heading">
        <div className="demo-data-heading">
          <span className="demo-data-icon"><FlaskConical size={20} aria-hidden="true" /></span>
          <h2 id="scenarios-heading">Demo scenarios</h2>
          <span className="badge badge-synthetic">Synthetic</span>
        </div>
        {error && <p role="alert" className="storage-warning">{error}</p>}
        <div className="demo-scenario-grid">
          {SCENARIO_IDS.map((id) => {
            const { scenario: optScenario } = DEMO_OPTIONS[id];
            const current = id === scenarioId;
            return (
              <article key={id} className={`panel demo-scenario-card${current ? ' is-current' : ''}`}>
                <div className="demo-scenario-title">
                  <h3>{optScenario.title}</h3>
                  {current && <span className="badge">Active</span>}
                </div>
                <p className="muted">{optScenario.description}</p>
                {current ? (
                  <Link to="/check-in" className="button button-secondary">Open check-in <ArrowRight size={16} aria-hidden="true" /></Link>
                ) : (
                  <button type="button" className="button button-secondary" onClick={() => load(id)}>
                    Load {optScenario.title.toLowerCase()} <ArrowRight size={16} aria-hidden="true" />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* Local Record Export Panel */}
      <section className="panel demo-export-panel" aria-labelledby="export-heading">
        <div className="demo-data-heading">
          <span className="demo-data-icon"><FileJson size={20} aria-hidden="true" /></span>
          <h2 id="export-heading">Local record export</h2>
          <span className="badge">JSON</span>
        </div>

        <p className="demo-export-lead">
          Export the active scenario ({activeScenario.title}) check-in records to a local JSON file.
        </p>

        <div className="demo-export-scope">
          <h3>Export contents & transparency</h3>
          <dl className="demo-export-fields">
            <div>
              <dt>Active scenario</dt>
              <dd><code>{activeScenario.id}</code> ({activeScenario.title})</dd>
            </div>
            <div>
              <dt>Total check-in records</dt>
              <dd><strong>{totalCount}</strong> records (Sols {minSol}–{maxSol})</dd>
            </div>
            <div>
              <dt>Seeded synthetic contribution</dt>
              <dd><strong>{syntheticCount}</strong> seeded synthetic history records (included)</dd>
            </div>
            <div>
              <dt>User-entered contribution</dt>
              <dd><strong>{userEnteredCount}</strong> user-entered check-in records</dd>
            </div>
            <div>
              <dt>Crew notes</dt>
              <dd>{hasNotes ? 'Notes included (recorded notes present)' : 'Notes field included (no notes recorded)'}</dd>
            </div>
            <div>
              <dt>Data fields</dt>
              <dd>Sol number, submission timestamp (UTC), 6 indicators (values + units), observation timestamps, measurement provenance tags, and symptoms checklist</dd>
            </div>
            <div>
              <dt>Schema version</dt>
              <dd>Version 1 (<code>sol-check:export:v1</code>)</dd>
            </div>
          </dl>
          <p className="demo-export-notice">
            The JSON file is generated locally in your browser memory and downloaded directly. No data leaves this device.
          </p>
        </div>

        {exportMessage && (
          <p role="status" className={`demo-export-feedback ${exportStatus === 'success' ? 'is-success' : 'is-error'}`}>
            {exportStatus === 'success' && <CheckCircle2 size={16} aria-hidden="true" />}
            {exportMessage}
          </p>
        )}

        <div className="demo-export-actions">
          <button type="button" className="button button-primary" onClick={handleExport}>
            <Download size={16} aria-hidden="true" /> Export active scenario records (JSON)
          </button>
        </div>
      </section>

      <div className="demo-data-bottom">
        <section className="panel demo-data-panel" aria-labelledby="archive-data-heading">
          <div className="demo-data-heading">
            <span className="demo-data-icon"><Database size={20} aria-hidden="true" /></span>
            <h2 id="archive-data-heading">Mars radiation archive</h2>
            <span className="badge">NASA archive</span>
          </div>
          <p className="muted">{RADLAB_SOURCE.title} · {RADLAB_MANIFEST.rawReadingCount.toLocaleString('en')} readings</p>
          <p className="muted">{RADLAB_SOURCE.supports}</p>
          <p className="muted">{RADLAB_SOURCE.doesNotSupport}</p>
          <div className="demo-data-actions">
            <Link to="/timeline" className="text-link">View mission timeline <ArrowRight size={16} aria-hidden="true" /></Link>
            <a href={RADLAB_CSV_URL} download="radlab-msl-rad-surface-2017-09.csv" className="text-link">
              <Download size={16} aria-hidden="true" /> Download archive CSV
            </a>
          </div>
        </section>
        <OfflineStatus />
      </div>
    </div>
  );
}
