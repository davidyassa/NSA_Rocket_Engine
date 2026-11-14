import { describe, expect, it } from 'vitest';
import { insideOval } from './captureCoach';
import { faceLight, headAngles, mouthMovement, mouthOpening, signalLevel, signalTip } from './sqiCoach';

// A centred face of ideal size, still, evenly lit.
const face = { cx: 0.5, cy: 0.5, size: 0.35 };
const light = { center: 0.55, left: 0.55, right: 0.55 };
/** Keypoints of a frontal face in RAW image coordinates: eyes at y 0.40, nose 0.50, mouth 0.60. */
const frontal = (o: { noseDx?: number; noseY?: number; tiltDy?: number } = {}) => [
  { x: 0.44, y: 0.40 - (o.tiltDy ?? 0) }, // image-left eye = the person's RIGHT eye
  { x: 0.56, y: 0.40 + (o.tiltDy ?? 0) }, // image-right eye = the person's LEFT eye
  { x: 0.5 + (o.noseDx ?? 0), y: o.noseY ?? 0.5 },
  { x: 0.5, y: 0.6 },
];
const tip = (over: Partial<Parameters<typeof signalTip>[0]> = {}) =>
  signalTip({ sqi: 0.5, face, keypoints: frontal(), light, speed: 0.01, fps: 30, ...over })?.id;

describe('signal level', () => {
  it('uses the badge bands', () => {
    expect(signalLevel(0.2)).toBe('Weak');
    expect(signalLevel(0.5)).toBe('Good');
    expect(signalLevel(0.75)).toBe('Excellent');
  });
  it('gives no tip once the signal is excellent', () => {
    expect(signalTip({ sqi: 0.8, face, keypoints: frontal(), light })).toBeNull();
  });
});

describe('head angles from raw keypoints', () => {
  it('reads a frontal face as straight', () => {
    const a = headAngles(frontal())!;
    expect(Math.abs(a.turn)).toBeLessThan(0.01);
    expect(a.chin).toBeCloseTo(0.5, 2);
    expect(Math.abs(a.tiltDeg)).toBeLessThan(0.01);
  });
  it('does not depend on which eye is listed first', () => {
    const k = frontal({ noseDx: -0.03 });
    expect(headAngles([k[1], k[0], k[2], k[3]])!.turn).toBeCloseTo(headAngles(k)!.turn, 6);
  });
});

describe('the one tip that helps most, in the person’s own left/right', () => {
  it.each([
    // Nose toward image-left = the person turned to their RIGHT, so they should turn LEFT.
    ['head turned to their right', { keypoints: frontal({ noseDx: -0.025 }) }, 'turn_left'],
    ['head turned to their left', { keypoints: frontal({ noseDx: 0.025 }) }, 'turn_right'],
    // Nose close to the eye line = chin up (head tipped back).
    ['chin up', { keypoints: frontal({ noseY: 0.42 }) }, 'chin_down'],
    ['chin down', { keypoints: frontal({ noseY: 0.585 }) }, 'chin_up'],
    // Image-right eye (their LEFT eye) lower = head leaning to their left.
    ['head leaning to their left', { keypoints: frontal({ tiltDy: 0.012 }) }, 'tilt_right'],
    ['head leaning to their right', { keypoints: frontal({ tiltDy: -0.012 }) }, 'tilt_left'],
    // Face on the image-left = they sit to their right, so they should move LEFT.
    ['sitting off to their right', { face: { ...face, cx: 0.38 } }, 'move_your_left'],
    ['sitting off to their left', { face: { ...face, cx: 0.62 } }, 'move_your_right'],
    ['face high in the picture', { face: { ...face, cy: 0.38 } }, 'raise_camera'],
    ['face low in the picture', { face: { ...face, cy: 0.62 } }, 'lower_camera'],
    ['too far', { face: { ...face, size: 0.22 } }, 'closer'],
    ['too close', { face: { ...face, size: 0.5 } }, 'back'],
    // Brighter image-right half = their LEFT side is lit.
    ['light on their left only', { light: { center: 0.5, left: 0.35, right: 0.65 } }, 'side_light_left'],
    ['light on their right only', { light: { center: 0.5, left: 0.65, right: 0.35 } }, 'side_light_right'],
    ['dim face', { light: { center: 0.3, left: 0.3, right: 0.3 } }, 'more_light'],
    ['moving', { speed: 0.1 }, 'hold_still'],
    ['slow camera', { fps: 15 }, 'slow_camera'],
    ['talking', { mouth: 0.06 }, 'dont_talk'],
    ['shiny forehead', { glare: 0.08 }, 'shine'],
    ['nothing measurably wrong', {}, 'relax'],
  ])('%s → %s', (_, over, expected) => {
    expect(tip(over as Partial<Parameters<typeof signalTip>[0]>)).toBe(expected);
  });

  it('puts the biggest problem first: movement, then light, then distance, then angles', () => {
    expect(tip({ speed: 0.1, light: { center: 0.3, left: 0.3, right: 0.3 }, keypoints: frontal({ noseDx: -0.03 }) })).toBe('hold_still');
    expect(tip({ light: { center: 0.3, left: 0.3, right: 0.3 }, face: { ...face, size: 0.2 } })).toBe('more_light');
    expect(tip({ face: { ...face, size: 0.2 }, keypoints: frontal({ noseDx: -0.03 }) })).toBe('closer');
  });
});

describe('light balance across the face', () => {
  it('measures the left and right halves of the oval', () => {
    const w = 48; const h = 36;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const v = x < w / 2 ? 60 : 200;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
    const l = faceLight(data, w, h, insideOval);
    expect(l.left).toBeCloseTo(60 / 255, 2);
    expect(l.right).toBeCloseTo(200 / 255, 2);
  });
});

describe('mouth movement', () => {
  it('reads the mouth position in eye-spans', () => {
    expect(mouthOpening(frontal())).toBeCloseTo(0.2 / 0.12, 3);
  });
  it('is near zero when still and large when talking', () => {
    expect(mouthMovement([1.66, 1.67, 1.66, 1.665, 1.67, 1.66])!).toBeLessThan(0.01);
    expect(mouthMovement([1.6, 1.75, 1.62, 1.78, 1.6, 1.74])!).toBeGreaterThan(0.03);
    expect(mouthMovement([1.6, 1.7])).toBeNull();
  });
  it('asks to stop talking before light or position tips, after head movement', () => {
    expect(tip({ mouth: 0.06, light: { center: 0.3, left: 0.3, right: 0.3 } })).toBe('dont_talk');
    expect(tip({ mouth: 0.06, speed: 0.1 })).toBe('hold_still');
  });
});
