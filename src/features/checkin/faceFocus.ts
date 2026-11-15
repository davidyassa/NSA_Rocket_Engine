/**
 * Face focus: only the face reaches the heart-rate model.
 *
 * The camera model reads the pulse from a rectangle around the detected face. Its
 * corners hold hair and background, whose flicker and motion are not pulse. Before
 * each frame is analysed, everything outside an ellipse around the face is painted
 * black. Black never changes from frame to frame, so it adds nothing to the signal.
 *
 * The ellipse keeps the whole face (forehead, cheeks, chin) and cuts the box's
 * corners. When no face has been seen for FOCUS_HOLD_MS, whole frames are analysed
 * again so the face can be found after a move.
 */

/** Set to false to send whole camera frames to the model, as before. */
export const FOCUS_ON_FACE = true;
export const FOCUS_HOLD_MS = 300;
/** Ellipse radii as fractions of the face box: the box's sides stay in, its corners go. */
export const FOCUS_RADII = { x: 0.6, y: 0.62 } as const;

export interface PixelBox { x: number; y: number; w: number; h: number }
export interface Ellipse { cx: number; cy: number; rx: number; ry: number }

export function focusEllipse(box: PixelBox): Ellipse {
  return { cx: box.x + box.w / 2, cy: box.y + box.h / 2, rx: box.w * FOCUS_RADII.x, ry: box.h * FOCUS_RADII.y };
}

export function insideEllipse(e: Ellipse, x: number, y: number): boolean {
  return ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 <= 1;
}

/** Draw a face-only frame: black everywhere except the ellipse, which shows the camera image. */
export function drawFaceOnly(ctx: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, e: Ellipse) {
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.beginPath();
  ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(source, 0, 0, width, height);
  ctx.restore();
}
