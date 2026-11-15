/** Data contracts for the respiratory monitoring engine. */
import type { Cycle } from './dsp';

/** A rectangle as fractions (0–1) of the raw, un-mirrored camera frame. */
export interface NormRect { x: number; y: number; w: number; h: number }

export type RegionKind = 'chest' | 'abdomen';
export type SourceId = 'chest' | 'abdomen' | 'chest-profile' | 'pulse';

/**
 * Processing profiles, set by measured cost (see RESPIRATORY_VALIDATION_REPORT.md):
 *  - lightweight: chest only, 128 px working width, sparse flow (profile fallback only when texture is lost);
 *  - standard:    chest + abdomen, 192 px, sparse flow with profile fallback;
 *  - enhanced:    as standard at 256 px, plus a continuous 1D-profile chest source as an
 *                 independent motion estimate for fusion.
 */
export type ProcessingProfile = 'lightweight' | 'standard' | 'enhanced';
export const PROFILES: Record<ProcessingProfile, { width: number; maxCorners: number; regions: readonly RegionKind[]; profileSource: boolean }> = {
  lightweight: { width: 128, maxCorners: 20, regions: ['chest'], profileSource: false },
  standard: { width: 192, maxCorners: 32, regions: ['chest', 'abdomen'], profileSource: false },
  enhanced: { width: 256, maxCorners: 48, regions: ['chest', 'abdomen'], profileSource: true },
};

/** Quality states. Only GOOD and ACCEPTABLE produce a rate that may be saved. */
export type QualityState = 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'INSUFFICIENT';
export interface QualityIndicator {
  state: QualityState;
  /** 0–1, for ordering and display; not a health score */
  score: number;
  /** plain-language reasons for anything below GOOD */
  reasons: string[];
}

export interface SourceEstimate {
  id: SourceId;
  label: string;
  /** independent modality: the two torso regions are not independent of each other */
  modality: 'torso-motion' | 'face-pulse';
  brpm: number | null;
  quality: QualityIndicator;
  /** dominant spectral peak and its signal-to-noise ratio, when computed here */
  peakHz?: number | null;
  snrDb?: number;
  periodicity?: number;
}

export interface FusionResult {
  brpm: number | null;
  /** how the rate was formed, in words */
  method: string;
  confidence: QualityIndicator;
  used: SourceId[];
  rejected: { id: SourceId; reason: string }[];
  /** largest disagreement between accepted-quality sources, breaths/min */
  spreadBrpm: number;
}

/** A metric is observed, estimated, or unavailable — never silently filled in. */
export interface Metric {
  value: number | null;
  unit: string;
  kind: 'observed' | 'estimated' | 'unavailable';
  note?: string;
}

export interface RespiratoryMetrics {
  rate: Metric;
  cycleDuration: Metric;
  inspiration: Metric;
  expiration: Metric;
  ieRatio: Metric;
  /** breath-to-breath variation: coefficient of variation of cycle durations */
  regularity: Metric;
  /** standard deviation of breath-by-breath rate */
  variability: Metric;
  chestAmplitude: Metric;
  abdomenAmplitude: Metric;
  cycleCount: number;
}

/** What the engine is doing right now, for the "how it's measuring" line. */
export interface Strategy {
  sparseFlow: boolean;
  profileFallback: boolean;
  profileSource: boolean;
  cameraMotionCompensated: boolean;
  faceAnchoredRoi: boolean;
  pulse: 'active' | 'unavailable' | 'waiting';
  motionArtifact: boolean;
}

export interface RespiratoryResult {
  durationS: number;
  profile: ProcessingProfile;
  quality: { video: QualityIndicator; roi: QualityIndicator; tracking: QualityIndicator; signal: QualityIndicator; final: QualityIndicator };
  sources: SourceEstimate[];
  fusion: FusionResult;
  metrics: RespiratoryMetrics;
  waveform: { t: number[]; v: number[]; artifacts: [number, number][]; cycles: Cycle[] };
  strategy: Strategy;
  algorithm: string;
}
