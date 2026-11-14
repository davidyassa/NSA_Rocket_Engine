/// <reference lib="webworker" />
/**
 * On-device speech-to-text in a Web Worker.
 *
 * Engine priority:
 *  1. Moonshine Tiny ONNX INT8 (variable-length encoder: short phrases transcribe fast)
 *  2. Whisper Tiny English ONNX INT8 (fallback)
 * Both run on WASM SIMD.
 *
 * Models and runtime load ONLY from local app files (vendor/moonshine, vendor/whisper, vendor/ort).
 * Audio never leaves this worker.
 */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.allowLocalModels = true;
if (env.backends.onnx.wasm) {
  // Several cores when the page is cross-origin isolated; one otherwise (works everywhere).
  env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
}

const MOONSHINE_MODEL = 'onnx-community/moonshine-tiny-ONNX';
const WHISPER_MODEL = 'Xenova/whisper-tiny.en';

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let activeEngine: 'moonshine' | 'whisper' = 'moonshine';

async function initPipeline(vendorUrl: string): Promise<AutomaticSpeechRecognitionPipeline> {
  const create = pipeline as unknown as (task: string, model: string, options: object) => Promise<AutomaticSpeechRecognitionPipeline>;
  const progressCallback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === 'progress' && p.file && p.total) {
      self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total });
    }
  };

  // Only 8-bit (q8) models ship with the app. WebGPU runs q8 layers back on the CPU with
  // copies in between (slower than WASM, and sometimes it fails mid-session), so both
  // engines run on WASM SIMD: fast, predictable, and the same on every device.
  const device = 'wasm';

  // 1. Moonshine Tiny: its encoder scales with the clip length, so "Hey Sol" is quick.
  try {
    env.localModelPath = new URL('moonshine/', vendorUrl).href;
    const instance = await create('automatic-speech-recognition', MOONSHINE_MODEL, {
      dtype: 'q8',
      device,
      progress_callback: progressCallback,
    });
    activeEngine = 'moonshine';
    self.postMessage({ type: 'engine_info', engine: 'moonshine', device });
    return instance;
  } catch (err) {
    console.warn('[ASR Engine] Moonshine Tiny unavailable, falling back to Whisper Tiny:', err);
  }

  // 2. Fallback to Whisper Tiny (English).
  env.localModelPath = new URL('whisper/', vendorUrl).href;
  const instance = await create('automatic-speech-recognition', WHISPER_MODEL, {
    dtype: 'q8',
    device,
    progress_callback: progressCallback,
  });
  activeEngine = 'whisper';
  self.postMessage({ type: 'engine_info', engine: 'whisper', device });
  return instance;
}

function load(vendorUrl: string) {
  asr ??= initPipeline(vendorUrl);
  return asr;
}

self.onmessage = async (event: MessageEvent<
  | { type: 'load'; vendorUrl: string }
  | { type: 'transcribe'; id: number; audio: Float32Array; speculative?: boolean }
>) => {
  const message = event.data;
  try {
    if (message.type === 'load') {
      if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = new URL('ort/', message.vendorUrl).href;
      await load(message.vendorUrl);
      self.postMessage({ type: 'ready', engine: activeEngine });
    } else if (message.type === 'transcribe') {
      const run = await load(new URL('vendor/', self.location.href).href);
      const output = await run(message.audio);
      const text = (Array.isArray(output) ? output[0]?.text : output.text) ?? '';
      self.postMessage({
        type: message.speculative ? 'speculative_text' : 'text',
        id: message.id,
        text: text.trim(),
        engine: activeEngine,
      });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: 'id' in message ? message.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
