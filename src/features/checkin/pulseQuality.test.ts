import { describe, expect, it } from 'vitest';
import {
  assessPulseSamples,
  cameraCaptureFromGate,
  estimateFromGate,
  isDisplayableSample,
  isPhysiologicHeartRate,
  median,
  MIN_ACCEPT_SAMPLES,
  PULSE_ALGORITHM,
  PULSE_SQI_ACCEPT_FLOOR,
  PULSE_WINDOW_SIZE,
  type PulseSample,
} from './pulseQuality';

function sample(hr: number, sqi: number, timestamp = 1_700_000_000_000): PulseSample {
  return { hr, sqi, timestamp };
}

function stable(hr: number, sqi: number, count = MIN_ACCEPT_SAMPLES): PulseSample[] {
  return Array.from({ length: count }, () => sample(hr, sqi));
}

describe('pulse quality gate', () => {
  it('returns collecting with no number on an empty window', () => {
    const gate = assessPulseSamples([]);
    expect(gate).toMatchObject({ ready: false, medianHr: null, medianSqi: null, reason: 'collecting' });
  });

  it('withholds a number until the minimum sample count is reached', () => {
    const gate = assessPulseSamples(stable(72, 0.9, MIN_ACCEPT_SAMPLES - 1));
    expect(gate.ready).toBe(false);
    expect(gate.medianHr).toBeNull();
    expect(gate.reason).toBe('collecting');
    expect(gate.usableSamples).toBe(MIN_ACCEPT_SAMPLES - 1);
  });

  it('accepts a stable window and reports the median heart rate', () => {
    const samples = [70, 72, 74, 76, 78].map(hr => sample(hr, 0.8));
    const gate = assessPulseSamples(samples);
    expect(gate).toMatchObject({
      ready: true,
      medianHr: 74,
      medianSqi: 0.8,
      usableSamples: 5,
      reason: 'ready',
    });
  });

  it('rejects a window whose median signal quality is below the acceptance floor', () => {
    const samples = [sample(70, 0.5), sample(71, 0.52), sample(72, 0.4), sample(73, 0.51), sample(74, 0.49)];
    const gate = assessPulseSamples(samples);
    expect(gate.ready).toBe(false);
    expect(gate.medianHr).toBeNull();
    expect(gate.reason).toBe('weak_signal');
    expect(gate.medianSqi).toBeLessThan(PULSE_SQI_ACCEPT_FLOOR);
  });

  it('averages the middle pair for an even sample count', () => {
    const samples = [60, 62, 64, 66, 68, 70].map(hr => sample(hr, 0.9));
    expect(assessPulseSamples(samples).medianHr).toBe(65);
  });

  it('drops samples outside the rolling window so an old artefact cannot survive', () => {
    const bad = Array.from({ length: PULSE_WINDOW_SIZE }, () => sample(300, 0.95));
    const good = Array.from({ length: MIN_ACCEPT_SAMPLES }, () => sample(66, 0.85));
    const gate = assessPulseSamples([...bad, ...good]);
    expect(gate.ready).toBe(true);
    expect(gate.medianHr).toBe(66);
    expect(gate.usableSamples).toBe(MIN_ACCEPT_SAMPLES);
  });

  it('marks a window of physiologically implausible values as implausible and emits no number', () => {
    const gate = assessPulseSamples(stable(5, 0.95));
    expect(gate).toMatchObject({ ready: false, medianHr: null, reason: 'implausible' });
  });

  it('ignores non-finite samples rather than letting them poison the median', () => {
    const gate = assessPulseSamples([sample(Number.NaN, 0.9), sample(Number.POSITIVE_INFINITY, 0.9), ...stable(70, 0.9)]);
    expect(gate.ready).toBe(true);
    expect(gate.medianHr).toBe(70);
  });

  it('computes a deterministic median and rejects an empty input', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(() => median([])).toThrow();
  });

  it('treats only samples above the display floor as displayable', () => {
    expect(isDisplayableSample(sample(70, 0.37))).toBe(false);
    expect(isDisplayableSample(sample(70, 0.38))).toBe(true);
    expect(isDisplayableSample(sample(250, 0.9))).toBe(false);
  });

  it('validates the physiologic range boundaries', () => {
    expect(isPhysiologicHeartRate(40)).toBe(true);
    expect(isPhysiologicHeartRate(200)).toBe(true);
    expect(isPhysiologicHeartRate(39.9)).toBe(false);
    expect(isPhysiologicHeartRate(200.1)).toBe(false);
    expect(isPhysiologicHeartRate(Number.NaN)).toBe(false);
  });
});

describe('camera capture provenance', () => {
  const at = new Date('2039-06-01T08:00:00.000Z');

  it('never builds capture metadata from an unready gate', () => {
    const gate = assessPulseSamples(stable(72, 0.4));
    expect(cameraCaptureFromGate(gate, at)).toBeNull();
    expect(estimateFromGate(gate, at)).toBeNull();
  });

  it('writes source, quality, algorithm, device and capture time for a ready gate', () => {
    const gate = assessPulseSamples(stable(73.4, 0.8123));
    const capture = cameraCaptureFromGate(gate, at);
    expect(capture).toEqual({
      capturedAtUtc: '2039-06-01T08:00:00.000Z',
      source: 'camera_estimate',
      status: 'accepted',
      signalQuality: 0.812,
      algorithm: PULSE_ALGORITHM,
      device: 'browser webcam · on-device WebAssembly',
      synthetic: false,
    });
    expect(estimateFromGate(gate, at)).toEqual({
      bpm: 73,
      sqi: 0.8123,
      capturedAtUtc: '2039-06-01T08:00:00.000Z',
      sampleCount: MIN_ACCEPT_SAMPLES,
      algorithm: PULSE_ALGORITHM,
    });
  });
});
