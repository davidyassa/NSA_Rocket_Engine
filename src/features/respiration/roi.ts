/**
 * Torso regions of interest (pure). Placed from the face box the camera pulse
 * pipeline already detects (no extra pose model), or chosen by hand on the preview.
 * Body proportions: the chest starts about one face height below the face centre.
 */
import type { NormRect, RegionKind } from './types';

/** Face box as reported by the camera pipeline: centre and width as frame fractions. */
export interface FaceBox { cx: number; cy: number; size: number }

/** When nothing is detected: the lower middle of a typical seated selfie frame. */
export const DEFAULT_REGIONS: Record<RegionKind, NormRect> = {
  chest: { x: 0.3, y: 0.6, w: 0.4, h: 0.22 },
  abdomen: { x: 0.32, y: 0.82, w: 0.36, h: 0.16 },
};

const clip = (r: NormRect): NormRect => {
  const x = Math.max(0, r.x); const y = Math.max(0, r.y);
  return { x, y, w: Math.max(0, Math.min(1, r.x + r.w) - x), h: Math.max(0, Math.min(1, r.y + r.h) - y) };
};

/**
 * Chest and abdomen below a detected face. `aspect` = frame width / height. A face is
 * about 1.25 times taller than wide; the chest band spans two face widths, starting
 * 0.75 face heights below the face centre (below chin and neck).
 */
export function regionsFromFace(face: FaceBox, aspect: number): Partial<Record<RegionKind, NormRect>> {
  const faceW = face.size;
  const faceH = face.size * aspect * 1.25;
  const chest = clip({ x: face.cx - faceW * 1.1, y: face.cy + faceH * 0.75, w: faceW * 2.2, h: faceH * 1.1 });
  const abdomenTop = chest.y + chest.h;
  const out: Partial<Record<RegionKind, NormRect>> = {};
  if (chest.h > 0.05 && chest.w > 0.05) out.chest = chest;
  if (abdomenTop < 0.9) {
    const abdomen = clip({ x: face.cx - faceW, y: abdomenTop, w: faceW * 2, h: faceH * 1.0 });
    if (abdomen.h > 0.05) out.abdomen = abdomen;
  }
  return out;
}

/** A rectangle drawn on the (possibly mirrored) preview, in raw frame fractions. */
export function rectFromDrag(a: { x: number; y: number }, b: { x: number; y: number }, mirrored: boolean): NormRect {
  const fx = (x: number) => (mirrored ? 1 - x : x);
  const x0 = Math.min(fx(a.x), fx(b.x)); const x1 = Math.max(fx(a.x), fx(b.x));
  const y0 = Math.min(a.y, b.y); const y1 = Math.max(a.y, b.y);
  return clip({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}
