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
      finish(false);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('states')) db.createObjectStore('states');
    };
    request.onerror = () => finish(false);
    request.onblocked = () => finish(false);
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
        transaction.onerror = () => finish(false, db);
        transaction.onabort = () => finish(false, db);
      } catch {
        finish(false, db);
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
      if (this.isDestroyed || this.adapter !== adapter) return;
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
    const track = this.stream?.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== 'function') return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (this.isDestroyed || track.readyState !== 'live') return;
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
  private isDestroyed = false;

  async start(videoEl: HTMLVideoElement, callbacks: PulseCheckCallbacks): Promise<void> {
    this.isDestroyed = false;
    this.videoEl = videoEl;

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      const err = new Error('CAMERA_UNAVAILABLE');
      callbacks.onError(err);
      throw err;
    }

    // 1. Request video-only stream
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        // 30 fps matters: the pulse is a tiny colour change, and slow cameras blur it away.
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, min: 15 } },
        audio: false,
      });
    } catch (err) {
      const name = (err as { name?: string }).name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        const error = new Error('PERMISSION_DENIED');
        callbacks.onError(error);
        throw error;
      }
      const error = new Error('CAMERA_UNAVAILABLE');
      callbacks.onError(error);
      throw error;
    }

    if (this.isDestroyed) {
      this.releaseStream();
      return;
    }

    videoEl.srcObject = this.stream;
    try {
      await videoEl.play();
    } catch {
      // Ignore autoplay errors if component already unmounted
    }
    void this.stabilizeCamera();

    if (this.isDestroyed) {
      this.releaseStream();
      return;
    }

    // 2. Preload only models required for pulse & signal quality
    const urls = getVendorUrls();
    let models: Record<string, ArrayBuffer>;
    try {
      models = await BrowserAdapter.loadModels(urls.models, {
        emotion: false,
        gaze: false,
        faceLandmarker: false,
      });

      // Also preload blaze_face_short_range as buffer for seamless offline detection
      try {
        const blazeResp = await fetch(urls.models + 'blaze_face_short_range.tflite');
        if (blazeResp.ok) {
          models.faceDetector = await blazeResp.arrayBuffer();
        }
      } catch {
        // Fallback to URL path in adapter
      }
    } catch (err) {
      this.releaseStream();
      const error = err instanceof Error ? err : new Error('MODEL_LOAD_FAILED');
      callbacks.onError(error);
      throw error;
    }

    if (this.isDestroyed) {
      this.releaseStream();
      return;
    }

    // 3. Initialize BrowserAdapter with feature switches and runtimeBaseUrls
    const stateCleared = await clearVitalCameraInferenceState();
    if (!stateCleared) {
      this.releaseStream();
      const error = new Error('Saved camera inference state could not be cleared. Clear this site’s stored data or enter your heart rate manually.');
      callbacks.onError(error);
      throw error;
    }
    if (this.isDestroyed) {
      this.releaseStream();
      return;
    }

    try {
      this.adapter = new BrowserAdapter({
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

      try {
        const timeoutMs = 15000;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error('Camera initialization timed out. Please check camera access or enter your heart rate manually.'));
          }, timeoutMs);
        });

        try {
          await Promise.race([this.adapter.init(), timeoutPromise]);
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        }
      } catch (initErr) {
        if (this.isDestroyed) {
          await this.stop();
          return;
        }
        throw initErr;
      }

      if (this.isDestroyed) {
        await this.stop();
        return;
      }

      if (this.adapter.vitalcamera) {
        this.adapter.vitalcamera.on('heartrate', (data: HeartRateData) => {
          if (!this.isDestroyed && data && typeof data.hr === 'number') {
            callbacks.onHeartRate({
              hr: data.hr,
              sqi: data.sqi ?? 0,
              timestamp: data.timestamp || Date.now(),
            });
          }
        });

        this.adapter.vitalcamera.on('face', (face: FaceData | null) => {
          if (!this.isDestroyed) {
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
          this.adapter.vitalcamera.on('bvp', (data: { value: number; timestamp: number }) => {
            if (!this.isDestroyed && Number.isFinite(data?.value) && Number.isFinite(data?.timestamp)) {
              callbacks.onBvp?.({ t: this.realTime(data.timestamp), v: data.value });
            }
          });
        }
        if (callbacks.onBeat) {
          this.adapter.vitalcamera.on('beat', (data: { ibi: number; timestamp: number }) => {
            if (!this.isDestroyed && Number.isFinite(data?.ibi) && Number.isFinite(data?.timestamp)) {
              callbacks.onBeat?.({ t: this.realTime(data.timestamp), ibi: data.ibi });
            }
          });
        }
        if (callbacks.onHrv) {
          this.adapter.vitalcamera.on('hrv', (data: { rmssd: number | null; sdnn: number | null; n: number; reject: string | null }) => {
            if (!this.isDestroyed && data) {
              callbacks.onHrv?.({ rmssd: data.rmssd, sdnn: data.sdnn, n: data.n ?? 0, reject: data.reject ?? null });
            }
          });
        }

        this.adapter.vitalcamera.on('error', (err: { source: string; message: string }) => {
          if (!this.isDestroyed) {
            callbacks.onError(new Error(`[${err.source}] ${err.message}`));
          }
        });
      }

      if (!this.startFrameLoop(this.adapter, videoEl as FrameVideo)) this.adapter.start();
    } catch (err) {
      await this.stop();
      const error = err instanceof Error ? err : new Error('ADAPTER_INIT_FAILED');
      callbacks.onError(error);
      throw error;
    }
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
    this.isDestroyed = true;
    if (this.frameHandle !== null && this.videoEl) {
      (this.videoEl as FrameVideo).cancelVideoFrameCallback?.(this.frameHandle);
    }
    this.frameHandle = null;
    this.realTimeOf.clear();
    this.releaseStream();

    if (this.adapter) {
      try {
        await this.adapter.destroy();
      } catch {
        // Ignore destruction errors during rapid unmount
      }
      this.adapter = null;
    }

    await clearVitalCameraInferenceState();
  }
}
