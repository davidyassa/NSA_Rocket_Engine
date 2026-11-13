import { BrowserAdapter, type HeartRateData, type FaceData } from 'vitalcamera-sdk';

export interface PulseCheckCallbacks {
  onHeartRate: (data: { hr: number; sqi: number; timestamp: number }) => void;
  onFaceDetected: (detected: boolean) => void;
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

export class VitalCameraService {
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
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
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
          enableHrv: false,
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
            callbacks.onFaceDetected(Boolean(face && face.box));
          }
        });

        this.adapter.vitalcamera.on('error', (err: { source: string; message: string }) => {
          if (!this.isDestroyed) {
            callbacks.onError(new Error(`[${err.source}] ${err.message}`));
          }
        });
      }

      this.adapter.start();
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
    this.releaseStream();

    if (this.adapter) {
      try {
        await this.adapter.destroy();
      } catch {
        // Ignore destruction errors during rapid unmount
      }
      this.adapter = null;
    }
  }
}
