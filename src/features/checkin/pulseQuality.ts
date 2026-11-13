import type { MeasurementCapture } from '../../contracts';

/**
 * Signal-quality gate for the optional camera pulse check.
 *
 * The SDK reports a heart-rate estimate plus a signal-quality index (SQI) for
 * every processed frame batch. A single good sample is not evidence: the first
 * samples in a scan are calibration artefacts, and one lucky frame can pass a
 * low threshold. This gate therefore requires a stable window (at least
 * MIN_ACCEPT_SAMPLES usable samples) and a median SQI at or above
 * PULSE_SQI_ACCEPT_FLOOR before any number may be shown or accepted.
 *
 * The thresholds are product heuristics, not clinically validated cut-offs.
 * They are deliberately stricter than the SDK's own 0.38 display floor, which
 * only indicates that a waveform was found, not that it is stable.
 */
export const PULSE_SQI_DISPLAY_FLOOR = 0.38;
export const PULSE_SQI_ACCEPT_FLOOR = 0.55;
export const MIN_ACCEPT_SAMPLES = 5;
export const PULSE_WINDOW_SIZE = 12;
export const PULSE_MIN_SESSION_MS = 15_000;
export const PULSE_MAX_SAMPLE_AGE_MS = 2_500;
export const PULSE_MAX_SAMPLE_GAP_MS = 2_500;
export const PHYSIOLOGIC_HR_MIN = 40;
export const PHYSIOLOGIC_HR_MAX = 200;

export const PULSE_ALGORITHM = 'vitalcamera-sdk · PSD + SQI TFLite models (local inference)';
export const PULSE_DEVICE = 'browser webcam · on-device WebAssembly';

export interface PulseSample {
  hr: number;
  sqi: number;
  timestamp: number;
}

export type PulseGateReason =
  | 'collecting'
  | 'warming_up'
  | 'face_lost'
  | 'stale'
  | 'weak_signal'
  | 'implausible'
  | 'ready';

export interface PulseSessionContext {
  sessionStartedAt: number;
  facePresent: boolean;
  now: number;
}

export interface PulseGateResult {
  ready: boolean;
  /** Null until the window is ready. A failed gate never yields a number. */
  medianHr: number | null;
  medianSqi: number | null;
  usableSamples: number;
  windowSize: number;
  reason: PulseGateReason;
}

export interface CameraPulseEstimate {
  bpm: number;
  sqi: number;
  capturedAtUtc: string;
  sampleCount: number;
  algorithm: string;
}

const EMPTY_GATE: PulseGateResult = {
  ready: false,
  medianHr: null,
  medianSqi: null,
  usableSamples: 0,
  windowSize: PULSE_WINDOW_SIZE,
  reason: 'collecting',
};

/** Median of a numeric sample, averaging the middle pair for even lengths. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median requires at least one value');
  const sorted = [...values].sort((left, right) => left - right);
  const center = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[center]
    : sorted[center - 1] / 2 + sorted[center] / 2;
}

function isUsable(sample: PulseSample): boolean {
  return Number.isFinite(sample.hr)
    && Number.isFinite(sample.sqi)
    && sample.hr >= PHYSIOLOGIC_HR_MIN
    && sample.hr <= PHYSIOLOGIC_HR_MAX
    && sample.sqi >= 0
    && sample.sqi <= 1
    && Number.isFinite(sample.timestamp);
}

/**
 * Evaluate the rolling pulse window. Deterministic and side-effect free so the
 * acceptance rule can be tested without a camera.
 */
export function assessPulseSamples(samples: readonly PulseSample[]): PulseGateResult {
  const window = samples.slice(-PULSE_WINDOW_SIZE);
  if (window.length === 0) return EMPTY_GATE;

  const usable = window.filter(isUsable);
  if (usable.length === 0) {
    return { ...EMPTY_GATE, reason: 'implausible' };
  }

  const medianHr = median(usable.map(sample => sample.hr));
  const medianSqi = median(usable.map(sample => sample.sqi));
  const base = {
    medianHr: null,
    medianSqi,
    usableSamples: usable.length,
    windowSize: PULSE_WINDOW_SIZE,
  };

  if (usable.length < MIN_ACCEPT_SAMPLES) {
    return { ...base, ready: false, reason: 'collecting' };
  }
  if (medianSqi < PULSE_SQI_ACCEPT_FLOOR) {
    return { ...base, ready: false, reason: 'weak_signal' };
  }

  return {
    ready: true,
    medianHr,
    medianSqi,
    usableSamples: usable.length,
    windowSize: PULSE_WINDOW_SIZE,
    reason: 'ready',
  };
}

export function assessPulseSession(
  samples: readonly PulseSample[],
  context: PulseSessionContext,
): PulseGateResult {
  if (!context.facePresent) return { ...EMPTY_GATE, reason: 'face_lost' };

  const window = samples.slice(-PULSE_WINDOW_SIZE);
  if (window.length === 0) return EMPTY_GATE;

  const gate = assessPulseSamples(window);
  const notReady = (reason: PulseGateReason): PulseGateResult => ({
    ...gate,
    ready: false,
    medianHr: null,
    reason,
  });

  if (!Number.isFinite(context.now) || !Number.isFinite(context.sessionStartedAt)) {
    return notReady('stale');
  }
  if (context.now - context.sessionStartedAt < PULSE_MIN_SESSION_MS) {
    return notReady('warming_up');
  }

  const latest = window[window.length - 1];
  if (window.some(sample =>
    sample.timestamp < context.sessionStartedAt
    || sample.timestamp > context.now
    || !Number.isFinite(sample.timestamp))) {
    return notReady('stale');
  }
  if (context.now - latest.timestamp > PULSE_MAX_SAMPLE_AGE_MS) {
    return notReady('stale');
  }
  for (let index = 1; index < window.length; index += 1) {
    const gap = window[index].timestamp - window[index - 1].timestamp;
    if (gap < 0 || gap > PULSE_MAX_SAMPLE_GAP_MS) return notReady('stale');
  }

  const recent = window.slice(-MIN_ACCEPT_SAMPLES);
  if (recent.length < MIN_ACCEPT_SAMPLES) return notReady('collecting');
  if (recent.some(sample => !isUsable(sample))) return notReady('collecting');
  return gate;
}

export function isPhysiologicHeartRate(hr: number): boolean {
  return Number.isFinite(hr) && hr >= PHYSIOLOGIC_HR_MIN && hr <= PHYSIOLOGIC_HR_MAX;
}

/**
 * Build the provenance record written onto the check-in measurement when the
 * user explicitly accepts a camera estimate. Returns null when the gate is not
 * ready, so no capture metadata can ever accompany an untrusted number.
 */
export function cameraCaptureFromGate(
  gate: PulseGateResult,
  capturedAtUtc: Date,
): MeasurementCapture | null {
  if (!gate.ready || gate.medianHr === null || gate.medianSqi === null) return null;
  if (!isPhysiologicHeartRate(gate.medianHr)) return null;
  return {
    capturedAtUtc: capturedAtUtc.toISOString(),
    source: 'camera_estimate',
    status: 'accepted',
    signalQuality: Math.round(gate.medianSqi * 1000) / 1000,
    algorithm: PULSE_ALGORITHM,
    device: PULSE_DEVICE,
    synthetic: false,
  };
}

export function estimateFromGate(
  gate: PulseGateResult,
  capturedAt: Date,
): CameraPulseEstimate | null {
  const capture = cameraCaptureFromGate(gate, capturedAt);
  if (!capture || gate.medianHr === null || gate.medianSqi === null) return null;
  return {
    bpm: Math.round(gate.medianHr),
    sqi: gate.medianSqi,
    capturedAtUtc: capturedAt.toISOString(),
    sampleCount: gate.usableSamples,
    algorithm: PULSE_ALGORITHM,
  };
}

/** True when the latest sample is good enough to render as "usable" in the UI. */
export function isDisplayableSample(sample: PulseSample): boolean {
  return isUsable(sample) && sample.sqi >= PULSE_SQI_DISPLAY_FLOOR;
}
