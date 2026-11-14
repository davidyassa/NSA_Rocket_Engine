import { BrowserAdapter, type HeartRateData, type FaceData } from 'vitalcamera-sdk';

export interface PulseCheckCallbacks {
  onHeartRate: (data: { hr: number; sqi: number; timestamp: number }) => void;
  onFaceDetected: (detected: boolean) => void;
  /** Face centre and width as fractions of the camera frame (raw, not mirrored); null when no face. */
  onFaceBox?: (box: { cx: number; cy: number; size: number } | null) => void;
  /** Raw camera pulse wave sample (blood-volume pulse), ms timestamp. Used for breathing rate. */
  onBvp?: (sample: { t: number; v: number }) => void;
  /** One detected heartbeat: inter-beat interval (ms) and peak time (ms). */
  onBeat?: (beat: { t: number; ibi: number }) => void;
  /** Heart-rate variability from the SDK; rmssd is null with a reason while not trustworthy. */
  onHrv?: (hrv: { rmssd: number | null; sdnn: number | null; n: number; reject: string | null }) => void;
  onError: (error: Error) => void;
}

export function getAppBaseUrl(): string {
  if (typeof window === 'undefined' || !window.location) {
    return 'http://localhost:4173/';
  }
  const loc = window.location;
  // If the pathname ends with a file (e.g. index.html), remove the filename
  const cleanPathname = loc.pathname.replace(/\/[^/]*\.[^/]+$/, '/');
  // Ensure trailing slash
  const directoryPath = cleanPathname.endsWith('/') ? cleanPathname : cleanPathname + '/';
  return new URL(directoryPath, loc.origin).href;
}

export function getVendorUrls() {
  const base = getAppBaseUrl();
  return {
    litert: new URL('vendor/litert/', base).href,
    mediapipe: new URL('vendor/mediapipe/', base).href,
    models: new URL('vendor/vitalcamera/models/', base).href,
    workers: new URL('vendor/vitalcamera/workers/', base).href,
  };
}

export function clearVitalCameraInferenceState(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(true);

  return new Promise(resolve => {
    let settled = false;
    let request: IDBOpenDBRequest;
    const finish = (cleared: boolean, db?: IDBDatabase) => {
      if (settled) return;
      settled = true;
      db?.close();
      resolve(cleared);
    };

    try {
      request = indexedDB.open('VitalCameraSDK', 1);
    } catch {
      finish(true);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('states')) db.createObjectStore('states');
    };
    request.onerror = () => finish(true);
    request.onblocked = () => finish(true);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('states')) {
        finish(true, db);
        return;
      }
      try {
        const transaction = db.transaction('states', 'readwrite');
        transaction.objectStore('states').delete('inferenceState');
        transaction.oncomplete = () => finish(true, db);
        transaction.onerror = () => finish(true, db);
        transaction.onabort = () => finish(true, db);
      } catch {
        finish(true, db);
      }
    };
  });
}

type TrackCapabilitiesLike = { whiteBalanceMode?: string[]; exposureMode?: string[] };
type TrackSettingsLike = { colorTemperature?: number; exposureTime?: number; frameRate?: number };

type FrameMetadata = { captureTime?: number; mediaTime?: number };
type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: FrameMetadata) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};
/** Private SDK fields used to give the model the real frame timing (see startFrameLoop). */
type AdapterTiming = { _dval?: number; _virtualTime?: number };

/** Frames closer together than this are skipped, so the model always sees about 30 fps. */
const MIN_FRAME_GAP_MS = 25;
/** Rolling window used to measure the camera's real frame interval. */
const DT_WINDOW = 90;
const STARTUP_TIMEOUT_MS = 30_000;
const ANALYSIS_FAILED = 'Camera analysis could not start. Try again or enter your readings by hand.';
const ANALYSIS_UNSUPPORTED = 'Camera analysis is unavailable in this app or browser version.';

export class VitalCameraService {
  private frameHandle: number | null = null;
  /** SDK's smoothed frame time → real camera capture time, so pulse timing is exact. */
  private realTimeOf = new Map<number, number>();
  /** Measured camera frame rate (frames per second), null until known. */
  measuredFps: number | null = null;

  /**
   * Feed the camera model one call per NEW camera frame, with its real capture
   * time, instead of the SDK's 30 Hz animation loop. Why:
   *  - A 15–24 fps laptop camera polled at 30 Hz gives the model repeated frames,
   *    which blur the pulse and slow the reading down.
   *  - The SDK assumes 1/30 s per frame and corrects that only very slowly
   *    (0.3% per frame, ~11 s), so on a slower camera the heart rate is
   *    mis-scaled for the first part of every scan. We set the frame interval
   *    from the measured camera rate every frame instead.
   * Falls back to the SDK loop on browsers without requestVideoFrameCallback.
   */
  private startFrameLoop(adapter: BrowserAdapter, video: FrameVideo): boolean {
    if (typeof video.requestVideoFrameCallback !== 'function') return false;
    const timing = adapter as unknown as AdapterTiming;
    const dts: number[] = [];
    let lastProcessed = 0;
    // One clock for the whole scan: the camera's capture time when the browser gives it,
    // else the frame's media time (shifted onto the page clock), else the callback time.
    let clock: 'capture' | 'media' | 'now' | null = null;
    let mediaOffset = 0;
    const onFrame = (now: number, meta: FrameMetadata) => {
      if (this.adapter !== adapter) return;
      this.frameHandle = video.requestVideoFrameCallback!(onFrame);
      if (clock === null) {
        clock = typeof meta?.captureTime === 'number' && meta.captureTime > 0 ? 'capture'
          : typeof meta?.mediaTime === 'number' && meta.mediaTime > 0 ? 'media' : 'now';
        mediaOffset = now - (meta?.mediaTime ?? 0) * 1000;
      }
      const captured = clock === 'capture' ? meta.captureTime ?? now
        : clock === 'media' ? (meta.mediaTime ?? 0) * 1000 + mediaOffset : now;
      if (lastProcessed > 0 && captured - lastProcessed < MIN_FRAME_GAP_MS) return;
      if (lastProcessed > 0) {
        const dt = captured - lastProcessed;
        if (dt > 0 && dt < 1000) {
          dts.push(dt);
          if (dts.length > DT_WINDOW) dts.shift();
        }
        if (dts.length >= 5) {
          const sorted = [...dts].sort((a, b) => a - b);
          const frameSeconds = sorted[Math.floor(sorted.length / 2)] / 1000;
          if (typeof timing._dval === 'number') timing._dval = frameSeconds;
          this.measuredFps = Math.round(10 / frameSeconds) / 10;
        }
      }
      lastProcessed = captured;
      adapter.processVideoFrame(video, captured);
      if (typeof timing._virtualTime === 'number') {
        this.realTimeOf.set(timing._virtualTime, captured);
        if (this.realTimeOf.size > 600) this.realTimeOf.delete(this.realTimeOf.keys().next().value as number);
      }
    };
    adapter.vitalcamera.start();
    this.frameHandle = video.requestVideoFrameCallback(onFrame);
    return true;
  }

  /** Real capture time for an SDK timestamp (falls back to the SDK time). */
  private realTime(sdkTime: number): number {
    return this.realTimeOf.get(sdkTime) ?? sdkTime;
  }

  /**
   * Auto-exposure and auto white balance keep nudging brightness and colour,
   * which drowns the tiny pulse signal. Once the camera has settled (about 2 s),
   * lock both at their current values where the device allows it (most Android
   * phones; browsers without support simply ignore this). Best effort only.
   */
  private async stabilizeCamera(): Promise<void> {
    const stream = this.stream;
    const track = stream?.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== 'function') return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (this.stream !== stream || track.readyState !== 'live') return;
    try {
      const caps = track.getCapabilities() as TrackCapabilitiesLike;
      const settings = track.getSettings() as TrackSettingsLike;
      const advanced: Record<string, unknown> = {};
      if (caps.whiteBalanceMode?.includes('manual')) {
        advanced.whiteBalanceMode = 'manual';
        if (settings.colorTemperature) advanced.colorTemperature = settings.colorTemperature;
      }
      if (caps.exposureMode?.includes('manual') && settings.exposureTime) {
        advanced.exposureMode = 'manual';
        advanced.exposureTime = settings.exposureTime;
      }
      if (Object.keys(advanced).length) await track.applyConstraints({ advanced: [advanced as MediaTrackConstraintSet] });
    } catch {
      // Unsupported on this device; auto settings stay on.
    }
  }

  private adapter: BrowserAdapter | null = null;
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private scan: AbortController | null = null;

  async start(videoEl: HTMLVideoElement, callbacks: PulseCheckCallbacks): Promise<void> {
    if (this.scan) return;
    const scan = new AbortController();
    this.scan = scan;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<void>(resolve => scan.signal.addEventListener('abort', () => resolve(), { once: true }));

    try {
      if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
        throw new Error('CAMERA_UNAVAILABLE');
      }
      // The SDK uses an offscreen 2D canvas for each face crop.
      if (typeof OffscreenCanvas !== 'function' || !new OffscreenCanvas(1, 1).getContext('2d')) {
        throw new Error(ANALYSIS_UNSUPPORTED);
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        audio: false,
      }).catch((error: DOMException) => {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          throw new Error('PERMISSION_DENIED');
        }
        throw new Error('CAMERA_UNAVAILABLE');
      });
      if (scan.signal.aborted) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      this.stream = stream;
      this.videoEl = videoEl;
      videoEl.srcObject = stream;
      await Promise.race([
        this.initializeAnalysis(videoEl, callbacks, scan.signal),
        cancelled,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Camera analysis took too long to load')), STARTUP_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      if (scan.signal.aborted) return;
      const report = error instanceof Error && ['PERMISSION_DENIED', 'CAMERA_UNAVAILABLE', ANALYSIS_UNSUPPORTED].includes(error.message)
        ? error
        : new Error(ANALYSIS_FAILED, { cause: error });
      if (report.cause) console.warn('[VitalCamera] Capture setup failed:', report.cause);
      void this.stop();
      callbacks.onError(report);
      throw report;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async initializeAnalysis(videoEl: HTMLVideoElement, callbacks: PulseCheckCallbacks, signal: AbortSignal) {
    const urls = getVendorUrls();
    const [, models] = await Promise.all([
      videoEl.play().catch(() => { throw new Error('CAMERA_UNAVAILABLE'); }),
      BrowserAdapter.loadModels(urls.models, { emotion: false, gaze: false, faceLandmarker: false }),
      clearVitalCameraInferenceState(),
    ]);
    if (signal.aborted) return;
    void this.stabilizeCamera();

    const adapter = new BrowserAdapter({
      videoElement: videoEl,
      models,
      modelBasePath: urls.models,
      workerBasePath: urls.workers,
      runtimeBaseUrls: {
        litert: urls.litert,
        mediapipe: urls.mediapipe,
      },
      vitalcameraConfig: {
        enableFaceLandmarker: false,
        enableEmotion: false,
        enableGaze: false,
        enableHrv: true,
        enableHeadPose: false,
        sqiThreshold: 0.38,
      },
      manageCamera: false,
    });

    this.adapter = adapter;
    await adapter.init();
    if (signal.aborted) {
      await adapter.destroy();
      return;
    }

    adapter.vitalcamera.on('heartrate', (data: HeartRateData) => {
      if (!signal.aborted && data && typeof data.hr === 'number') {
        callbacks.onHeartRate({
          hr: data.hr,
          sqi: data.sqi ?? 0,
          timestamp: data.timestamp || Date.now(),
        });
      }
    });

    adapter.vitalcamera.on('face', (face: FaceData | null) => {
      if (!signal.aborted) {
        const detected = Boolean(face?.detected && face.box);
        callbacks.onFaceDetected(detected);
        if (callbacks.onFaceBox) {
          const box = face?.box;
          const width = face?.videoWidth ?? 0;
          const height = face?.videoHeight ?? 0;
          callbacks.onFaceBox(detected && box && width > 0 && height > 0
            ? { cx: (box.x + box.w / 2) / width, cy: (box.y + box.h / 2) / height, size: box.w / width }
            : null);
        }
      }
    });

    if (callbacks.onBvp) {
      adapter.vitalcamera.on('bvp', (data: { value: number; timestamp: number }) => {
        if (!signal.aborted && Number.isFinite(data?.value) && Number.isFinite(data?.timestamp)) {
          callbacks.onBvp?.({ t: this.realTime(data.timestamp), v: data.value });
        }
      });
    }
    if (callbacks.onBeat) {
      adapter.vitalcamera.on('beat', (data: { ibi: number; timestamp: number }) => {
        if (!signal.aborted && Number.isFinite(data?.ibi) && Number.isFinite(data?.timestamp)) {
          callbacks.onBeat?.({ t: this.realTime(data.timestamp), ibi: data.ibi });
        }
      });
    }
    if (callbacks.onHrv) {
      adapter.vitalcamera.on('hrv', (data: { rmssd: number | null; sdnn: number | null; n: number; reject: string | null }) => {
        if (!signal.aborted && data) {
          callbacks.onHrv?.({ rmssd: data.rmssd, sdnn: data.sdnn, n: data.n ?? 0, reject: data.reject ?? null });
        }
      });
    }

    adapter.vitalcamera.on('error', error => {
      if (signal.aborted) return;
      console.warn(`[VitalCamera ${error.source}] ${error.message}`);
      void this.stop();
      callbacks.onError(new Error('Camera analysis stopped. Try again or enter your readings by hand.'));
    });

    if (!this.startFrameLoop(adapter, videoEl)) adapter.start();
  }

  private releaseStream() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      }
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
  }

  async stop(): Promise<void> {
    this.scan?.abort();
    this.scan = null;
    if (this.frameHandle !== null && this.videoEl) {
      (this.videoEl as FrameVideo).cancelVideoFrameCallback?.(this.frameHandle);
    }
    this.frameHandle = null;
    this.realTimeOf.clear();
    this.measuredFps = null;
    this.releaseStream();

    const adapter = this.adapter;
    this.adapter = null;
    if (adapter) {
      try {
        await adapter.destroy();
      } catch {
        // Ignore destruction errors during rapid unmount.
      }
    }

    await clearVitalCameraInferenceState();
  }
}
