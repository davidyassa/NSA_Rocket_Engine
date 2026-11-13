import { useEffect, useMemo, useRef, useState } from 'react';
import { VitalCameraService } from './vitalCameraService';
import {
  assessPulseSamples,
  estimateFromGate,
  isDisplayableSample,
  MIN_ACCEPT_SAMPLES,
  PULSE_ALGORITHM,
  PULSE_SQI_ACCEPT_FLOOR,
  PULSE_SQI_DISPLAY_FLOOR,
  PULSE_WINDOW_SIZE,
  type CameraPulseEstimate,
  type PulseSample,
} from './pulseQuality';
import './cameraPulseCheck.css';

export type CameraPulseStatus =
  | 'idle'
  | 'consent'
  | 'requesting'
  | 'measuring'
  | 'permission_denied'
  | 'camera_unavailable'
  | 'weak_signal'
  | 'success'
  | 'error';

interface ScanLogEntry {
  id: string;
  capturedAtUtc: string;
  estimatedBpm: number;
  medianSqi: number;
  samples: number;
  algorithm: string;
  /** Filled in by the operator against a pulse oximeter before validation runs. */
  referenceBpm: number | null;
  referenceDevice: string | null;
}

function QualityTipsGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <details className="camera-quality-guide" open={defaultOpen}>
      <summary aria-label="How to get best sample quality">
        <span aria-hidden="true">💡</span> Tips for best sample quality
      </summary>
      <div className="camera-quality-tips">
        <div className="camera-tip-card">
          <span className="camera-tip-icon" aria-hidden="true">🛑</span>
          <div>
            <strong>Hold completely still:</strong>
            <p>Minute skin color flushes are tracked at 30 fps. Even small head turns or nodding disrupt the signal.</p>
          </div>
        </div>
        <div className="camera-tip-card">
          <span className="camera-tip-icon" aria-hidden="true">☀️</span>
          <div>
            <strong>Frontal, even lighting:</strong>
            <p>Face a desk lamp or window directly. Avoid backlight (lamps/windows behind you) or moving shadows.</p>
          </div>
        </div>
        <div className="camera-tip-card">
          <span className="camera-tip-icon" aria-hidden="true">👤</span>
          <div>
            <strong>Clear forehead &amp; cheeks:</strong>
            <p>Ensure skin is visible. Push back hair bangs and adjust glasses if they reflect bright glare.</p>
          </div>
        </div>
        <div className="camera-tip-card">
          <span className="camera-tip-icon" aria-hidden="true">🪑</span>
          <div>
            <strong>Rest chin &amp; avoid talking:</strong>
            <p>Rest your elbows or chin on a table to prevent body sway. Do not talk, smile, or chew while scanning.</p>
          </div>
        </div>
      </div>
    </details>
  );
}

function sqiTone(sqi: number): 'weak' | 'good' | 'optimal' {
  if (sqi < PULSE_SQI_DISPLAY_FLOOR) return 'weak';
  return sqi >= 0.7 ? 'optimal' : 'good';
}

export function CameraPulseCheck({ onAcceptEstimate }: {
  onAcceptEstimate?: (estimate: CameraPulseEstimate) => void;
} = {}) {
  const [status, setStatus] = useState<CameraPulseStatus>('idle');
  const [faceDetected, setFaceDetected] = useState(false);
  const [samples, setSamples] = useState<PulseSample[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [acceptedEstimate, setAcceptedEstimate] = useState<CameraPulseEstimate | null>(null);
  const [populatedIntoForm, setPopulatedIntoForm] = useState(false);
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const [scanLogMessage, setScanLogMessage] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const serviceRef = useRef<VitalCameraService | null>(null);
  const samplesRef = useRef<PulseSample[]>([]);

  const gate = useMemo(() => assessPulseSamples(samples), [samples]);
  const latest = samples.at(-1) ?? null;
  const latestDisplayable = latest ? isDisplayableSample(latest) : false;

  // Clean teardown on unmount or route leave
  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        serviceRef.current.stop();
        serviceRef.current = null;
      }
    };
  }, []);

  function resetSamples() {
    samplesRef.current = [];
    setSamples([]);
  }

  async function handleConsentAndStart() {
    setStatus('requesting');
    setErrorMessage('');
    setFaceDetected(false);
    setAcceptedEstimate(null);
    setPopulatedIntoForm(false);
    resetSamples();

    const service = new VitalCameraService();
    serviceRef.current = service;

    try {
      let videoEl = videoRef.current;
      if (!videoEl) {
        await new Promise(r => setTimeout(r, 60));
        videoEl = videoRef.current;
      }
      if (!videoEl) {
        throw new Error('Video element failed to mount.');
      }

      await service.start(videoEl, {
        onHeartRate: data => {
          if (serviceRef.current !== service) return;
          const sample: PulseSample = { hr: data.hr, sqi: data.sqi, timestamp: data.timestamp };
          samplesRef.current = [...samplesRef.current, sample].slice(-PULSE_WINDOW_SIZE);
          setSamples(samplesRef.current);
        },
        onFaceDetected: detected => {
          if (serviceRef.current !== service) return;
          setFaceDetected(detected);
        },
        onError: err => {
          if (serviceRef.current !== service) return;
          if (err.message === 'PERMISSION_DENIED') {
            setStatus('permission_denied');
          } else if (err.message === 'CAMERA_UNAVAILABLE') {
            setStatus('camera_unavailable');
          } else {
            setErrorMessage(err.message);
            setStatus('error');
          }
        },
      });

      if (serviceRef.current !== service) {
        return;
      }

      setStatus('measuring');
    } catch (err) {
      if (serviceRef.current !== service) {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'PERMISSION_DENIED') {
        setStatus('permission_denied');
      } else if (msg === 'CAMERA_UNAVAILABLE') {
        setStatus('camera_unavailable');
      } else {
        setErrorMessage(msg);
        setStatus('error');
      }
    }
  }

  function acceptEstimate(estimate: CameraPulseEstimate) {
    if (!onAcceptEstimate) return;
    onAcceptEstimate(estimate);
    setPopulatedIntoForm(true);
    setScanLog(previous => [...previous, {
      id: crypto.randomUUID(),
      capturedAtUtc: estimate.capturedAtUtc,
      estimatedBpm: estimate.bpm,
      medianSqi: Math.round(estimate.sqi * 1000) / 1000,
      samples: estimate.sampleCount,
      algorithm: estimate.algorithm,
      referenceBpm: null,
      referenceDevice: null,
    }]);
  }

  function resolveCapture() {
    const at = latest && Number.isFinite(latest.timestamp) ? new Date(latest.timestamp) : new Date();
    return estimateFromGate(assessPulseSamples(samplesRef.current), at);
  }

  async function handleStop(accept = false) {
    if (serviceRef.current) {
      await serviceRef.current.stop();
      serviceRef.current = null;
    }

    const estimate = resolveCapture();
    if (estimate) {
      setAcceptedEstimate(estimate);
      if (accept) acceptEstimate(estimate);
      setStatus('success');
    } else {
      setStatus('weak_signal');
    }
  }

  function handleUseEstimate() {
    const estimate = acceptedEstimate ?? resolveCapture();
    if (estimate) acceptEstimate(estimate);
  }

  async function handleCancel() {
    if (serviceRef.current) {
      await serviceRef.current.stop();
      serviceRef.current = null;
    }
    setStatus('idle');
    resetSamples();
    setFaceDetected(false);
    setAcceptedEstimate(null);
  }

  function downloadScanLog() {
    const payload = {
      schemaVersion: '1.0.0',
      exportedAtUtc: new Date().toISOString(),
      purpose: 'Local camera pulse-check scan log for offline validation. Fill referenceBpm from a pulse oximeter or ECG reading taken during the same window, then run npm run validation:report.',
      privacy: 'No video, images, or facial data are included. Scans are held in memory for this session only.',
      scans: scanLog,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sol-check-camera-scan-log.json';
    a.click();
    URL.revokeObjectURL(url);
    setScanLogMessage(`Downloaded ${scanLog.length} accepted scan${scanLog.length === 1 ? '' : 's'}.`);
  }

  // 1. Idle state: small optional trigger button beside manual entry
  if (status === 'idle') {
    return (
      <div className="camera-pulse-container">
        <button
          type="button"
          className="button button-secondary camera-pulse-open-btn"
          onClick={() => setStatus('consent')}
          aria-label="Open optional camera pulse check"
        >
          <span aria-hidden="true">📷</span> Camera pulse check (optional)
        </button>
      </div>
    );
  }

  return (
    <div className="camera-pulse-container">
      <div className="camera-pulse-card" role="region" aria-label="Camera pulse check">
        <div className="camera-pulse-header">
          <h3>Camera pulse check</h3>
          <span className="camera-pulse-badge-opt">Optional</span>
        </div>

        {/* 2. Consent State */}
        {status === 'consent' && (
          <div className="camera-pulse-consent">
            <p className="camera-pulse-consent-text">
              Estimates pulse rate using optical skin color variations through your camera.
            </p>
            <QualityTipsGuide defaultOpen={false} />
            <ul className="camera-pulse-consent-points">
              <li>
                <strong>Strictly on-device:</strong> Processing runs locally via WebAssembly. No video, images, or biometric data are transmitted or stored.
              </li>
              <li>
                <strong>Temporary:</strong> The estimate is volatile and remains in memory for this session only.
              </li>
              <li>
                <strong>Manual entry remains available:</strong> You can cancel at any time and enter your heart rate manually.
              </li>
            </ul>
            <div className="camera-pulse-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={handleConsentAndStart}
              >
                I consent · Start camera
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* 4. Permission Denied State */}
        {status === 'permission_denied' && (
          <div className="camera-pulse-denied" role="alert">
            <p className="camera-pulse-error-msg">
              <strong>Camera permission denied.</strong> Browser camera access was blocked or denied.
            </p>
            <p className="camera-pulse-measuring-info">
              Manual check-in is fully available. Enter your heart rate in the field above.
            </p>
            <div className="camera-pulse-actions">
              <button type="button" className="button button-secondary" onClick={handleCancel}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* 5. Camera Unavailable State */}
        {status === 'camera_unavailable' && (
          <div className="camera-pulse-unavailable" role="alert">
            <p className="camera-pulse-error-msg">
              <strong>Camera unavailable.</strong> No operational camera was detected.
            </p>
            <p className="camera-pulse-measuring-info">
              Manual check-in is fully available. Enter your heart rate in the field above.
            </p>
            <div className="camera-pulse-actions">
              <button type="button" className="button button-secondary" onClick={handleCancel}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* 6. Measuring / Requesting State */}
        {(status === 'measuring' || status === 'requesting') && (
          <div className="camera-pulse-measuring">
            <div className="camera-video-wrapper">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="camera-video-feed"
                aria-label="Camera preview for pulse check"
              />
              {status === 'measuring' && (
                <div
                  className={`camera-face-reticle ${faceDetected ? (latestDisplayable ? 'good' : 'calibrating') : 'searching'}`}
                  aria-hidden="true"
                >
                  <div className="camera-reticle-oval">
                    <div className="camera-reticle-bracket top-left" />
                    <div className="camera-reticle-bracket top-right" />
                    <div className="camera-reticle-bracket bottom-left" />
                    <div className="camera-reticle-bracket bottom-right" />
                  </div>
                </div>
              )}
              <div className="camera-video-overlay" aria-live="polite">
                {status === 'requesting'
                  ? 'Initializing local models...'
                  : (faceDetected ? '✓ Face detected · Hold still' : 'Position face inside the frame')}
              </div>
            </div>

            <div className="camera-pulse-measuring-info">
              <span className="camera-pulse-status-msg">
                {status === 'requesting'
                  ? 'Starting camera stream and WebAssembly workers...'
                  : (faceDetected ? 'Analyzing pulse signal...' : 'Looking for face...')}
              </span>

              {status === 'measuring' && (
                <div
                  className={`camera-movement-guide ${faceDetected ? (gate.ready ? 'guide-good' : 'guide-calibrating') : 'guide-searching'}`}
                  role="status"
                >
                  <span className="camera-movement-guide-badge">
                    {!faceDetected
                      ? 'Align Face'
                      : (gate.ready ? 'Stable Window' : 'Hold Still')}
                  </span>
                  <p className="camera-movement-guide-text">
                    {!faceDetected
                      ? 'Center your face inside the oval guide at arm’s length (50 cm) with frontal light.'
                      : (gate.ready
                        ? `Stable window acquired from ${gate.usableSamples} samples. Keep holding this posture until you accept.`
                        : 'Rest your chin or elbows on desk. Keep head completely still and avoid talking or chewing.')}
                  </p>
                </div>
              )}

              {latest && (
                <div className="camera-pulse-sqi-bar">
                  <span>Signal quality:</span>
                  <div className="camera-pulse-sqi-track">
                    <div
                      className={`camera-pulse-sqi-fill ${sqiTone(latest.sqi)}`}
                      style={{ width: `${Math.min(100, Math.round(latest.sqi * 100))}%` }}
                    />
                  </div>
                  <span className="camera-pulse-sqi-pct">{Math.round(latest.sqi * 100)}%</span>
                  <span className={`camera-sqi-badge ${sqiTone(latest.sqi)}`}>
                    {sqiTone(latest.sqi) === 'weak' ? 'Weak · Calibrating' : (sqiTone(latest.sqi) === 'optimal' ? 'Optimal' : 'Good')}
                  </span>
                </div>
              )}

              {status === 'measuring' && (
                <p className="camera-pulse-window-progress" aria-live="polite">
                  Stable window: <strong>{Math.min(gate.usableSamples, MIN_ACCEPT_SAMPLES)} / {MIN_ACCEPT_SAMPLES}</strong> samples
                  {gate.usableSamples > MIN_ACCEPT_SAMPLES && ` (${gate.usableSamples} collected)`}
                  {' · '}median SQI must reach {Math.round(PULSE_SQI_ACCEPT_FLOOR * 100)}%.
                </p>
              )}

              {latest && latest.sqi < PULSE_SQI_DISPLAY_FLOOR && (
                <p className="camera-pulse-weak-alert" role="status">
                  Signal too weak. Ensure your face is evenly lit and facing the camera directly.
                </p>
              )}

              {gate.reason === 'weak_signal' && (
                <p className="camera-pulse-weak-alert" role="status">
                  Window collected, but median signal quality is below the acceptance floor. Hold still and keep frontal light.
                </p>
              )}

              {gate.ready && gate.medianHr !== null && (
                <p className="camera-pulse-status-msg" style={{ color: '#2d6a4f', marginTop: '0.3rem' }}>
                  Stable estimate {Math.round(gate.medianHr)} bpm from {gate.usableSamples} samples
                  (median SQI {Math.round((gate.medianSqi ?? 0) * 100)}%).
                </p>
              )}

              <QualityTipsGuide />
            </div>

            <div className="camera-pulse-actions">
              {status === 'measuring' && gate.ready && gate.medianHr !== null ? (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => handleStop(true)}
                >
                  Accept reading ({Math.round(gate.medianHr)} bpm)
                </button>
              ) : null}
              {status === 'measuring' && (
                <button type="button" className="button button-secondary" onClick={() => handleStop(false)}>
                  Stop
                </button>
              )}
              <button type="button" className="button button-secondary" onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* 7. Weak Signal State */}
        {status === 'weak_signal' && (
          <div className="camera-pulse-weak" role="status">
            <p className="camera-pulse-weak-alert">
              Signal too weak
            </p>
            <p className="camera-pulse-measuring-info">
              No stable pulse window was acquired, so no estimate is shown. Keep still, ensure adequate lighting, and face the camera directly.
            </p>
            <div className="camera-troubleshoot-box">
              <p className="camera-troubleshoot-title">Checklist before retrying:</p>
              <ul className="camera-troubleshoot-list">
                <li><strong>No head movement:</strong> Rest your elbows or chin on a desk.</li>
                <li><strong>Frontal lighting:</strong> Avoid bright windows or lamps directly behind you.</li>
                <li><strong>Clear skin view:</strong> Keep forehead and cheekbones unobstructed.</li>
                <li><strong>Remain silent:</strong> Do not talk, smile, or chew during the capture.</li>
              </ul>
            </div>
            <div className="camera-pulse-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={handleConsentAndStart}
              >
                Try again
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCancel}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* 8. Success State */}
        {status === 'success' && acceptedEstimate && (
          <div className="camera-pulse-success" role="status">
            <div className="camera-pulse-result">
              <div className="camera-pulse-result-reading">
                <span className="camera-pulse-result-label">Estimated heart rate:</span>
                <span className="camera-pulse-result-val">{acceptedEstimate.bpm} bpm</span>
              </div>
              <p className="camera-pulse-result-meta">
                Median of {acceptedEstimate.sampleCount} samples · signal quality {Math.round(acceptedEstimate.sqi * 100)}%
                <br />
                <span className="camera-pulse-method">{PULSE_ALGORITHM}</span>
              </p>
              <div>
                <span className="camera-pulse-disclaimer">Not a diagnosis</span>
              </div>
              <p className="camera-pulse-privacy-note">
                Nothing is saved unless you choose to use this estimate in your check-in. If you do, the
                value is stored with source <code>camera_estimate</code>, its signal quality, algorithm and capture time.
                No video, images, or facial data are retained.
              </p>
            </div>

            <div className="camera-pulse-actions">
              {onAcceptEstimate && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleUseEstimate}
                >
                  {populatedIntoForm ? '✓ Populated in check-in' : `Use ${acceptedEstimate.bpm} bpm in check-in`}
                </button>
              )}
              <button
                type="button"
                className="button button-secondary"
                onClick={handleConsentAndStart}
              >
                Measure again
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCancel}
              >
                Done
              </button>
            </div>

            {scanLog.length > 0 && (
              <div className="camera-pulse-scanlog">
                <button type="button" className="button button-secondary" onClick={downloadScanLog}>
                  Download scan log (JSON)
                </button>
                <p className="muted">
                  {scanLog.length} accepted scan{scanLog.length === 1 ? '' : 's'} held in memory. Add a pulse-oximeter
                  reference to each entry before running the validation report.
                </p>
                {scanLogMessage && <p className="muted" role="status">{scanLogMessage}</p>}
              </div>
            )}
          </div>
        )}

        {/* 9. Error State */}
        {status === 'error' && (
          <div className="camera-pulse-error" role="alert">
            <p className="camera-pulse-error-msg">
              <strong>Error:</strong> {errorMessage || 'An error occurred during pulse check.'}
            </p>
            <p className="camera-pulse-measuring-info">
              Manual check-in is fully available.
            </p>
            <div className="camera-pulse-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCancel}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
