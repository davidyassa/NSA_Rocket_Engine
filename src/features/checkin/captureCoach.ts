/**
 * Live coaching for the camera pulse check. Pure functions so the rules are
 * unit-tested. The UI shows ONE instruction at a time, the most important
 * problem first, in plain words (no medical or camera jargon).
 */
import { MIN_ACCEPT_SAMPLES, PULSE_MIN_SESSION_MS, PULSE_SQI_ACCEPT_FLOOR } from './pulseQuality';

/** Give up after this long with a face in view but no clean reading, and explain why. */
/** Longest scan before giving up: room to find a clean stretch in difficult light. */
export const MAX_CAPTURE_MS = 60_000;

/** Face position from the detector, in raw camera coordinates (0..1, not mirrored). */
export interface FaceBox {
  cx: number;
  cy: number;
  /** face width as a fraction of the frame width */
  size: number;
}

/** Average brightness (0..1) inside the face oval and outside it. */
export interface LightSample {
  center: number;
  edge: number;
}

export type CueId =
  | 'starting' | 'find_face' | 'too_dark' | 'backlit' | 'too_bright'
  | 'closer' | 'back' | 'move_left' | 'move_right' | 'move_up' | 'move_down'
  | 'weak_signal' | 'slow_camera' | 'hold_still' | 'done';

export interface CoachCue {
  id: CueId;
  title: string;
  detail: string;
  /** action = the person must change something; progress = keep going; good = finished */
  tone: 'action' | 'progress' | 'good';
}

export const PROBLEM_CUES: CueId[] = [
  'weak_signal', 'slow_camera', 'find_face', 'too_dark', 'backlit', 'too_bright', 'closer', 'back', 'move_left', 'move_right', 'move_up', 'move_down',
];

export const LIGHT = { tooDark: 0.22, tooBright: 0.9, backlitGap: 0.18 } as const;
export const FACE = { minSize: 0.2, maxSize: 0.58, edgeX: 0.32, topY: 0.28, bottomY: 0.72 } as const;
/** Stricter targets used only once the signal is weak. */
export const WEAK = { minFps: 18, goodFaceSize: 0.3, goodLight: 0.42 } as const;

/** The face oval, as fractions of the frame (matches the CSS clip-path on the preview). */
export const OVAL = { cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.45 } as const;

export function insideOval(x: number, y: number): boolean {
  const dx = (x - OVAL.cx) / OVAL.rx;
  const dy = (y - OVAL.cy) / OVAL.ry;
  return dx * dx + dy * dy <= 1;
}

/** Brightness of an RGBA frame inside the face oval versus outside it. */
export function analyzeLight(data: Uint8ClampedArray, width: number, height: number): LightSample {
  let centerSum = 0; let centerCount = 0; let edgeSum = 0; let edgeCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      if (insideOval((x + 0.5) / width, (y + 0.5) / height)) { centerSum += luma; centerCount += 1; } else { edgeSum += luma; edgeCount += 1; }
    }
  }
  return { center: centerCount ? centerSum / centerCount : 0, edge: edgeCount ? edgeSum / edgeCount : 0 };
}

/**
 * 0..1 progress: settling time, number of readings AND their quality. A weak
 * signal holds the bar back, so it never looks "nearly done" when it is not.
 */
export function captureProgress(elapsedMs: number, usableSamples: number, ready: boolean, medianSqi: number | null = null): number {
  if (ready) return 1;
  const settle = Math.min(1, Math.max(0, elapsedMs) / PULSE_MIN_SESSION_MS);
  const samples = Math.min(1, usableSamples / MIN_ACCEPT_SAMPLES);
  const quality = medianSqi === null ? 0 : Math.min(1, medianSqi / PULSE_SQI_ACCEPT_FLOOR);
  return Math.min(0.95, settle * 0.4 + samples * 0.2 + quality * 0.4);
}

/** Rough seconds left, for the "About N seconds left" line. */
export function secondsLeft(elapsedMs: number, usableSamples: number): number {
  const settle = Math.max(0, PULSE_MIN_SESSION_MS - elapsedMs) / 1000;
  const samples = Math.max(0, MIN_ACCEPT_SAMPLES - usableSamples) * 1.5;
  return Math.max(1, Math.ceil(Math.max(settle, samples)));
}

export function coachCue(input: {
  starting: boolean;
  faceDetected: boolean;
  face: FaceBox | null;
  light: LightSample | null;
  ready: boolean;
  elapsedMs: number;
  usableSamples: number;
  /** quality gate result: 'weak_signal' means enough readings but not clear enough to trust */
  gateReason?: string;
  /** measured camera frames per second (null until known) */
  fps?: number | null;
  /** preview is shown mirrored (selfie view), so left/right follow what the person sees */
  mirrored?: boolean;
}): CoachCue {
  const { starting, faceDetected, face, light, ready, mirrored = true } = input;
  if (starting) {
    return { id: 'starting', title: 'Starting the camera…', detail: 'This takes a few seconds. Sit comfortably and face the screen.', tone: 'progress' };
  }
  if (light && light.center < LIGHT.tooDark) {
    return { id: 'too_dark', title: 'Too dark: face a light', detail: 'Turn toward a lamp or window so light falls on your face.', tone: 'action' };
  }
  if (!faceDetected || !face) {
    return { id: 'find_face', title: 'Show your whole face', detail: 'Look straight at the screen and fit your face inside the oval.', tone: 'action' };
  }
  if (light && light.edge - light.center > LIGHT.backlitGap && light.edge > 0.5) {
    return { id: 'backlit', title: 'Light is behind you', detail: 'Turn around so the light shines on your face, not behind your head.', tone: 'action' };
  }
  if (light && light.center > LIGHT.tooBright) {
    return { id: 'too_bright', title: 'Too bright', detail: 'Move out of direct sunlight or dim the light a little.', tone: 'action' };
  }
  if (face.size < FACE.minSize) {
    return { id: 'closer', title: 'Move a little closer', detail: 'Bring the screen to about one arm’s length (40–50 cm) from your face.', tone: 'action' };
  }
  if (face.size > FACE.maxSize) {
    return { id: 'back', title: 'Move back a little', detail: 'Your whole face, including chin and forehead, should fit in the oval.', tone: 'action' };
  }
  const shownX = mirrored ? 1 - face.cx : face.cx;
  // Face centre must sit inside the oval the person can see.
  if (shownX < FACE.edgeX) {
    return { id: 'move_right', title: 'Move a little to the right →', detail: 'Centre your face inside the oval.', tone: 'action' };
  }
  if (shownX > 1 - FACE.edgeX) {
    return { id: 'move_left', title: '← Move a little to the left', detail: 'Centre your face inside the oval.', tone: 'action' };
  }
  if (face.cy < FACE.topY) {
    return { id: 'move_down', title: 'Lower your face a little ↓', detail: 'Tilt the screen or sit so your face is in the middle of the oval.', tone: 'action' };
  }
  if (face.cy > FACE.bottomY) {
    return { id: 'move_up', title: 'Raise your face a little ↑', detail: 'Hold the screen at eye level so your face is in the middle of the oval.', tone: 'action' };
  }
  if (ready) {
    return { id: 'done', title: 'Got it!', detail: 'Reading captured. Showing your result…', tone: 'good' };
  }
  if (input.gateReason === 'weak_signal' || input.gateReason === 'stale') {
    // Name the most likely limiting factor, most fixable first.
    if (input.fps != null && input.fps < WEAK.minFps) {
      return { id: 'slow_camera', title: 'Camera is running slowly', detail: 'Add more light (dim light slows phone cameras) and close other apps.', tone: 'action' };
    }
    if (face.size < WEAK.goodFaceSize) {
      return { id: 'closer', title: 'Move closer: fill the oval', detail: 'A bigger face gives the camera more skin to read. Bring the screen nearer until your face fills the oval.', tone: 'action' };
    }
    if (light && light.center < WEAK.goodLight) {
      return { id: 'too_dark', title: 'More light on your face', detail: 'Face a lamp or window. Even light from the front makes the biggest difference.', tone: 'action' };
    }
    return {
      id: 'weak_signal',
      title: 'Signal is weak: keep very still',
      detail: 'Rest your elbows on a table. Make sure your forehead and cheeks are bare (move hair or glasses glare away), and keep a lamp or window in front of you.',
      tone: 'action',
    };
  }
  const left = secondsLeft(input.elapsedMs, input.usableSamples);
  return {
    id: 'hold_still',
    title: 'Perfect, now hold still',
    detail: `Look at the camera dot, breathe normally, don’t talk or smile. About ${left} second${left === 1 ? '' : 's'} left.`,
    tone: 'progress',
  };
}

/** Plain-language fix for the problem seen most during a failed attempt. */
export const PROBLEM_ADVICE: Record<CueId, string> = {
  starting: 'Wait for the camera to start, then hold still.',
  weak_signal: 'Your face needs more even light from the front (a lamp or window facing you), and your head must stay very still. Bare forehead and cheeks help too.',
  slow_camera: 'The camera was running slowly. Add more light and close other apps, then try again.',
  find_face: 'Keep your whole face in the oval the entire time.',
  too_dark: 'Find more light: sit facing a lamp or window.',
  backlit: 'Make sure the light is in front of you, not behind you.',
  too_bright: 'Avoid direct sunlight on your face; soft, even light works best.',
  closer: 'Hold the screen closer, about one arm’s length away.',
  back: 'Move the screen a little further away so your whole face fits.',
  move_left: 'Keep your face centred in the oval.',
  move_right: 'Keep your face centred in the oval.',
  move_up: 'Hold the screen at eye level.',
  move_down: 'Hold the screen at eye level.',
  hold_still: 'Rest your elbows on a table and keep your head still, without talking.',
  done: '',
};

export function mostCommonProblem(counts: Partial<Record<CueId, number>>): CueId | null {
  let best: CueId | null = null;
  let bestCount = 0;
  for (const id of PROBLEM_CUES) {
    const count = counts[id] ?? 0;
    if (count > bestCount) { best = id; bestCount = count; }
  }
  return best;
}

/** Everyday wording for a heart-rate result. */
export function explainHeartRate(bpm: number): { verdict: 'usual' | 'low' | 'high'; text: string } {
  if (bpm < 60) {
    return { verdict: 'low', text: 'This is below the usual resting range for adults (60–100). Fit people can be lower. If you feel dizzy or faint, tell your crew medical officer.' };
  }
  if (bpm > 100) {
    return { verdict: 'high', text: 'This is above the usual resting range for adults (60–100). Rest quietly for 5 minutes and measure again. If it stays high, tell your crew medical officer.' };
  }
  return { verdict: 'usual', text: 'This is inside the usual resting range for adults (60–100).' };
}

export function plainSignal(sqi: number): 'Weak' | 'Good' | 'Excellent' {
  if (sqi < 0.38) return 'Weak';
  return sqi >= 0.7 ? 'Excellent' : 'Good';
}
