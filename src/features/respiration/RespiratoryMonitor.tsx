/**
 * Camera breathing monitor: live preview with the chest/abdomen regions and tracked
 * points, the breathing waveform with detected breaths and movement artifacts, quality
 * indicators, and the measured metrics. One camera stream feeds both the torso-motion
 * engine and (through the existing camera pulse service) the face-pulse breathing
 * estimate. Video never leaves the device and nothing is recorded.
 */
import { Activity, Camera, ShieldCheck, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { estimateBvpBreathing } from '../checkin/bvpBreathingRate';
import type { BvpSample } from '../checkin/breathingRate';
import { VitalCameraService } from '../checkin/vitalCameraService';
import { RespiratoryEngine, type LiveState } from './engine';
import { DEFAULT_REGIONS, rectFromDrag, regionsFromFace, type FaceBox } from './roi';
import type { Metric, ProcessingProfile, QualityIndicator, RespiratoryResult } from './types';
import { toGray } from './vision';
import './respiratoryMonitor.css';

export interface AcceptedBreathing { brpm: number; quality: number; algorithm: string; capturedAtUtc: string; result: RespiratoryResult }

type Status = 'idle' | 'starting' | 'measuring' | 'done' | 'error';
const TARGET_S = 45;
const MAX_S = 90;

const STATE_LABEL: Record<QualityIndicator['state'], string> = { GOOD: 'Good', ACCEPTABLE: 'Acceptable', POOR: 'Poor', INSUFFICIENT: 'Not enough' };

function strategyLine(live: LiveState | RespiratoryResult, done: boolean): string {
  const s = live.strategy;
  const parts = [
    s.sparseFlow ? 'Tracking points on your chest' : s.profileFallback ? 'Following your chest’s outline (few trackable points)' : 'Looking for your chest',
    s.faceAnchoredRoi ? 'regions placed from your face' : 'regions placed by hand or default',
    s.cameraMotionCompensated ? 'camera shake removed' : '',
    s.pulse === 'active' ? 'face pulse cross-check on' : s.pulse === 'waiting' && !done ? 'face pulse warming up' : 'face pulse not available',
    s.motionArtifact ? 'movement detected: hold still' : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function Chip({ label, q }: { label: string; q: QualityIndicator }) {
  return <span className={`resp-chip is-${q.state.toLowerCase()}`} title={q.reasons.join(' ')}><span>{label}</span> {STATE_LABEL[q.state]}</span>;
}

function MetricCell({ label, m }: { label: string; m: Metric }) {
  return (
    <div className="resp-metric">
      <span className="resp-metric-label">{label}</span>
      <span className="resp-metric-value">{m.value === null ? '—' : `${m.value} ${m.unit === 'ratio' ? '' : m.unit}`}</span>
      <span className="resp-metric-note">{m.kind === 'unavailable' ? m.note : m.kind === 'estimated' ? 'estimated' : ''}</span>
    </div>
  );
}

/** Waveform of the last 30 s: the line, shaded movement artifacts, a dot per detected breath. */
function Waveform({ w }: { w: LiveState['waveform'] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth; const H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (w.t.length < 2) return;
    const end = w.t[w.t.length - 1]; const start = Math.max(w.t[0], end - 30_000);
    const x = (t: number) => ((t - start) / (end - start || 1)) * W;
    const vis = w.v.filter((_, i) => w.t[i] >= start);
    const amp = Math.max(1e-6, ...vis.map(Math.abs));
    const y = (v: number) => H / 2 - (v / amp) * (H * 0.42);
    const css = getComputedStyle(c);
    ctx.fillStyle = css.getPropertyValue('--resp-artifact') || 'rgba(255,152,111,.18)';
    for (const [a, b] of w.artifacts) if (b >= start) ctx.fillRect(x(Math.max(a, start)), 0, x(Math.min(b, end)) - x(Math.max(a, start)), H);
    ctx.strokeStyle = css.getPropertyValue('--resp-line') || '#ffb86a'; ctx.lineWidth = 2; ctx.beginPath();
    let started = false;
    w.t.forEach((t, i) => { if (t < start) return; if (!started) { ctx.moveTo(x(t), y(w.v[i])); started = true; } else ctx.lineTo(x(t), y(w.v[i])); });
    ctx.stroke();
    ctx.fillStyle = css.getPropertyValue('--resp-breath') || '#68d7a3';
    for (const cyc of w.cycles) {
      if (cyc.peak < start) continue;
      const i = w.t.findIndex((t) => t >= cyc.peak);
      if (i >= 0) { ctx.beginPath(); ctx.arc(x(cyc.peak), y(w.v[i]), 3.5, 0, Math.PI * 2); ctx.fill(); }
    }
  }, [w]);
  return <canvas ref={ref} className="resp-wave" role="img" aria-label={`Breathing waveform, ${w.cycles.length} breaths detected`} />;
}

export function RespiratoryMonitor({ onAccept, profile = 'standard' }: { onAccept?: (accepted: AcceptedBreathing) => void; profile?: ProcessingProfile }) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [live, setLive] = useState<LiveState | null>(null);
  const [result, setResult] = useState<RespiratoryResult | null>(null);
  const [manual, setManual] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const session = useRef<{ stop: () => void } | null>(null);
  const engineRef = useRef<RespiratoryEngine | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  /** true once the person drew the chest region: stop following the face */
  const manualRegions = useRef(false);

  useEffect(() => () => session.current?.stop(), []);

  async function start() {
    setError(''); setResult(null); setLive(null); setManual(false);
    setStatus('starting');
    const el = video.current!;
    const engine = new RespiratoryEngine(profile);
    engineRef.current = engine;
    engine.setRegions(DEFAULT_REGIONS);
    const bvp: BvpSample[] = [];
    let face: FaceBox | null = null;
    manualRegions.current = false;
    let pulseAvailable = true;
    let ownStream: MediaStream | null = null;
    const service = new VitalCameraService();
    let stopped = false;
    let frameHandle = 0;
    let tick = 0;
    const canvas = document.createElement('canvas');
    const ctx2d = canvas.getContext('2d', { willReadFrequently: true });

    const stop = () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(tick);
      if ('cancelVideoFrameCallback' in el && frameHandle) (el as HTMLVideoElement & { cancelVideoFrameCallback(h: number): void }).cancelVideoFrameCallback(frameHandle);
      else cancelAnimationFrame(frameHandle);
      void service.stop().catch(() => undefined);
      ownStream?.getTracks().forEach((t) => t.stop());
      el.srcObject = null;
    };
    session.current = { stop };

    // Frames: downscale to the profile's working width and feed the engine with real timestamps.
    const onFrame = () => {
      if (stopped) return;
      if (el.readyState >= 2 && el.videoWidth && ctx2d) {
        const w = engine.workingWidth; const h = Math.round((w * el.videoHeight) / el.videoWidth);
        if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
        ctx2d.drawImage(el, 0, 0, w, h);
        engine.push(toGray(ctx2d.getImageData(0, 0, w, h).data, w, h), performance.now());
      }
      frameHandle = 'requestVideoFrameCallback' in el
        ? (el as HTMLVideoElement & { requestVideoFrameCallback(cb: () => void): number }).requestVideoFrameCallback(onFrame)
        : requestAnimationFrame(onFrame);
    };

    try {
      await service.start(el, {
        onHeartRate: () => undefined,
        onFaceDetected: () => undefined,
        onFaceBox: (box) => { face = box; },
        onBvp: (s) => { bvp.push(s); if (bvp.length > 2400) bvp.splice(0, bvp.length - 2400); },
        onError: () => undefined,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (message === 'PERMISSION_DENIED') { stop(); setError('Camera access is blocked. Allow the camera in your browser or app settings.'); setStatus('error'); return; }
      // Face-pulse analysis unavailable: measure chest motion with a camera stream of our own.
      pulseAvailable = false;
      try {
        ownStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
        el.srcObject = ownStream;
        await el.play().catch(() => undefined);
      } catch {
        stop(); setError('The camera could not start. You can count your breaths by hand instead.'); setStatus('error'); return;
      }
    }
    if (stopped) return;
    engine.setPulse(null, pulseAvailable);
    setStatus('measuring');
    onFrame();
    const began = performance.now();
    let lastFace: FaceBox | null = null;
    tick = window.setInterval(() => {
      if (stopped) return;
      const now = performance.now();
      if (face && !manualRegions.current && (!lastFace || Math.abs(face.cy - lastFace.cy) > 0.03 || Math.abs(face.cx - lastFace.cx) > 0.03)) {
        engine.setRegions(regionsFromFace(face, el.videoWidth / Math.max(1, el.videoHeight)), true, now);
        lastFace = face;
      }
      if (pulseAvailable) {
        const p = estimateBvpBreathing(bvp);
        engine.setPulse(p ? { brpm: p.brpm, quality: p.quality, seconds: p.seconds } : null, true);
      }
      const state = engine.live();
      setLive(state);
      const elapsed = (now - began) / 1000;
      const confident = state.brpm !== null && state.quality.final.state === 'GOOD';
      if ((elapsed >= TARGET_S && confident) || elapsed >= MAX_S) finish();
    }, 1000);
  }

  function finish() {
    const engine = engineRef.current;
    session.current?.stop();
    if (!engine) return;
    const r = engine.result();
    setResult(r);
    setStatus('done');
  }

  function cancel() {
    session.current?.stop();
    setStatus('idle'); setLive(null);
  }

  // Draw regions and tracked points over the (mirrored) preview.
  useEffect(() => {
    const c = overlay.current; const ctx = c?.getContext('2d');
    if (!c || !ctx || !live || !live.width) return;
    c.width = c.clientWidth; c.height = c.clientHeight;
    const sx = c.width / live.width; const sy = c.height / live.height;
    const mx = (x: number) => c.width - x * sx; // preview is mirrored
    ctx.clearRect(0, 0, c.width, c.height);
    const css = getComputedStyle(c);
    for (const [kind, r] of Object.entries(live.regions)) {
      if (!r) continue;
      ctx.strokeStyle = kind === 'chest' ? css.getPropertyValue('--resp-line') : css.getPropertyValue('--resp-breath');
      ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.strokeRect(mx(r.x + r.w), r.y * sy, r.w * sx, r.h * sy);
    }
    ctx.setLineDash([]);
    ctx.fillStyle = css.getPropertyValue('--resp-breath');
    for (const p of live.points) { ctx.beginPath(); ctx.arc(mx(p.x), p.y * sy, 2, 0, Math.PI * 2); ctx.fill(); }
  }, [live]);

  // Drag on the preview to place the chest region by hand.
  const toFrac = (e: React.PointerEvent) => { const b = (e.target as HTMLElement).getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }; };
  const onDown = (e: React.PointerEvent) => { if (status === 'measuring') { drag.current = toFrac(e); (e.target as HTMLElement).setPointerCapture(e.pointerId); } };
  const onUp = (e: React.PointerEvent) => {
    const a = drag.current; drag.current = null;
    const engine = engineRef.current;
    if (!a || !engine) return;
    const rect = rectFromDrag(a, toFrac(e), true);
    if (rect.w < 0.05 || rect.h < 0.05) return;
    manualRegions.current = true;
    engine.setRegions({ chest: rect }, false, performance.now());
    setManual(true);
  };

  const shown = result ?? live;
  const final = shown?.quality.final;
  const accepted = result && result.fusion.brpm !== null && (result.quality.final.state === 'GOOD' || result.quality.final.state === 'ACCEPTABLE');
  const elapsed = live?.durationS ?? 0;

  return (
    <section className="resp-monitor" aria-labelledby="resp-title">
      <div className="resp-head">
        <h3 id="resp-title"><Activity size={18} aria-hidden="true" /> Camera breathing monitor</h3>
        <span className="resp-badge">Chest motion{shown?.strategy.pulse === 'active' ? ' + face pulse' : ''}</span>
      </div>

      {status === 'idle' && (
        <div className="resp-setup">
          <ol>
            <li>Sit about an arm’s length from the camera so your face and chest are both in the picture.</li>
            <li>Face a light; avoid a bright window behind you. A patterned top helps.</li>
            <li>Sit still and breathe normally for about {TARGET_S} seconds. Don’t talk.</li>
          </ol>
          <p className="resp-privacy"><ShieldCheck size={15} aria-hidden="true" /> Video stays on this device. Nothing is recorded or sent.</p>
          <button type="button" className="button button-primary" onClick={() => void start()}><Camera size={18} aria-hidden="true" /> Start breathing scan</button>
        </div>
      )}

      <div className={`resp-stage${status === 'done' ? ' is-done' : ''}`} hidden={status === 'idle' || status === 'error'}>
        <div className="resp-preview" hidden={status === 'done'}>
          <video ref={video} muted playsInline autoPlay aria-label="Camera preview" />
          <canvas ref={overlay} aria-hidden="true" onPointerDown={onDown} onPointerUp={onUp} />
          {status === 'starting' && <p className="resp-overlay-note">Starting the camera…</p>}
        </div>

        {shown && (
          <div className="resp-side">
            <p className="resp-rate" aria-live="polite">
              {result
                ? accepted ? <><strong>{Math.round(result.fusion.brpm!)}</strong> breaths/min</> : <>No reliable rate</>
                : live?.brpm != null ? <><strong>{Math.round(live.brpm)}</strong> breaths/min</> : <>Measuring… {Math.round(elapsed)} s</>}
            </p>
            <div className="resp-chips">
              <Chip label="Video" q={shown.quality.video} />
              <Chip label="Region" q={shown.quality.roi} />
              <Chip label="Tracking" q={shown.quality.tracking} />
              <Chip label="Signal" q={shown.quality.signal} />
              {final && <Chip label="Confidence" q={final} />}
            </div>
            <p className="resp-strategy">{strategyLine(shown, status === 'done')}{manual ? ' · chest region set by hand' : ''}</p>
            <Waveform w={shown.waveform} />
            {status === 'measuring' && <p className="resp-hint">Drag on the picture to draw the chest region yourself.</p>}
          </div>
        )}
      </div>

      {result && (
        <div className="resp-results">
          {!accepted && <p className="resp-reasons">{[result.fusion.method, ...result.quality.final.reasons].filter(Boolean).slice(0, 3).join(' ')}</p>}
          <div className="resp-metrics">
            <MetricCell label="Breathing rate" m={result.metrics.rate} />
            <MetricCell label="Breath length" m={result.metrics.cycleDuration} />
            <MetricCell label="Breathing in" m={result.metrics.inspiration} />
            <MetricCell label="Breathing out" m={result.metrics.expiration} />
            <MetricCell label="In : out ratio" m={result.metrics.ieRatio} />
            <MetricCell label="Breath-to-breath variation" m={result.metrics.regularity} />
            <MetricCell label="Rate variability" m={result.metrics.variability} />
            <MetricCell label="Chest movement" m={result.metrics.chestAmplitude} />
            <MetricCell label="Abdomen movement" m={result.metrics.abdomenAmplitude} />
          </div>
          <p className="resp-method">{result.fusion.method}. Movement in ordinary video is relative: it does not measure breath volume or oxygen.</p>
        </div>
      )}

      {status === 'error' && <p className="resp-error" role="alert">{error}</p>}

      <div className="resp-actions">
        {status === 'measuring' && <button type="button" className="button button-secondary" onClick={finish}><Square size={16} aria-hidden="true" /> Finish now</button>}
        {(status === 'measuring' || status === 'starting') && <button type="button" className="button button-ghost" onClick={cancel}>Cancel</button>}
        {status === 'done' && accepted && onAccept && (
          <button type="button" className="button button-primary" onClick={() => onAccept({
            brpm: Math.round(result!.fusion.brpm!), quality: result!.quality.final.score, algorithm: result!.algorithm, capturedAtUtc: new Date().toISOString(), result: result!,
          })}>Use {Math.round(result!.fusion.brpm!)} breaths/min in my check-in</button>
        )}
        {(status === 'done' || status === 'error') && <button type="button" className="button button-secondary" onClick={() => void start()}>Measure again</button>}
      </div>
    </section>
  );
}
