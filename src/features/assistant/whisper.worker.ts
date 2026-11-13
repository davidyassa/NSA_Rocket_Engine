/// <reference lib="webworker" />
/**
 * On-device speech-to-text (Whisper tiny, English) in a Web Worker.
 * Model and runtime load ONLY from the app's own files (vendor/whisper, vendor/ort):
 * no remote model hub, and audio never leaves this worker.
 */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.allowLocalModels = true;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1; // no cross-origin isolation needed
}

const MODEL = 'Xenova/whisper-tiny.en';
let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function load() {
  // Typed loosely: transformers.js' full pipeline union is too large for the compiler.
  const create = pipeline as unknown as (task: string, model: string, options: object) => Promise<AutomaticSpeechRecognitionPipeline>;
  asr ??= (create('automatic-speech-recognition', MODEL, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file && p.total) self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total });
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>);
  return asr;
}

self.onmessage = async (event: MessageEvent<{ type: 'load'; vendorUrl: string } | { type: 'transcribe'; id: number; audio: Float32Array }>) => {
  const message = event.data;
  try {
    if (message.type === 'load') {
      // The worker lives under src/ in dev and assets/ in the built app.
      env.localModelPath = new URL('whisper/', message.vendorUrl).href;
      if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = new URL('ort/', message.vendorUrl).href;
      await load();
      self.postMessage({ type: 'ready' });
    } else if (message.type === 'transcribe') {
      const run = await load();
      const output = await run(message.audio);
      const text = (Array.isArray(output) ? output[0]?.text : output.text) ?? '';
      self.postMessage({ type: 'text', id: message.id, text: text.trim() });
    }
  } catch (error) {
    self.postMessage({ type: 'error', id: 'id' in message ? message.id : undefined, message: error instanceof Error ? error.message : String(error) });
  }
};
