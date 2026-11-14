import { describe, expect, it } from 'vitest';
import {
  assessPulseSamples,
  assessPulseSession,
  cameraCaptureFromGate,
  estimateFromGate,
  isDisplayableSample,
  isPhysiologicHeartRate,
  median,
  MIN_ACCEPT_SAMPLES,
  PULSE_ALGORITHM,
  PULSE_MAX_SAMPLE_AGE_MS,
  PULSE_MIN_SESSION_MS,
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

describe('pulse session freshness', () => {
  const sessionStartedAt = 1_700_000_000_000;
  const readySamples = Array.from({ length: MIN_ACCEPT_SAMPLES }, (_, index) =>
    sample(72, 0.85, sessionStartedAt + PULSE_MIN_SESSION_MS + index * 1_000));
  const latestTimestamp = readySamples[readySamples.length - 1].timestamp;

  it('rejects out-of-range SQI values', () => {
    expect(assessPulseSamples(stable(72, 1.2)).ready).toBe(false);
    expect(isDisplayableSample(sample(72, 1.2))).toBe(false);
  });

  it('accepts a fresh face-present session after the full warm-up', () => {
    const gate = assessPulseSession(readySamples, {
      sessionStartedAt,
      facePresent: true,
      now: latestTimestamp,
    });
    expect(gate).toMatchObject({ ready: true, medianHr: 72, reason: 'ready' });
  });

  it('withholds acceptance during warm-up or without a face', () => {
    expect(assessPulseSession(readySamples, {
      sessionStartedAt,
      facePresent: true,
      now: sessionStartedAt + PULSE_MIN_SESSION_MS - 1,
    })).toMatchObject({ ready: false, medianHr: null, reason: 'warming_up' });
    expect(assessPulseSession(readySamples, {
      sessionStartedAt,
      facePresent: false,
      now: latestTimestamp,
    })).toMatchObject({ ready: false, medianHr: null, reason: 'face_lost' });
  });

  it('rejects stale samples and gaps instead of accepting an old ready window', () => {
    expect(assessPulseSession(readySamples, {
      sessionStartedAt,
      facePresent: true,
      now: latestTimestamp + PULSE_MAX_SAMPLE_AGE_MS + 1,
    })).toMatchObject({ ready: false, medianHr: null, reason: 'stale' });

    const withGap = readySamples.map((entry, index) => index === readySamples.length - 1
      ? { ...entry, timestamp: entry.timestamp + 5_000 }
      : entry);
    expect(assessPulseSession(withGap, {
      sessionStartedAt,
      facePresent: true,
      now: withGap[withGap.length - 1].timestamp,
    })).toMatchObject({ ready: false, medianHr: null, reason: 'stale' });
  });

  it('tolerates one odd sample among the latest five, but not the newest', () => {
    // Eight samples one second apart, as in a real scan window.
    const t0 = latestTimestamp - 7_000;
    const good = (i: number) => sample(72, 0.8, t0 + i * 1_000);
    const odd = [0, 1, 2, 3, 4, 5].map(good).concat(sample(300, 0.95, t0 + 6_000), good(7));
    expect(assessPulseSession(odd, { sessionStartedAt: t0 - 20_000, facePresent: true, now: latestTimestamp })).toMatchObject({ ready: true, medianHr: 72 });
    const twoOdd = [0, 1, 2, 3, 4].map(good).concat(sample(300, 0.95, t0 + 5_000), sample(25, 0.95, t0 + 6_000), good(7));
    expect(assessPulseSession(twoOdd, { sessionStartedAt: t0 - 20_000, facePresent: true, now: latestTimestamp }).ready).toBe(false);
  });

  it('does not hide a new implausible sample behind older good samples', () => {
    const samples = [...readySamples, sample(300, 0.95, latestTimestamp + 1_000)];
    expect(assessPulseSession(samples, {
      sessionStartedAt,
      facePresent: true,
      now: latestTimestamp + 1_000,
    })).toMatchObject({ ready: false, medianHr: null });
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
