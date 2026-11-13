declare module 'vitalcamera-sdk' {
  export interface BrowserAdapterConfig {
    videoElement?: HTMLVideoElement | null;
    models?: Record<string, ArrayBuffer> | null;
    modelBasePath?: string;
    workerBasePath?: string | null;
    cameraFacing?: string;
    canvases?: {
      bvp?: HTMLCanvasElement;
      psd?: HTMLCanvasElement;
      trend?: HTMLCanvasElement;
    } | null;
    manageCamera?: boolean;
    runtimeBaseUrls?: {
      litert?: string;
      mediapipe?: string;
    };
    vitalcameraConfig?: {
      enableFaceLandmarker?: boolean;
      enableEmotion?: boolean;
      enableGaze?: boolean;
      enableHrv?: boolean;
      enableHeadPose?: boolean;
      sqiThreshold?: number;
      [key: string]: unknown;
    };
  }

  export interface HeartRateData {
    hr: number;
    sqi: number;
    timestamp: number;
    psd?: number[];
    freq?: number[];
    peak?: number;
  }

  export interface FaceData {
    box: { x: number; y: number; w: number; h: number };
    keypoints?: Array<{ x: number; y: number }>;
    videoWidth: number;
    videoHeight: number;
    timestamp: number;
  }

  export class VitalCamera {
    on(event: 'heartrate', callback: (data: HeartRateData) => void): void;
    on(event: 'face', callback: (data: FaceData | null) => void): void;
    on(event: 'error', callback: (data: { source: string; message: string }) => void): void;
    off(event: string, callback?: (...args: unknown[]) => void): void;
    start(): void;
    stop(): void;
    destroy(): void;
  }

  export class BrowserAdapter {
    constructor(config: BrowserAdapterConfig);
    init(): Promise<void>;
    start(): void;
    stop(): void;
    destroy(): Promise<void>;
    vitalcamera: VitalCamera;
    static loadModels(
      basePath?: string,
      options?: { emotion?: boolean; gaze?: boolean; faceLandmarker?: boolean }
    ): Promise<Record<string, ArrayBuffer>>;
    static MODEL_FILES: Record<string, string>;
  }
}
