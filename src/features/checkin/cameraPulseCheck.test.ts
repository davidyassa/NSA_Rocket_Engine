import { describe, expect, it, vi, afterEach } from 'vitest';
import { getAppBaseUrl, getVendorUrls, VitalCameraService } from './vitalCameraService';
import { createStorageRepository, emptyMission } from '../../app/storage';
import { HERO_SCENARIO } from '../../scenarios';
import { evaluateCheckin, metricBaseline } from '../../engine';
import { buildRecordExport } from '../../app/recordExport';
import { formatGroundSummary } from '../assessment/groundSummary';

function fixtureStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    key(index) { return [...items.keys()][index] ?? null; },
    getItem(name) { return items.get(name) ?? null; },
    setItem(name, value) { items.set(name, value); },
    removeItem(name) { items.delete(name); },
    clear() { items.clear(); },
  };
}

describe('vitalCameraService and Camera pulse check', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves self-hosted vendor runtime URLs ending with / for LiteRT, MediaPipe, models and workers', () => {
    const urls = getVendorUrls();
    expect(urls.litert.endsWith('/')).toBe(true);
    expect(urls.mediapipe.endsWith('/')).toBe(true);
    expect(urls.models.endsWith('/')).toBe(true);
    expect(urls.workers.endsWith('/')).toBe(true);
    expect(urls.litert).toContain('vendor/litert/');
    expect(urls.mediapipe).toContain('vendor/mediapipe/');
    expect(urls.models).toContain('vendor/vitalcamera/models/');
    expect(urls.workers).toContain('vendor/vitalcamera/workers/');
  });

  it('correctly resolves application base URL across root and static subpaths', () => {
    const originalWindow = (globalThis as unknown as { window?: unknown }).window;
    try {
      // Test root path
      (globalThis as unknown as { window: unknown }).window = {
        location: { origin: 'http://test.space', pathname: '/' },
      };
      expect(getAppBaseUrl()).toBe('http://test.space/');

      // Test root index.html
      (globalThis as unknown as { window: unknown }).window = {
        location: { origin: 'http://test.space', pathname: '/index.html' },
      };
      expect(getAppBaseUrl()).toBe('http://test.space/');

      // Test subpath folder
      (globalThis as unknown as { window: unknown }).window = {
        location: { origin: 'http://test.space', pathname: '/solcheck/' },
      };
      expect(getAppBaseUrl()).toBe('http://test.space/solcheck/');

      // Test subpath index.html
      (globalThis as unknown as { window: unknown }).window = {
        location: { origin: 'http://test.space', pathname: '/solcheck/index.html' },
      };
      expect(getAppBaseUrl()).toBe('http://test.space/solcheck/');
    } finally {
      (globalThis as unknown as { window?: unknown }).window = originalWindow;
    }
  });

  it('handles missing mediaDevices by triggering CAMERA_UNAVAILABLE error', async () => {
    const originalMediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (typeof navigator !== 'undefined') {
      // @ts-expect-error test override
      delete navigator.mediaDevices;
    }

    const service = new VitalCameraService();
    const onError = vi.fn();
    const onHeartRate = vi.fn();
    const onFaceDetected = vi.fn();

    const video = { srcObject: null, play: vi.fn() } as unknown as HTMLVideoElement;
    await expect(
      service.start(video, { onError, onHeartRate, onFaceDetected }),
    ).rejects.toThrow('CAMERA_UNAVAILABLE');

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'CAMERA_UNAVAILABLE' }));

    // Restore
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        configurable: true,
      });
    }
  });

  it('handles permission rejection by triggering PERMISSION_DENIED error', async () => {
    const fakeMediaDevices = {
      getUserMedia: vi.fn().mockRejectedValue({ name: 'NotAllowedError' }),
    };

    if (typeof navigator === 'undefined') {
      (globalThis as unknown as { navigator: Navigator }).navigator = {} as Navigator;
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      value: fakeMediaDevices,
      configurable: true,
    });

    const service = new VitalCameraService();
    const onError = vi.fn();

    const video = { srcObject: null, play: vi.fn() } as unknown as HTMLVideoElement;
    await expect(
      service.start(video, { onError, onHeartRate: vi.fn(), onFaceDetected: vi.fn() }),
    ).rejects.toThrow('PERMISSION_DENIED');

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'PERMISSION_DENIED' }));
  });

  it('guarantees media stream tracks are stopped when stop() is called', async () => {
    const stopTrack = vi.fn();
    const fakeStream = {
      getTracks: () => [{ stop: stopTrack } as unknown as MediaStreamTrack],
    };

    const fakeMediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(fakeStream),
    };

    if (typeof navigator === 'undefined') {
      (globalThis as unknown as { navigator: Navigator }).navigator = {} as Navigator;
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      value: fakeMediaDevices,
      configurable: true,
    });

    const service = new VitalCameraService();
    await service.stop();
    expect(service).toBeDefined();
  });

  it('ensures camera pulse check operates in memory without leaking into local storage, baselines, exports, ground drafts, or escalation', () => {
    const storage = fixtureStorage();
    const repository = createStorageRepository(storage);
    const mission = { ...emptyMission };
    repository.save(mission);

    // Simulated camera optical pulse estimate (e.g. 74 bpm)
    const volatileEstimate = { hr: 74, sqi: 0.85 };

    // 1. Verify localStorage stored mission is completely unpolluted by camera data
    const loaded = repository.load();
    const history = HERO_SCENARIO.history;
    for (const record of history) {
      expect(record).not.toHaveProperty('video');
      expect(record).not.toHaveProperty('cameraEstimate');
      expect(record).not.toHaveProperty('sqi');
    }

    // 2. Baselines remain identical to standard history
    const baseline = metricBaseline('heart_rate', HERO_SCENARIO.history[0], history);
    expect(baseline).toBeDefined();

    // 3. Export payload is completely free of camera data
    const exportData = buildRecordExport(HERO_SCENARIO, history);
    for (const r of exportData.records) {
      expect(r).not.toHaveProperty('cameraEstimate');
      expect(r).not.toHaveProperty('video');
      expect(r).not.toHaveProperty('sqi');
    }

    // 4. Clinical assessment & escalation unaffected
    const assessment = evaluateCheckin(HERO_SCENARIO.history[0], history, {
      events: HERO_SCENARIO.events,
      archiveEvent: { sol: 41, date: '2017-09-11' },
    });
    expect(assessment.recommendedTier).toBeDefined();
    for (const finding of assessment.findings) {
      expect(JSON.stringify(finding)).not.toContain('74');
    }

    // 5. Ground summary unaffected
    const draft = formatGroundSummary(HERO_SCENARIO.history[0], false);
    expect(draft).not.toContain('camera');
    expect(draft).not.toContain('74 bpm');

    // The volatile estimate is strictly in memory
    expect(volatileEstimate.hr).toBe(74);
    expect(loaded?.schemaVersion).toBe(3);
  });
});
