import { describe, expect, it } from 'vitest';
import { FACE_LIGHT, holdCameraSettings, lockableSettings, releaseCameraSettings } from './cameraTuning';

describe('camera settings for the pulse scan', () => {
  it('holds only the settings this camera can fix', () => {
    expect(lockableSettings({ exposureMode: ['continuous', 'manual'], whiteBalanceMode: ['continuous', 'manual'], focusMode: ['continuous'] }))
      .toEqual(['exposureMode', 'whiteBalanceMode']);
    expect(lockableSettings({})).toEqual([]);
  });

  it('applies manual modes to a live track and continuous ones to release it; never throws', async () => {
    const applied: unknown[] = [];
    const track = {
      readyState: 'live',
      getCapabilities: () => ({ exposureMode: ['continuous', 'manual'], whiteBalanceMode: ['manual', 'continuous'] }),
      applyConstraints: async (c: unknown) => { applied.push(c); },
    } as unknown as MediaStreamTrack;
    expect(await holdCameraSettings(track)).toEqual(['exposureMode', 'whiteBalanceMode']);
    expect(await releaseCameraSettings(track)).toEqual(['exposureMode', 'whiteBalanceMode']);
    expect(applied).toEqual([
      { advanced: [{ exposureMode: 'manual', whiteBalanceMode: 'manual' }] },
      { advanced: [{ exposureMode: 'continuous', whiteBalanceMode: 'continuous' }] },
    ]);
    const refusing = { ...track, readyState: 'live', getCapabilities: track.getCapabilities, applyConstraints: async () => { throw new Error('OverconstrainedError'); } } as unknown as MediaStreamTrack;
    expect(await holdCameraSettings(refusing)).toEqual([]);
    expect(await holdCameraSettings(null)).toEqual([]);
  });

  it('turns the face light on only for a clearly dark face', () => {
    expect(FACE_LIGHT.onBelow).toBeGreaterThan(0.22); // above the coach's "too dark" cue
    expect(FACE_LIGHT.onBelow).toBeLessThan(0.45); // below normal indoor light
  });
});
