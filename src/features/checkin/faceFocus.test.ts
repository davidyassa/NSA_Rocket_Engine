import { describe, expect, it } from 'vitest';
import { FOCUS_RADII, focusEllipse, insideEllipse } from './faceFocus';

describe('face focus: only the face reaches the heart-rate model', () => {
  const box = { x: 200, y: 120, w: 200, h: 240 };
  const e = focusEllipse(box);

  it('keeps the whole face: centre, forehead, chin, cheeks', () => {
    expect(insideEllipse(e, 300, 240)).toBe(true); // centre
    expect(insideEllipse(e, 300, 122)).toBe(true); // top edge of the box (forehead)
    expect(insideEllipse(e, 300, 358)).toBe(true); // bottom edge (chin)
    expect(insideEllipse(e, 202, 240)).toBe(true); // left edge (cheek)
    expect(insideEllipse(e, 398, 240)).toBe(true); // right edge (cheek)
  });

  it('cuts the box corners, where hair and background are', () => {
    for (const [x, y] of [[200, 120], [400, 120], [200, 360], [400, 360]]) expect(insideEllipse(e, x, y), `${x},${y}`).toBe(false);
  });

  it('blacks out everything well outside the face', () => {
    expect(insideEllipse(e, 20, 20)).toBe(false);
    expect(insideEllipse(e, 620, 460)).toBe(false);
  });

  it('uses radii just beyond the box sides', () => {
    expect(FOCUS_RADII.x).toBeGreaterThan(0.5);
    expect(FOCUS_RADII.y).toBeGreaterThan(0.5);
    // corners out: (0.5/rx)² + (0.5/ry)² > 1
    expect((0.5 / FOCUS_RADII.x) ** 2 + (0.5 / FOCUS_RADII.y) ** 2).toBeGreaterThan(1);
  });
});
