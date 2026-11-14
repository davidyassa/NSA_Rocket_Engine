/**
 * "How do I get a better signal?" Live tips for the camera pulse scan (pure, tested).
 *
 * The signal-quality index (SQI) comes from the camera model; what raises it is a
 * still, evenly lit, frontal face that fills the oval. This picks the ONE change that
 * should help most right now, from what the camera can actually measure: face
 * movement, light level and its balance across the face, distance, position, head
 * turn, chin up/down, head tilt and camera speed.
 *
 * Geometry is in raw camera coordinates (not mirrored): the camera faces the person,
 * so the image's left side is the person's RIGHT. Every instruction is phrased in the
 * person's own left/right, so it is correct whether or not the preview is mirrored.
 */
import type { FaceBox } from './captureCoach';

export interface Point { x: number; y: number }
/** BlazeFace keypoints as frame fractions: two eyes, nose tip, mouth (ears unused). */
export type FaceKeypoints = readonly Point[];
/** Brightness (0–1) of the left and right halves of the face oval in the raw image. */
export interface FaceLight { center: number; left: number; right: number }

export type SignalLevel = 'Weak' | 'Good' | 'Excellent';
export type TipId =
  | 'hold_still' | 'more_light' | 'side_light_left' | 'side_light_right' | 'closer' | 'back'
  | 'move_your_left' | 'move_your_right' | 'raise_camera' | 'lower_camera'
  | 'turn_left' | 'turn_right' | 'chin_down' | 'chin_up' | 'tilt_left' | 'tilt_right'
  | 'slow_camera' | 'relax' | 'dont_talk' | 'shine';

export interface SignalTip { id: TipId; text: string }

/** Same bands as the badge (plainSignal): Weak < 0.38 ≤ Good < 0.70 ≤ Excellent. */
export const SQI_LEVEL = { good: 0.38, excellent: 0.7 } as const;
export function signalLevel(sqi: number): SignalLevel {
  return sqi >= SQI_LEVEL.excellent ? 'Excellent' : sqi >= SQI_LEVEL.good ? 'Good' : 'Weak';
}

/** Targets for the best signal (tighter than the limits that block a scan). */
export const IDEAL = {
  maxSpeed: 0.04, // face centre movement, frame fractions per second
  minLight: 0.42,
  sideImbalance: 0.25, // darker half at least 25 % darker than the brighter half
  minSize: 0.28, maxSize: 0.46, // face width / frame width
  offCentre: 0.08,
  turn: 0.12, // nose offset from the eyes' midpoint, in eye-spans
  chinUp: 0.32, chinDown: 0.75, // nose position between eye line and mouth (≈0.5 facing forward)
  tiltDeg: 8,
  minFps: 24,
  maxMouth: 0.03, // spread of the mouth–eye distance (eye-spans) over ~1.5 s: talking or chewing
  maxGlare: 0.03, // share of shiny (near-white) skin pixels on the forehead and cheeks
} as const;

/** Head turn, chin and tilt from the keypoints (raw image coordinates). */
export function headAngles(kps: FaceKeypoints): { turn: number; chin: number; tiltDeg: number } | null {
  if (kps.length < 4) return null;
  const [e1, e2, nose, mouth] = kps;
  // Sort the eyes by image position: imageLeft is the person's RIGHT eye.
  const [imageLeft, imageRight] = e1.x <= e2.x ? [e1, e2] : [e2, e1];
  const span = imageRight.x - imageLeft.x;
  if (span < 1e-4) return null;
  const midX = (imageLeft.x + imageRight.x) / 2;
  const midY = (imageLeft.y + imageRight.y) / 2;
  const down = mouth.y - midY;
  return {
    // < 0: nose toward image-left = the person's right (they turned to their right).
    turn: (nose.x - midX) / span,
    chin: down > 1e-4 ? (nose.y - midY) / down : 0.5,
    // > 0: the image-right eye (the person's LEFT eye) is lower: head tipped to their left.
    tiltDeg: (Math.atan2(imageRight.y - imageLeft.y, span) * 180) / Math.PI,
  };
}

/** The one change most likely to raise the signal now, or null when it is already excellent. */
export function signalTip(input: {
  sqi: number;
  face: FaceBox | null;
  keypoints?: FaceKeypoints | null;
  light?: FaceLight | null;
  /** face-centre speed, frame fractions per second */
  speed?: number | null;
  fps?: number | null;
  /** mouth movement from mouthMovement() */
  mouth?: number | null;
  /** shiny-skin share from the colour samples */
  glare?: number | null;
}): SignalTip | null {
  const { sqi, face, keypoints, light, speed, fps, mouth, glare } = input;
  if (sqi >= SQI_LEVEL.excellent || !face) return null;

  if (speed != null && speed > IDEAL.maxSpeed) return { id: 'hold_still', text: 'Hold completely still: rest your elbows on the table and don’t talk.' };
  if (mouth != null && mouth > IDEAL.maxMouth) return { id: 'dont_talk', text: 'Keep your mouth still: don’t talk or chew until the reading is done.' };
  if (light && light.center < IDEAL.minLight) return { id: 'more_light', text: 'More light on your face: turn on Face light, or face a lamp or window.' };
  if (glare != null && glare > IDEAL.maxGlare) return { id: 'shine', text: 'Your skin is shining: move away from direct light, or turn slightly so the light falls evenly.' };
  if (light) {
    const bright = Math.max(light.left, light.right);
    if (bright > 0 && (bright - Math.min(light.left, light.right)) / bright > IDEAL.sideImbalance) {
      // Brighter image-right half = the person's LEFT side is lit: the light is on their left.
      return light.right > light.left
        ? { id: 'side_light_left', text: 'Light is on your left side only: turn a little toward it, or add light on your right.' }
        : { id: 'side_light_right', text: 'Light is on your right side only: turn a little toward it, or add light on your left.' };
    }
  }
  if (face.size < IDEAL.minSize) return { id: 'closer', text: 'Move a little closer so your face fills the oval.' };
  if (face.size > IDEAL.maxSize) return { id: 'back', text: 'Move back a little: your face is too close.' };
  if (face.cx < 0.5 - IDEAL.offCentre) return { id: 'move_your_left', text: 'Move slightly to your left to centre your face.' };
  if (face.cx > 0.5 + IDEAL.offCentre) return { id: 'move_your_right', text: 'Move slightly to your right to centre your face.' };
  // Face high in the picture: the camera points too low (and the reverse).
  if (face.cy < 0.5 - IDEAL.offCentre) return { id: 'raise_camera', text: 'Raise the phone a little, to eye level.' };
  if (face.cy > 0.5 + IDEAL.offCentre) return { id: 'lower_camera', text: 'Lower the phone a little, to eye level.' };

  const angles = keypoints ? headAngles(keypoints) : null;
  if (angles) {
    if (angles.turn < -IDEAL.turn) return { id: 'turn_left', text: 'Turn your head slightly to your left: look straight at the screen.' };
    if (angles.turn > IDEAL.turn) return { id: 'turn_right', text: 'Turn your head slightly to your right: look straight at the screen.' };
    if (angles.chin < IDEAL.chinUp) return { id: 'chin_down', text: 'Lower your chin a little.' };
    if (angles.chin > IDEAL.chinDown) return { id: 'chin_up', text: 'Raise your chin a little.' };
    if (angles.tiltDeg > IDEAL.tiltDeg) return { id: 'tilt_right', text: 'Straighten your head: it leans to your left.' };
    if (angles.tiltDeg < -IDEAL.tiltDeg) return { id: 'tilt_left', text: 'Straighten your head: it leans to your right.' };
  }
  if (fps != null && fps < IDEAL.minFps) return { id: 'slow_camera', text: 'Close other apps: the camera is running slowly.' };
  return { id: 'relax', text: 'Relax your face and breathe normally: the signal improves over a few seconds of stillness.' };
}

/** Brightness of the left and right halves of the face oval (raw image), plus the whole oval. */
export function faceLight(data: Uint8ClampedArray, width: number, height: number, inside: (x: number, y: number) => boolean): FaceLight {
  let l = 0; let ln = 0; let r = 0; let rn = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const fx = (x + 0.5) / width; const fy = (y + 0.5) / height;
      if (!inside(fx, fy)) continue;
      const i = (y * width + x) * 4;
      const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      if (fx < 0.5) { l += luma; ln += 1; } else { r += luma; rn += 1; }
    }
  }
  const left = ln ? l / ln : 0; const right = rn ? r / rn : 0;
  return { center: ln + rn ? (l + r) / (ln + rn) : 0, left, right };
}

/** Mouth position relative to the eyes, in eye-spans (raw keypoints), or null. */
export function mouthOpening(kps: FaceKeypoints): number | null {
  if (kps.length < 4) return null;
  const [e1, e2, , mouth] = kps;
  const span = Math.abs(e2.x - e1.x);
  return span > 1e-4 ? (mouth.y - (e1.y + e2.y) / 2) / span : null;
}

/** Talking or chewing: the spread (standard deviation) of the mouth position over the history. */
export function mouthMovement(history: readonly number[]): number | null {
  if (history.length < 5) return null;
  const m = history.reduce((s, v) => s + v, 0) / history.length;
  return Math.sqrt(history.reduce((s, v) => s + (v - m) ** 2, 0) / history.length);
}
