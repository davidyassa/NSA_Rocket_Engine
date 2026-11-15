/**
 * Respiratory signal-quality engine (pure). Separate indicators for video, ROI,
 * tracking and signal, combined into the final confidence. An algorithm that ran
 * is not a measurement that can be trusted: any hard gate below forces POOR or
 * INSUFFICIENT even when the rate looks plausible.
 *
 * The thresholds are engineering limits for this camera pipeline, chosen and checked
 * on synthetic ground truth (RESPIRATORY_VALIDATION_REPORT.md). They are not clinical.
 */
import type { QualityIndicator, QualityState } from './types';

export const GATES = {
  minDurationS: 20,
  minCycles: 3,
  maxArtifactFraction: 0.4,
  minBrightness: 35,
  maxBrightness: 225,
  minContrast: 10,
  minFps: 8,
  minRoiPx: 600,
  minSnrDb: 0,
  maxInternalSpreadBrpm: 3,
} as const;

export function stateFor(score: number): QualityState {
  if (score >= 0.75) return 'GOOD';
  if (score >= 0.5) return 'ACCEPTABLE';
  if (score >= 0.25) return 'POOR';
  return 'INSUFFICIENT';
}

const RANK: Record<QualityState, number> = { GOOD: 3, ACCEPTABLE: 2, POOR: 1, INSUFFICIENT: 0 };
export const atLeast = (q: QualityIndicator | QualityState, min: QualityState) => RANK[typeof q === 'string' ? q : q.state] >= RANK[min];
export const worst = (...states: QualityState[]) => states.reduce((a, b) => (RANK[a] <= RANK[b] ? a : b));

/** Clamp a ramp: 0 at `bad`, 1 at `good` (either direction). */
export const ramp = (value: number, bad: number, good: number) => Math.max(0, Math.min(1, (value - bad) / (good - bad)));

function indicator(score: number, reasons: string[], cap?: QualityState): QualityIndicator {
  let state = stateFor(score);
  if (cap && RANK[cap] < RANK[state]) state = cap;
  return { state, score: Math.max(0, Math.min(1, score)), reasons };
}

export interface VideoStats { brightness: number; contrast: number; fps: number; intervalCv: number; gapFraction: number }
export function videoQuality(v: VideoStats): QualityIndicator {
  const reasons: string[] = [];
  const light = v.brightness < GATES.minBrightness ? (reasons.push('Too dark: add light in front of you.'), 0)
    : v.brightness > GATES.maxBrightness ? (reasons.push('Too bright: avoid light behind or on the camera.'), 0) : 1;
  const contrast = ramp(v.contrast, GATES.minContrast * 0.5, GATES.minContrast * 2);
  if (contrast < 0.5) reasons.push('Low contrast: the image is flat or washed out.');
  const fps = ramp(v.fps, GATES.minFps * 0.6, 20);
  if (v.fps < GATES.minFps) reasons.push(`The camera delivered only ${v.fps.toFixed(0)} frames per second.`);
  const timing = 1 - ramp(v.intervalCv, 0.15, 0.8) * 0.5 - ramp(v.gapFraction, 0.01, 0.15) * 0.5;
  if (v.gapFraction > 0.05) reasons.push('Frames were dropped or the camera paused.');
  const score = Math.min(light, 0.4 + 0.6 * contrast) * (0.5 + 0.5 * fps) * timing;
  return indicator(score, reasons, light === 0 || v.fps < GATES.minFps ? 'POOR' : undefined);
}

export interface RoiStats { pixels: number; texture: number; inFrame: number }
export function roiQuality(r: RoiStats): QualityIndicator {
  const reasons: string[] = [];
  const size = ramp(r.pixels, GATES.minRoiPx * 0.5, GATES.minRoiPx * 3);
  if (r.pixels < GATES.minRoiPx) reasons.push('The chest area is too small: sit closer or show more of your upper body.');
  const texture = ramp(r.texture, 0.1, 0.6);
  if (r.texture < 0.3) reasons.push('Plain clothing gives the tracker little to follow; a patterned top helps.');
  const inFrame = ramp(r.inFrame, 0.6, 0.95);
  if (r.inFrame < 0.9) reasons.push('Part of the chest area is outside the picture.');
  const score = size * (0.5 + 0.5 * texture) * inFrame;
  return indicator(score, reasons, r.pixels < GATES.minRoiPx * 0.5 ? 'INSUFFICIENT' : undefined);
}

export interface TrackingStats { flowFraction: number; profileFraction: number; droppedFraction: number; keptRatio: number; fbError: number; consistency: number }
export function trackingQuality(t: TrackingStats): QualityIndicator {
  const reasons: string[] = [];
  const coverage = 1 - t.droppedFraction;
  if (t.droppedFraction > 0.1) reasons.push('The chest could not be followed in some frames.');
  if (t.profileFraction > 0.3) reasons.push('Few trackable points: using the backup motion profile.');
  const method = t.flowFraction + 0.7 * t.profileFraction;
  const kept = ramp(t.keptRatio, 0.3, 0.85);
  const fb = 1 - ramp(t.fbError, 0.15, 0.45);
  const consistency = ramp(t.consistency, 0.3, 0.8);
  if (t.consistency < 0.5 && t.flowFraction > 0.5) reasons.push('Tracked points moved inconsistently (body movement or loose clothing).');
  const score = coverage * method * (0.4 + 0.2 * kept + 0.2 * fb + 0.2 * consistency);
  return indicator(score, reasons, coverage < 0.6 ? 'INSUFFICIENT' : undefined);
}

export interface SignalStats { durationS: number; snrDb: number; prominence: number; periodicity: number; artifactFraction: number; cycles: number; internalSpreadBrpm: number }
export function signalQuality(s: SignalStats): QualityIndicator {
  const reasons: string[] = [];
  if (s.durationS < GATES.minDurationS) reasons.push(`Need at least ${GATES.minDurationS} seconds of steady breathing.`);
  if (s.cycles < GATES.minCycles) reasons.push('Too few complete breaths were seen.');
  if (s.artifactFraction > 0.15) reasons.push('Body movement interrupted the measurement.');
  if (s.snrDb < 3) reasons.push('The breathing signal is weak compared with the noise.');
  if (s.periodicity < 0.4) reasons.push('Breathing did not look regular enough to measure.');
  if (s.internalSpreadBrpm > 3) reasons.push('Different ways of reading the signal disagree.');
  const snr = ramp(s.snrDb, GATES.minSnrDb, 9);
  const prom = ramp(s.prominence, 1.2, 4);
  const periodic = ramp(s.periodicity, 0.25, 0.7);
  const clean = 1 - ramp(s.artifactFraction, 0.05, GATES.maxArtifactFraction);
  const agree = 1 - ramp(s.internalSpreadBrpm, 1.5, 5);
  const length = ramp(s.durationS, GATES.minDurationS * 0.75, 40);
  const score = (0.3 * snr + 0.15 * prom + 0.3 * periodic + 0.25 * agree) * clean * (0.6 + 0.4 * length);
  const hard = s.durationS < GATES.minDurationS || s.cycles < GATES.minCycles || s.artifactFraction > GATES.maxArtifactFraction;
  // Spectrum, autocorrelation and cycle count agree within a fraction of a breath on
  // real breathing; integrated tracking noise (a random walk) does not. Disagreement
  // is therefore a hard cap, not just a lower score (see the no-breathing controls).
  const soft = s.snrDb < GATES.minSnrDb || s.internalSpreadBrpm > GATES.maxInternalSpreadBrpm;
  return indicator(score, reasons, hard ? 'INSUFFICIENT' : soft ? 'POOR' : undefined);
}

/** Final confidence: no better than the weakest stage, and pulled down by each. */
export function finalQuality(parts: QualityIndicator[], fusion: QualityIndicator): QualityIndicator {
  const all = [...parts, fusion];
  const score = Math.min(...all.map((q) => q.score)) * 0.6 + (all.reduce((s, q) => s + q.score, 0) / all.length) * 0.4;
  const cap = worst(...all.map((q) => q.state));
  const reasons = [...new Set(all.flatMap((q) => q.reasons))];
  return indicator(score, reasons, cap);
}
