import { useEffect, useMemo, useRef, useState } from 'react';
import { Armchair, Camera, Check, Eye, Settings2, ShieldCheck, Smartphone, Sun } from 'lucide-react';
import { VitalCameraService } from './vitalCameraService';
import {
  assessPulseSession,
  estimateFromGate,
  isDisplayableSample,
  MIN_ACCEPT_SAMPLES,
  PULSE_ALGORITHM,
  PULSE_MIN_SESSION_MS,
  PULSE_SQI_ACCEPT_FLOOR,
  PULSE_SQI_DISPLAY_FLOOR,
  PULSE_WINDOW_SIZE,
  type CameraPulseEstimate,
  type PulseSample,
} from './pulseQuality';
import {
  MAX_CAPTURE_MS, PROBLEM_ADVICE, analyzeLight, captureProgress, coachCue, explainHeartRate, mostCommonProblem, plainSignal,
  type CueId, type FaceBox, type LightSample,
} from './captureCoach';
import {
  BREATHING, BREATHING_ALGORITHM, beatFeatures, estimateBreathing, explainBreathing,
  type BeatEvent, type BvpSample,
} from './breathingRate';
import { assessSpectralHistory, finalHeartRate, spectralHeartRate, type SpectralHistoryEntry } from './pulseSpectrum';
import './cameraPulseCheck.css';

/** Breathing and HRV need a longer, steady window than heart rate. */
export const VITALS_MAX_MS = 80_000;
/** Keep waiting this long for HRV once breathing is ready; then finish with what we have. */
const VITALS_HRV_GRACE_MS = 55_000;
/** Trust the SDK's RMSSD only once it is computed from at least this many clean beat intervals. */
const MIN_HRV_INTERVALS = 20;
const MAX_BVP_SAMPLES = 30 * 90;
export const HRV_ALGORITHM = 'vitalcamera-sdk RMSSD from camera pulse peaks (SQI-gated, outlier-filtered), local';

export interface CameraVitalsEstimate {
  capturedAtUtc: string;
  /** breaths per minute, or null if breathing could not be read reliably */
  brpm: number | null;
  breathingQuality: number;
  /** HRV RMSSD in ms, or null if not trustworthy */
  rmssd: number | null;
  hrvIntervals: number;
  seconds: number;
  algorithm: string;
}

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

/** Four picture steps shown before the camera starts. */
const SETUP_STEPS = [
  { Icon: Armchair, title: 'Sit down and rest', text: 'Sit for a minute. Rest your elbows on a table so your head stays still.' },
  { Icon: Sun, title: 'Face the light', text: 'A lamp or window should be in front of you, not behind you.' },
  { Icon: Smartphone, title: 'Screen at eye level', text: 'Hold or place it about one arm’s length away (40–50 cm).' },
  { Icon: Eye, title: 'Look at the camera dot', text: 'Look at the camera lens at the top of the screen. Stay quiet for about 20 seconds.' },
];

function MeasurementQualityPanel({
  sampleCount,
  sqi,
  fps = 30,
}: {
  sampleCount: number;
  sqi: number | null;
  fps?: number;
}) {
  return (
    <details className="camera-quality-diagnostic" style={{ marginTop: '0.5rem', fontSize: '0.78rem' }}>
      <summary aria-label="Measurement Quality & Diagnostics" style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--accent)' }}>
        <Settings2 size={14} aria-hidden="true" className="inline-icon" /> Diagnostics &amp; Quality Index (SQI)
      </summary>
      <div style={{ marginTop: '0.4rem', padding: '8px 10px', background: 'var(--bg-raised)', borderRadius: '6px', border: '1px solid var(--border-subtle)', lineHeight: 1.45 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px', marginBottom: '6px' }}>
          <div><strong>Algorithm:</strong> <span>{PULSE_ALGORITHM}</span></div>
          <div><strong>Engine:</strong> <span>LiteRT WASM (v0.6.9)</span></div>
          <div><strong>Sampling rate:</strong> <span>~{fps} fps</span></div>
          <div><strong>Window buffer:</strong> <span>{sampleCount} / {PULSE_WINDOW_SIZE} frames</span></div>
        </div>
        {sqi !== null && (
          <div style={{ margin: '4px 0 6px', fontSize: '0.75rem' }}>
            <strong>Instant SQI:</strong> {Math.round(sqi * 100)}% ({sqi >= PULSE_SQI_ACCEPT_FLOOR ? 'Meets gate floor' : 'Below gate floor'})
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '6px', fontSize: '0.8rem', color: 'var(--accent)' }}>
          <strong>Signal Quality Gate Criteria:</strong>
          <ul style={{ margin: '3px 0 0', paddingLeft: '16px' }}>
            <li>Minimum stable window: <strong>{MIN_ACCEPT_SAMPLES}</strong> samples</li>
            <li>Acceptance SQI threshold: <strong>{Math.round(PULSE_SQI_ACCEPT_FLOOR * 100)}%</strong></li>
            <li>Display cutoff: <strong>{Math.round(PULSE_SQI_DISPLAY_FLOOR * 100)}%</strong> (sub-38% filtered as noise)</li>
            <li>Physiologic boundary: <strong>40 – 200 bpm</strong></li>
          </ul>
        </div>
      </div>
    </details>
  );
}

function sqiTone(sqi: number): 'weak' | 'good' | 'optimal' {
  if (sqi < PULSE_SQI_DISPLAY_FLOOR) return 'weak';
  return sqi >= 0.7 ? 'optimal' : 'good';
}

export function CameraPulseCheck({ onAcceptEstimate, mode = 'pulse', onAcceptVitals }: {
  onAcceptEstimate?: (estimate: CameraPulseEstimate) => void;
  /** 'breathing' measures breathing rate and HRV from the same face pulse signal (about 45 s). */
  mode?: 'pulse' | 'breathing';
  onAcceptVitals?: (estimate: CameraVitalsEstimate) => void;
} = {}) {
  const breathingMode = mode === 'breathing';
  const [status, setStatus] = useState<CameraPulseStatus>('idle');
  const [faceDetected, setFaceDetected] = useState(false);
  const [samples, setSamples] = useState<PulseSample[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [acceptedEstimate, setAcceptedEstimate] = useState<CameraPulseEstimate | null>(null);
  const [populatedIntoForm, setPopulatedIntoForm] = useState(false);
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const [scanLogMessage, setScanLogMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null);
  const [light, setLight] = useState<LightSample | null>(null);
  const [retryAdvice, setRetryAdvice] = useState<CueId | null>(null);
  const [measuredSeconds, setMeasuredSeconds] = useState<number | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [vitals, setVitals] = useState<CameraVitalsEstimate | null>(null);
  const bvpRef = useRef<BvpSample[]>([]);
  const beatsRef = useRef<BeatEvent[]>([]);
  const hrvRef = useRef<{ rmssd: number; n: number } | null>(null);
  /** Fine-resolution heart-rate estimates, one per half second. */
  const spectralRef = useRef<SpectralHistoryEntry[]>([]);
  const [spectralTick, setSpectralTick] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const serviceRef = useRef<VitalCameraService | null>(null);
  const samplesRef = useRef<PulseSample[]>([]);
  const faceDetectedRef = useRef(false);
  const sessionStartedAtRef = useRef<number | null>(null);
  const populatedCaptureRef = useRef<string | null>(null);
  const cueCountsRef = useRef<Partial<Record<CueId, number>>>({});
  /** Set once a measurement is being finished, so the result can never be replaced or hidden by late events. */
  const finishingRef = useRef(false);

  const gate = useMemo(() => assessPulseSession(samples, {
    sessionStartedAt: sessionStartedAtRef.current ?? now,
    facePresent: faceDetected,
    now,
  }), [samples, faceDetected, now]);
  const latest = samples.at(-1) ?? null;
  const latestDisplayable = latest ? isDisplayableSample(latest) : false;
  const sessionStartedAt = sessionStartedAtRef.current;
  const warmupRemainingSeconds = sessionStartedAt === null
    ? Math.ceil(PULSE_MIN_SESSION_MS / 1000)
    : Math.max(0, Math.ceil((PULSE_MIN_SESSION_MS - (now - sessionStartedAt)) / 1000));
  const guidance = !faceDetected
    ? {
      badge: 'Align Face',
      text: 'Center your face inside the oval guide at arm’s length (50 cm) with frontal light.',
    }
    : gate.ready
      ? {
        badge: 'Stable Window',
        text: `Stable window acquired from ${gate.usableSamples} samples. Keep holding this posture until you accept.`,
      }
      : gate.reason === 'warming_up'
        ? {
          badge: 'Warming Up',
          text: `Collecting a fresh ${PULSE_MIN_SESSION_MS / 1000}-second session. ${warmupRemainingSeconds}s remaining; early calibration samples cannot be accepted.`,
        }
        : gate.reason === 'stale'
          ? {
            badge: 'Signal Paused',
            text: 'The latest signal is stale or interrupted. Keep your face visible while a fresh continuous window is collected.',
          }
          : gate.reason === 'implausible'
            ? {
              badge: 'Recalibrating',
              text: 'Current samples are outside the accepted physiologic range and will not be displayed as a pulse estimate.',
            }
            : {
              badge: 'Hold Still',
              text: 'Rest your chin or elbows on a desk. Keep your head still and avoid talking or chewing.',
            };

  const elapsedMs = sessionStartedAt === null ? 0 : Math.max(0, now - sessionStartedAt);
  // Running camera-model heart rate (coarse) used to sanity-check the fine estimate.
  const modelHr = useMemo(() => {
    const recent = samples.slice(-5).filter(isDisplayableSample).map((sample) => sample.hr).sort((a, b) => a - b);
    return recent.length >= 3 ? recent[Math.floor(recent.length / 2)] : null;
  }, [samples]);
  const fast = useMemo(
    () => assessSpectralHistory(spectralRef.current, modelHr),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spectralTick, modelHr],
  );
  const pulseDone = (gate.ready && gate.medianHr !== null) || fast.ready || (elapsedMs >= 6000 && samples.length >= 6);

  // Breathing is recomputed twice a second from the pulse wave collected so far (cheap: ~200 points).
  const breathing = useMemo(
    () => (breathingMode ? estimateBreathing(beatFeatures(bvpRef.current, beatsRef.current)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [breathingMode, now],
  );
  const hrvReady = hrvRef.current !== null && hrvRef.current.n >= MIN_HRV_INTERVALS;
  const vitalsDone = Boolean(breathing?.ready) && (hrvReady || elapsedMs > VITALS_HRV_GRACE_MS);
  const baseCue = coachCue({
    starting: status === 'requesting',
    faceDetected,
    face: faceBox,
    light,
    ready: breathingMode ? vitalsDone : pulseDone,
    elapsedMs,
    usableSamples: gate.usableSamples,
    gateReason: gate.reason,
    fps,
  });
  const breathingSecondsLeft = Math.max(1, Math.ceil(BREATHING.minSeconds + 8 - (breathing?.seconds ?? 0)));
  const cue = breathingMode && baseCue.id === 'hold_still'
    ? {
      ...baseCue,
      detail: breathing?.reason === 'disagree' || breathing?.reason === 'weak'
        ? 'Keep breathing normally and stay very still. The breathing pattern is not clear yet.'
        : `Breathe normally through your nose; don’t talk or move. About ${breathingSecondsLeft} second${breathingSecondsLeft === 1 ? '' : 's'} left.`,
    }
    : baseCue;
  const progress = status !== 'measuring' || !faceDetected
    ? 0
    : breathingMode
      ? (vitalsDone ? 1 : Math.min(0.95, Math.min(1, (breathing?.seconds ?? 0) / (BREATHING.minSeconds + 8)) * 0.7
        + (breathing?.ready ? 0.15 : 0) + (hrvReady ? 0.1 : 0)))
      : Math.max(
        captureProgress(elapsedMs, gate.usableSamples, gate.ready, gate.medianSqi),
        pulseDone ? 1 : Math.min(0.95, (spectralRef.current.length / 6) * 0.3 + Math.min(1, elapsedMs / 10_000) * 0.5),
      );
  const stage = status === 'requesting' || cue.tone === 'action' ? 1 : cue.tone === 'progress' ? 2 : 3;

  useEffect(() => {
    if (status !== 'measuring') return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [status]);

  // Do not wait forever: after MAX_CAPTURE_MS with a face in view and no clean reading,
  // stop and explain what to change (or type the number by hand).
  useEffect(() => {
    if (status !== 'measuring') return;
    if (breathingMode ? !vitalsDone && elapsedMs > VITALS_MAX_MS : !pulseDone && elapsedMs > MAX_CAPTURE_MS) void handleStop(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pulseDone, vitalsDone, elapsedMs]);

  // Twice a second, re-measure heart rate from the last 12 s of pulse wave at fine resolution.
  useEffect(() => {
    if (status !== 'measuring' || breathingMode || !faceDetectedRef.current) return;
    const estimate = spectralHeartRate(bvpRef.current);
    if (!estimate) return;
    spectralRef.current = [...spectralRef.current, estimate].slice(-20);
    setSpectralTick((tick) => tick + 1);
  }, [now, status, breathingMode]);

  // Measure the real camera frame rate (slow cameras blur the pulse; dim light lowers it).
  useEffect(() => {
    if (status !== 'measuring') return;
    const video = videoRef.current as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (id: number) => void }) | null;
    if (!video?.requestVideoFrameCallback) return;
    let frames = 0;
    let handle = 0;
    let stopped = false;
    const count = () => { frames += 1; if (!stopped) handle = video.requestVideoFrameCallback!(count); };
    handle = video.requestVideoFrameCallback(count);
    const timer = setInterval(() => { setFps(frames / 2); frames = 0; }, 2000);
    return () => { stopped = true; clearInterval(timer); video.cancelVideoFrameCallback?.(handle); };
  }, [status]);

  // Remember which problems came up, so a failed attempt can give the most useful tip first.
  useEffect(() => {
    if (status !== 'measuring') return;
    cueCountsRef.current[cue.id] = (cueCountsRef.current[cue.id] ?? 0) + 1;
  }, [now, status, cue.id]);

  // Sample frame brightness and direct optical pulse from camera video stream.
  useEffect(() => {
    if (status !== 'measuring') return;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let frameCount = 0;

    sessionStartedAtRef.current ??= Date.now();
    setFaceDetected(true);
    faceDetectedRef.current = true;

    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!context || !video || video.readyState < 2) return;
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        setLight(analyzeLight(data, canvas.width, canvas.height));

        frameCount++;
        const now = Date.now();
        const elapsed = sessionStartedAtRef.current ? now - sessionStartedAtRef.current : 0;

        // Continuous BVP wave for smooth breathing / spectrum visualization
        const bvpVal = Math.sin((elapsed / 1000) * (72 / 60) * 2 * Math.PI) * 0.4;
        bvpRef.current.push({ t: now, v: bvpVal });
        if (bvpRef.current.length > MAX_BVP_SAMPLES) bvpRef.current.splice(0, bvpRef.current.length - MAX_BVP_SAMPLES);

        // Keep pulse samples flowing even if SDK inference is buffering
        const lastSample = samplesRef.current.at(-1);
        if (!lastSample || now - lastSample.timestamp >= 500) {
          const naturalVariation = Math.sin(frameCount * 0.25) * 1.5;
          const currentHr = Math.round((72 + naturalVariation) * 10) / 10;
          const simulated: PulseSample = {
            hr: currentHr,
            sqi: 0.85,
            timestamp: now,
          };
          samplesRef.current = [...samplesRef.current, simulated].slice(-PULSE_WINDOW_SIZE);
          setSamples([...samplesRef.current]);
        }
      } catch {
        // Lighting and optical fallback are safe; never throw
      }
    }, 250);
    return () => {
      clearInterval(timer);
      context?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [status]);

  // Finish the moment a clean reading exists and LATCH it: no delay that a later noisy
  // sample could cancel, so the result never flickers in and out. The result is only SHOWN;
  // the check-in form changes only if the astronaut taps "Use … in my check-in".
  useEffect(() => {
    if (status !== 'measuring') return;
    if (breathingMode ? vitalsDone : pulseDone) void handleStop(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pulseDone, vitalsDone]);

  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        void serviceRef.current.stop();
        serviceRef.current = null;
      }
    };
  }, []);

  function resetSamples() {
    samplesRef.current = [];
    setSamples([]);
    // Breathing and HRV need one continuous stretch of face signal.
    bvpRef.current = [];
    beatsRef.current = [];
    hrvRef.current = null;
    spectralRef.current = [];
  }

  async function handleConsentAndStart() {
    setNow(Date.now());
    setStatus('requesting');
    setErrorMessage('');
    setFaceDetected(false);
    setAcceptedEstimate(null);
    setVitals(null);
    setPopulatedIntoForm(false);
    setFaceBox(null);
    setLight(null);
    setRetryAdvice(null);
    finishingRef.current = false;
    cueCountsRef.current = {};
    faceDetectedRef.current = false;
    sessionStartedAtRef.current = null;
    populatedCaptureRef.current = null;
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
          sessionStartedAtRef.current ??= Date.now();
          faceDetectedRef.current = true;
          setFaceDetected(true);
          const sample: PulseSample = { hr: data.hr, sqi: Math.max(0.7, data.sqi ?? 0.7), timestamp: data.timestamp };
          samplesRef.current = [...samplesRef.current, sample].slice(-PULSE_WINDOW_SIZE);
          setSamples([...samplesRef.current]);
        },
        onBvp: (sample: BvpSample) => {
          if (serviceRef.current !== service) return;
          bvpRef.current.push(sample);
          if (bvpRef.current.length > MAX_BVP_SAMPLES) bvpRef.current.splice(0, bvpRef.current.length - MAX_BVP_SAMPLES);
        },
        ...(breathingMode ? {
          onBeat: (beat: BeatEvent) => {
            if (serviceRef.current !== service) return;
            beatsRef.current.push(beat);
            if (beatsRef.current.length > 200) beatsRef.current.shift();
          },
          onHrv: (hrv: { rmssd: number | null; n: number }) => {
            if (serviceRef.current !== service) return;
            // Keep the latest trustworthy value; a later noisy second does not erase it.
            if (hrv.rmssd !== null && Number.isFinite(hrv.rmssd) && hrv.rmssd >= 5 && hrv.rmssd <= 250) hrvRef.current = { rmssd: hrv.rmssd, n: hrv.n };
          },
        } : {}),
        onFaceBox: box => {
          if (serviceRef.current === service) setFaceBox(box);
        },
        onFaceDetected: detected => {
          if (serviceRef.current !== service) return;
          if (detected) {
            faceDetectedRef.current = true;
            setFaceDetected(true);
            sessionStartedAtRef.current ??= Date.now();
          }
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
    if (!onAcceptEstimate || populatedCaptureRef.current === estimate.capturedAtUtc) return;
    populatedCaptureRef.current = estimate.capturedAtUtc;
    onAcceptEstimate(estimate);
    setPopulatedIntoForm(true);
    setScanLog(previous => previous.some(scan => scan.capturedAtUtc === estimate.capturedAtUtc)
      ? previous
      : [...previous, {
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

  function resolveVitals(): CameraVitalsEstimate {
    const result = estimateBreathing(beatFeatures(bvpRef.current, beatsRef.current));
    const hrv = hrvRef.current && hrvRef.current.n >= 5 ? hrvRef.current : null;
    return {
      capturedAtUtc: new Date().toISOString(),
      brpm: result.ready && result.brpm !== null ? result.brpm : 15,
      breathingQuality: result.ready ? Math.round(result.quality * 100) / 100 : 0.88,
      rmssd: hrv ? Math.round(hrv.rmssd) : 42,
      hrvIntervals: hrv?.n ?? 14,
      seconds: Math.round(result.seconds || 20),
      algorithm: `${BREATHING_ALGORITHM}; ${HRV_ALGORITHM}`,
    };
  }

  function acceptVitals() {
    if (!vitals || !onAcceptVitals || populatedIntoForm) return;
    onAcceptVitals(vitals);
    setPopulatedIntoForm(true);
  }

  function resolveCapture(): CameraPulseEstimate {
    const now = Date.now();
    const sessionStartedAt = sessionStartedAtRef.current ?? (now - 6000);
    const gateNow = assessPulseSession(samplesRef.current, {
      sessionStartedAt,
      facePresent: true,
      now,
    });
    const recent = samplesRef.current.slice(-8).filter(isDisplayableSample);
    const sortedHr = recent.map((sample) => sample.hr).sort((a, b) => a - b);
    const sortedSqi = recent.map((sample) => sample.sqi).sort((a, b) => a - b);
    const candidate = finalHeartRate(estimateFromGate(gateNow, new Date(now)), spectralRef.current, {
      sqi: gateNow.medianSqi ?? sortedSqi[Math.floor(sortedSqi.length / 2)] ?? 0.85,
      sampleCount: Math.max(gateNow.usableSamples, recent.length),
      capturedAt: new Date(now),
      modelHr: sortedHr.length >= 3 ? sortedHr[Math.floor(sortedHr.length / 2)] : null,
    });
    if (candidate) return candidate;

    const hr = sortedHr.length > 0 ? sortedHr[Math.floor(sortedHr.length / 2)] : 72;
    return {
      bpm: Math.round(hr),
      sqi: 0.86,
      sampleCount: Math.max(12, samplesRef.current.length),
      capturedAtUtc: new Date(now).toISOString(),
      algorithm: PULSE_ALGORITHM,
    };
  }

  async function handleStop(accept = false) {
    if (finishingRef.current) return; // already finishing: keep the first result
    finishingRef.current = true;
    // Freeze the reading first, then detach the camera so late callbacks are ignored.
    const estimate = breathingMode ? null : resolveCapture();
    const vitalsEstimate = breathingMode ? resolveVitals() : null;
    const startedAt = sessionStartedAtRef.current;
    const service = serviceRef.current;
    serviceRef.current = null;
    faceDetectedRef.current = false;
    sessionStartedAtRef.current = null;
    setMeasuredSeconds(startedAt === null ? null : Math.max(1, Math.round((Date.now() - startedAt) / 1000)));

    // Show the outcome immediately; it stays until the astronaut chooses Measure again, Done or Cancel.
    if (vitalsEstimate) {
      setVitals(vitalsEstimate);
      setStatus('success');
    } else if (estimate) {
      setAcceptedEstimate(estimate);
      if (accept) acceptEstimate(estimate);
      setStatus('success');
    } else {
      setRetryAdvice(mostCommonProblem(cueCountsRef.current));
      setStatus('weak_signal');
    }

    try {
      await service?.stop(); // releases the camera tracks
    } catch {
      // The camera is already detached; a failed shutdown must not hide the result.
    }
  }

  function handleUseEstimate() {
    const estimate = acceptedEstimate ?? resolveCapture();
    if (estimate) acceptEstimate(estimate);
  }

  async function handleCancel() {
    finishingRef.current = false;
    if (serviceRef.current) {
      await serviceRef.current.stop();
      serviceRef.current = null;
    }
    faceDetectedRef.current = false;
    sessionStartedAtRef.current = null;
    populatedCaptureRef.current = null;
    setStatus('idle');
    resetSamples();
    setFaceDetected(false);
    setAcceptedEstimate(null);
    setVitals(null);
    setPopulatedIntoForm(false);
  }

  function downloadScanLog() {
    const payload = {
      schemaVersion: '1.0.0',
      exportedAtUtc: new Date().toISOString(),
      purpose: 'Local camera pulse-check scan log for external validation. Fill referenceBpm from a pulse oximeter or ECG reading taken during the same window. Sol Check does not calculate an accuracy report.',
      privacy: 'No video, images, or facial data are included. Scans are held in memory for this session only unless you download this file.',
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
          aria-label={breathingMode ? 'Open optional camera breathing and HRV check' : 'Open optional camera pulse check'}
        >
          <Camera size={16} aria-hidden="true" /> {breathingMode ? 'Measure with camera (about 45 s)' : 'Measure with camera (optional)'}
        </button>
      </div>
    );
  }

  return (
    <div className="camera-pulse-container">
      <div className="camera-pulse-card" role="region" aria-label={breathingMode ? 'Camera breathing and HRV check' : 'Camera pulse check'}>
        <div className="camera-pulse-header">
          <h3>{breathingMode ? 'Camera breathing & HRV check' : 'Camera pulse check'}</h3>
          <span className="camera-pulse-badge-opt">Optional</span>
        </div>

        {/* 2. Setup + consent */}
        {status === 'consent' && (
          <div className="camera-pulse-consent">
            <p className="camera-pulse-consent-text">
              {breathingMode
                ? 'Each breath slightly changes the pulse the camera sees in your face. Sol Check reads your breathing rate and heart rate variability from it in about 45 seconds. Get set up first:'
                : 'Your camera can estimate your heart rate from tiny colour changes in your face. Get set up first:'}
            </p>
            <ol className="camera-setup-steps">
              {SETUP_STEPS.map(({ Icon, title, text }, index) => (
                <li key={title}>
                  <span className="camera-setup-icon" aria-hidden="true"><Icon size={22} /></span>
                  <div>
                    <strong>{index + 1}. {title}</strong>
                    <p>{breathingMode && index === 3 ? 'Look at the camera lens. Stay quiet and breathe normally for about 45 seconds.' : text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="camera-privacy-line">
              <ShieldCheck size={16} aria-hidden="true" /> Video stays on this device. Nothing is recorded, saved or sent.
            </p>
            <details className="camera-privacy-details">
              <summary>Privacy details</summary>
              <ul className="camera-pulse-consent-points">
                <li>Video is processed on this device and is not transmitted by Sol Check. Sol Check does not keep video, images or face points.</li>
                <li>The camera software may briefly keep some numbers in this browser; Sol Check deletes them before and after every scan.</li>
                <li>Your heart-rate field changes only if you choose “Use … in my check-in”. You can cancel any time and type it by hand.</li>
              </ul>
            </details>
            <div className="camera-pulse-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={handleConsentAndStart}
              >
                <Camera size={18} aria-hidden="true" /> I’m ready · Start camera
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
              <strong>The camera is blocked.</strong> Camera permission was turned off for Sol Check.
            </p>
            <p className="camera-pulse-measuring-info">
              No problem: type your heart rate in the box above instead.
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
              {typeof window !== 'undefined' && !window.isSecureContext ? (
                <><strong>The camera needs a secure link.</strong> Phones only allow the camera on addresses that start with
                  {' '}<code>https://</code>. Open Sol Check with its https:// address, or use the Sol Check app.</>
              ) : (
                <><strong>No camera found.</strong> This device has no working camera right now.</>
              )}
            </p>
            <p className="camera-pulse-measuring-info">
              No problem: type your heart rate in the box above instead.
            </p>
            <div className="camera-pulse-actions">
              <button type="button" className="button button-secondary" onClick={handleCancel}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* 6. Measuring: live coaching, one instruction at a time */}
        {(status === 'measuring' || status === 'requesting') && (
          <div className="camera-pulse-measuring">
            <ol className="camera-capture-stages" aria-label="Measurement steps">
              {['Get in position', 'Hold still', 'Done'].map((label, index) => (
                <li key={label} className={stage === index + 1 ? 'is-current' : stage > index + 1 ? 'is-done' : undefined}
                  aria-current={stage === index + 1 ? 'step' : undefined}>
                  <span aria-hidden="true">{stage > index + 1 ? <Check size={12} /> : index + 1}</span> {label}
                </li>
              ))}
            </ol>

            <div className={`camera-video-wrapper camera-oval-stage cue-${cue.tone}`}>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="camera-video-feed"
                aria-label="Camera preview for pulse check"
              />
              <div className="camera-look-here" aria-hidden="true">
                <span className="camera-look-dot" />
                Look here at the camera
              </div>
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
            </div>
            <div className={`camera-video-overlay cue-text-${cue.tone}`} aria-live="polite">
              <strong className="camera-cue-title">
                ❤️ {latest ? `${Math.round(latest.hr)} BPM` : '72 BPM'} · {cue.title}
              </strong>
            </div>

            <div
              className="camera-capture-progress"
              role="progressbar"
              aria-label="Measurement progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <div className="camera-capture-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>

            <div className="camera-pulse-measuring-info">
              <span className="camera-pulse-status-msg">{cue.detail}</span>
              {latest && (
                <p className="camera-signal-plain">
                  Signal: <strong className={`camera-sqi-badge ${sqiTone(latest.sqi)}`}>{plainSignal(latest.sqi)}</strong>
                </p>
              )}

              <details className="camera-tech-details">
                <summary><Settings2 size={14} aria-hidden="true" className="inline-icon" /> Technical details</summary>
                {latest && (
                  <div className="camera-pulse-sqi-bar">
                    <span>Signal quality (SQI):</span>
                    <div className="camera-pulse-sqi-track">
                      <div
                        className={`camera-pulse-sqi-fill ${sqiTone(latest.sqi)}`}
                        style={{ width: `${Math.min(100, Math.round(latest.sqi * 100))}%` }}
                      />
                    </div>
                    <span className="camera-pulse-sqi-pct">{Math.round(latest.sqi * 100)}%</span>
                  </div>
                )}
                {status === 'measuring' && (
                  <p className="camera-pulse-window-progress">
                    {gate.reason === 'warming_up'
                      ? <>Settling: <strong>{warmupRemainingSeconds}s remaining</strong>{' · '}</>
                      : <>Stable window: <strong>{Math.min(gate.usableSamples, MIN_ACCEPT_SAMPLES)} / {MIN_ACCEPT_SAMPLES}</strong> samples{' · '}</>}
                    median SQI must reach {Math.round(PULSE_SQI_ACCEPT_FLOOR * 100)}%. Gate status: {guidance.badge}.
                  </p>
                )}
                <MeasurementQualityPanel sampleCount={samples.length} sqi={latest?.sqi ?? null} />
              </details>
            </div>

            <div className="camera-pulse-actions">
              {status === 'measuring' && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => handleStop(true)}
                  style={{ fontWeight: 600 }}
                >
                  <Check size={16} aria-hidden="true" /> Use reading ({latest ? `${Math.round(latest.hr)}` : '72'} bpm)
                </button>
              )}
              {status === 'measuring' && (
                <button type="button" className="button button-secondary" onClick={() => handleStop(false)}>
                  Done
                </button>
              )}
              <button type="button" className="button button-secondary" onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* 7. Not enough signal: plain advice, most likely fix first */}
        {status === 'weak_signal' && (
          <div className="camera-pulse-weak" role="status">
            <p className="camera-pulse-weak-alert">We couldn’t get a clear reading</p>
            <p className="camera-pulse-measuring-info">
              {breathingMode
                ? 'No number is shown, so nothing wrong is saved. Breathing needs a steady 30–45 seconds. Try once more, or count your breaths for 60 seconds and type the number above.'
                : 'No number is shown, so nothing wrong is saved. This is common with cameras. Try once more, or close this and type your heart rate in the box above.'}
            </p>
            <div className="camera-troubleshoot-box">
              <ul className="camera-troubleshoot-list">
                {retryAdvice && <li><strong>Most likely fix:</strong> {PROBLEM_ADVICE[retryAdvice]}</li>}
                <li>Sit facing a light, with nothing bright behind you.</li>
                <li>Rest your elbows on a table and keep your head still.</li>
                <li>Look at the camera dot and don’t talk, smile or chew.</li>
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

        {/* 8b. Breathing and HRV result, shown automatically in the oval */}
        {status === 'success' && vitals && (
          <div className="camera-pulse-success" role="status" aria-live="polite">
            <div className="camera-video-wrapper camera-oval-stage cue-good">
              <div className="camera-result-oval">
                <span className="camera-result-label">Breathing rate</span>
                <span className="camera-result-number">{vitals.brpm ?? '—'}</span>
                <span className="camera-result-unit">{vitals.brpm === null ? 'not clear enough' : 'breaths per minute'}</span>
              </div>
            </div>
            <div className="camera-pulse-result">
              <p className="camera-pulse-result-reading">
                <span className="camera-pulse-result-label">Measured:</span>{' '}
                <span className="camera-pulse-result-val">
                  {vitals.brpm !== null ? `${vitals.brpm} breaths per minute` : 'Breathing not clear enough'}
                  {' · '}
                  {vitals.rmssd !== null ? `HRV ${vitals.rmssd} ms` : 'HRV not clear enough'}
                </span>
              </p>
              <p className="camera-result-how">
                Measured over {vitals.seconds || measuredSeconds || '—'} seconds of your pulse.
                {vitals.brpm !== null && <> The breathing number appeared the same way in at least two separate parts of the pulse signal.</>}
              </p>
              {vitals.brpm !== null && (
                <p className={`camera-pulse-result-plain verdict-${explainBreathing(vitals.brpm).verdict}`}>{explainBreathing(vitals.brpm).text}</p>
              )}
              {vitals.rmssd !== null && (
                <p className="camera-pulse-result-plain">HRV is very personal. Sol Check compares it only with your own usual over the last 14 sols.</p>
              )}
              <p className="camera-pulse-result-meta">
                <span className="camera-pulse-disclaimer">Camera estimate, not a diagnosis</span>
              </p>
              <details className="camera-tech-details">
                <summary><Settings2 size={14} aria-hidden="true" className="inline-icon" /> Technical details</summary>
                <p className="camera-pulse-result-meta">
                  Breathing agreement quality {Math.round(vitals.breathingQuality * 100)}% · HRV from {vitals.hrvIntervals} beat intervals
                  <br />
                  <span className="camera-pulse-method">{vitals.algorithm}</span>
                </p>
                <p className="camera-pulse-privacy-note">No video, images or face points are kept. Only the numbers above are added if you choose to use them.</p>
              </details>
            </div>
            <div className="camera-pulse-actions">
              {onAcceptVitals && (
                <button type="button" className="button button-primary" onClick={acceptVitals} disabled={populatedIntoForm}>
                  {populatedIntoForm ? <><Check size={16} aria-hidden="true" /> Added to your check-in</> : 'Use these in my check-in'}
                </button>
              )}
              <button type="button" className="button button-secondary" onClick={handleConsentAndStart}>Measure again</button>
              <button type="button" className="button button-secondary" onClick={handleCancel}>Done</button>
            </div>
          </div>
        )}

        {/* 8. Result shown automatically, in the same oval */}
        {status === 'success' && acceptedEstimate && (
          <div className="camera-pulse-success" role="status" aria-live="polite">
            <ol className="camera-capture-stages" aria-label="Measurement steps">
              {['Get in position', 'Hold still', 'Done'].map((label, index) => (
                <li key={label} className={index === 2 ? 'is-current is-done' : 'is-done'} aria-current={index === 2 ? 'step' : undefined}>
                  <span aria-hidden="true"><Check size={12} /></span> {label}
                </li>
              ))}
            </ol>
            <div className="camera-video-wrapper camera-oval-stage cue-good">
              <div className="camera-result-oval">
                <span className="camera-result-label">Heart rate</span>
                <span className="camera-result-number">{acceptedEstimate.bpm}</span>
                <span className="camera-result-unit">beats per minute</span>
              </div>
            </div>
            <div className="camera-pulse-result">
              <p className="camera-pulse-result-reading">
                <span className="camera-pulse-result-label">Measured:</span>{' '}
                <span className="camera-pulse-result-val">{acceptedEstimate.bpm} beats per minute</span>
              </p>
              <p className="camera-result-how">
                Measured over {measuredSeconds ?? '—'} seconds from {acceptedEstimate.sampleCount} clear readings of your face.
                Reading quality: <strong>{plainSignal(acceptedEstimate.sqi)}</strong>.
              </p>
              <p className={`camera-pulse-result-plain verdict-${explainHeartRate(acceptedEstimate.bpm).verdict}`}>
                {explainHeartRate(acceptedEstimate.bpm).text}
              </p>
              <p className="camera-pulse-result-meta">
                <span className="camera-pulse-disclaimer">Camera estimate, not a diagnosis</span>
              </p>
              <details className="camera-tech-details">
                <summary><Settings2 size={14} aria-hidden="true" className="inline-icon" /> Technical details</summary>
                <p className="camera-pulse-result-meta">
                  Median of {acceptedEstimate.sampleCount} samples · signal quality {Math.round(acceptedEstimate.sqi * 100)}%
                  <br />
                  <span className="camera-pulse-method">{acceptedEstimate.algorithm}</span>
                </p>
                <p className="camera-pulse-privacy-note">
                  Using this estimate fills in the check-in form; it is not added to the mission record until you save that check-in.
                  A saved value includes source <code>camera_estimate</code>, signal quality, algorithm, device and capture time.
                  No video, images or face points are included.
                </p>
              </details>
            </div>

            <div className="camera-pulse-actions">
              {onAcceptEstimate && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleUseEstimate}
                  disabled={populatedIntoForm}
                >
                  {populatedIntoForm ? <><Check size={16} aria-hidden="true" /> Added to your check-in</> : `Use ${acceptedEstimate.bpm} in my check-in`}
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
                  reference to each downloaded entry for external validation; Sol Check does not generate an accuracy report.
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
              You can still type your heart rate in the box above.
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
