import { describe, expect, it } from 'vitest';
import type { CheckinEntry } from '../contracts';
import { HERO_SCENARIO } from '../scenarios';
import { buildCheckin, entryFromCheckin } from './store';

const capture = {
  capturedAtUtc: '2039-07-13T08:04:11.000Z',
  source: 'camera_estimate' as const,
  status: 'accepted' as const,
  signalQuality: 0.812,
  algorithm: 'vitalcamera-sdk · PSD + SQI TFLite models (local inference)',
  device: 'browser webcam · on-device WebAssembly',
  synthetic: false,
};

function entry(overrides: Partial<CheckinEntry> = {}): CheckinEntry {
  return {
    values: { heart_rate: 73, mood: 4 },
    symptomIds: [],
    note: '',
    provenance: { heart_rate: 'user_entered', mood: 'user_entered' },
    capture: {},
    ...overrides,
  };
}

describe('check-in provenance round trip', () => {
  it('stores camera source, signal quality and algorithm on the measurement', () => {
    const checkin = buildCheckin(entry({ capture: { heart_rate: capture } }), HERO_SCENARIO);
    const heartRate = checkin.measurements.find((reading) => reading.metric === 'heart_rate');

    expect(heartRate).toMatchObject({
      metric: 'heart_rate',
      value: 73,
      provenance: 'user_entered',
      source: 'camera_estimate',
      status: 'accepted',
      signalQuality: 0.812,
      algorithm: capture.algorithm,
      device: capture.device,
      capturedAtUtc: capture.capturedAtUtc,
    });
  });

  it('restores the capture metadata when reopening a saved check-in', () => {
    const checkin = buildCheckin(entry({ capture: { heart_rate: capture } }), HERO_SCENARIO);
    const restored = entryFromCheckin(checkin);

    expect(restored.values.heart_rate).toBe(73);
    expect(restored.capture.heart_rate).toEqual(capture);
    expect(restored.capture.mood).toBeUndefined();
  });

  it('survives a JSON and schema round trip without losing provenance', () => {
    const checkin = buildCheckin(entry({ capture: { heart_rate: capture } }), HERO_SCENARIO);
    const reparsed = JSON.parse(JSON.stringify(checkin)) as typeof checkin;
    const restored = entryFromCheckin(reparsed);

    expect(restored.capture.heart_rate).toEqual(capture);
    expect(reparsed.measurements.find((reading) => reading.metric === 'heart_rate')?.provenance)
      .toBe('user_entered');
  });

  it('does not attach capture metadata to synthetic demo readings', () => {
    const checkin = buildCheckin(
      entry({ provenance: { heart_rate: 'synthetic_demo', mood: 'user_entered' }, capture: { heart_rate: capture } }),
      HERO_SCENARIO,
    );
    const heartRate = checkin.measurements.find((reading) => reading.metric === 'heart_rate');

    expect(heartRate).toMatchObject({
      provenance: 'synthetic_demo',
      source: 'synthetic',
      status: 'accepted',
      synthetic: true,
    });
    expect(heartRate?.capturedAtUtc).toBeUndefined();
    expect(heartRate?.signalQuality).toBeUndefined();
    expect(heartRate?.algorithm).toBeUndefined();
    expect(entryFromCheckin(checkin).capture.heart_rate).toBeUndefined();
  });

  it('records manual and self-report sources without inventing capture details', () => {
    const checkin = buildCheckin(entry(), HERO_SCENARIO);
    const heartRate = checkin.measurements.find((reading) => reading.metric === 'heart_rate');
    const mood = checkin.measurements.find((reading) => reading.metric === 'mood');

    expect(heartRate).toMatchObject({
      provenance: 'user_entered',
      source: 'manual',
      status: 'accepted',
      synthetic: false,
    });
    expect(heartRate?.signalQuality).toBeUndefined();
    expect(heartRate?.capturedAtUtc).toBeUndefined();
    expect(mood?.source).toBe('self_report');
    expect(entryFromCheckin(checkin).capture).toEqual({});
  });

  it('rejects capture metadata for a metric that was not entered', () => {
    const checkin = buildCheckin(entry({ capture: { sleep_duration: capture } }), HERO_SCENARIO);
    expect(checkin.measurements.some((reading) => reading.metric === 'sleep_duration')).toBe(false);
  });
});
