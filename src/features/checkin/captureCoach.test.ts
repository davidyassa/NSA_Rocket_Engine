import { describe, expect, it } from 'vitest';
import {
  OVAL, analyzeLight, captureProgress, coachCue, explainHeartRate, insideOval, mostCommonProblem, plainSignal, secondsLeft,
} from './captureCoach';
import { readFileSync } from 'node:fs';

const goodFace = { cx: 0.5, cy: 0.48, size: 0.32 };
const goodLight = { center: 0.55, edge: 0.45 };
const base = { starting: false, faceDetected: true, face: goodFace, light: goodLight, ready: false, elapsedMs: 4000, usableSamples: 0 };

describe('camera capture coach', () => {
  it('asks for the face first, then light, distance and centring, one cue at a time', () => {
    expect(coachCue({ ...base, faceDetected: false, face: null }).id).toBe('find_face');
    expect(coachCue({ ...base, light: { center: 0.1, edge: 0.1 } }).id).toBe('too_dark');
    expect(coachCue({ ...base, light: { center: 0.35, edge: 0.8 } }).id).toBe('backlit');
    expect(coachCue({ ...base, face: { ...goodFace, size: 0.1 } }).id).toBe('closer');
    expect(coachCue({ ...base, face: { ...goodFace, size: 0.7 } }).id).toBe('back');
    expect(coachCue({ ...base, face: { ...goodFace, cy: 0.15 } }).id).toBe('move_down');
    expect(coachCue(base).id).toBe('hold_still');
    expect(coachCue({ ...base, ready: true }).id).toBe('done');
  });

  it('gives left/right directions as the person sees them in the mirrored preview', () => {
    // Raw camera x near 0.9 appears on the LEFT of a mirrored selfie preview → move right.
    expect(coachCue({ ...base, face: { ...goodFace, cx: 0.9 } }).id).toBe('move_right');
    expect(coachCue({ ...base, face: { ...goodFace, cx: 0.1 } }).id).toBe('move_left');
    expect(coachCue({ ...base, face: { ...goodFace, cx: 0.1 }, mirrored: false }).id).toBe('move_right');
  });

  it('uses plain words, never jargon', () => {
    const cue = coachCue(base);
    expect(`${cue.title} ${cue.detail}`).not.toMatch(/SQI|rPPG|sample|median|calibrat/i);
  });

  it('measures centre versus edge brightness to spot back-lighting', () => {
    const w = 8; const h = 8; const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const centre = x >= 2 && x < 6 && y >= 2 && y < 7;
      const v = centre ? 60 : 230;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
    const light = analyzeLight(data, w, h);
    expect(light.edge).toBeGreaterThan(light.center);
    expect(coachCue({ ...base, light }).id).toBe('backlit');
  });

  it('reports progress and time left', () => {
    expect(captureProgress(0, 0, false)).toBe(0);
    expect(captureProgress(30_000, 5, false)).toBeLessThan(1);
    expect(captureProgress(30_000, 5, true)).toBe(1);
    expect(secondsLeft(0, 0)).toBeGreaterThanOrEqual(15);
    expect(secondsLeft(60_000, 10)).toBe(1);
  });

  it('picks the most frequent problem for retry advice', () => {
    expect(mostCommonProblem({ hold_still: 50, too_dark: 3, backlit: 9 })).toBe('backlit');
    expect(mostCommonProblem({ hold_still: 5 })).toBeNull();
  });

  it('explains results in everyday words', () => {
    expect(explainHeartRate(72).verdict).toBe('usual');
    expect(explainHeartRate(110).verdict).toBe('high');
    expect(explainHeartRate(52).verdict).toBe('low');
    expect(plainSignal(0.2)).toBe('Weak');
    expect(plainSignal(0.8)).toBe('Excellent');
  });

  it('measures light only inside the same oval the preview shows', () => {
    expect(insideOval(0.5, 0.5)).toBe(true);
    expect(insideOval(0.05, 0.05)).toBe(false);
    expect(insideOval(0.5 + OVAL.rx - 0.01, 0.5)).toBe(true);
    expect(insideOval(0.5 + OVAL.rx + 0.01, 0.5)).toBe(false);
    const css = readFileSync(new URL('./cameraPulseCheck.css', import.meta.url), 'utf8');
    expect(css).toContain(`clip-path: ellipse(${OVAL.rx * 100}% ${OVAL.ry * 100}% at ${OVAL.cx * 100}% ${OVAL.cy * 100}%)`);
  });

  it('never claims "nearly done" while the signal is weak', () => {
    const weak = coachCue({ ...base, elapsedMs: 30_000, usableSamples: 12, gateReason: 'weak_signal' });
    expect(weak.id).toBe('weak_signal');
    expect(`${weak.title} ${weak.detail}`).not.toMatch(/second/);
    expect(captureProgress(30_000, 12, false, 0.3)).toBeLessThan(0.85);
    expect(captureProgress(30_000, 12, false, 0.6)).toBeGreaterThan(0.9);
    expect(mostCommonProblem({ weak_signal: 20, hold_still: 30 })).toBe('weak_signal');
  });

  it('names the limiting factor when the signal is weak', () => {
    const weak = { ...base, elapsedMs: 30_000, usableSamples: 12, gateReason: 'weak_signal' };
    expect(coachCue({ ...weak, fps: 12 }).id).toBe('slow_camera');
    expect(coachCue({ ...weak, fps: 30, face: { ...goodFace, size: 0.24 } }).id).toBe('closer');
    expect(coachCue({ ...weak, fps: 30, face: { ...goodFace, size: 0.36 }, light: { center: 0.35, edge: 0.3 } }).id).toBe('too_dark');
    expect(coachCue({ ...weak, fps: 30, face: { ...goodFace, size: 0.36 } }).detail).toMatch(/forehead and cheeks/);
  });
});
