/// <reference lib="webworker" />
import { AutoTokenizer, StyleTextToSpeech2Model, Tensor, env } from '@huggingface/transformers';
import { phonemize } from 'phonemizer';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const STYLE_WIDTH = 256;
const SAMPLE_RATE = 24_000;

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false; // The service worker caches the static assets for the PWA.

function loadVoice(vendorUrl: string) {
  env.localModelPath = new URL('kokoro/', vendorUrl).href;
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.wasmPaths = new URL('ort/', vendorUrl).href;
  }
  return Promise.all([
    StyleTextToSpeech2Model.from_pretrained(MODEL, { device: 'wasm', dtype: 'q8', local_files_only: true }),
    AutoTokenizer.from_pretrained(MODEL, { local_files_only: true }),
    fetch(new URL(`${MODEL}/voices/af_heart.bin`, env.localModelPath)).then(async (response) => {
      if (!response.ok) throw new Error('Sol’s voice data could not load');
      return new Float32Array(await response.arrayBuffer());
    }),
  ]);
}

let ready: ReturnType<typeof loadVoice> | undefined;

self.onmessage = async ({ data }: MessageEvent<{ id: number; vendorUrl: string; text?: string }>) => {
  const { id, vendorUrl, text } = data;
  try {
    const [model, tokenizer, styles] = await (ready ??= loadVoice(vendorUrl));
    if (text === undefined) {
      self.postMessage({ id });
      return;
    }
    // Preserve sentence punctuation for prosody. Pronounce the app name like “soul”.
    const parts = text.replace(/\bSol\b/gi, 'soul').replace(/[’]/g, "'").split(/((?<!\d)\.|\.(?!\d)|[,;:!?—…]+)/);
    const phones = (await Promise.all(parts.map(async (part, index) => {
      if (index % 2 || !part.trim()) return part;
      const leading = part.match(/^\s*/)?.[0] ?? '';
      const trailing = part.match(/\s*$/)?.[0] ?? '';
      return leading + (await phonemize(part.trim(), 'en-us')).join(' ') + trailing;
    }))).join('').replaceAll('r', 'ɹ').replaceAll('ʲ', 'j');
    const { input_ids } = tokenizer(phones, { truncation: true });
    const offset = Math.min(Math.max(input_ids.dims.at(-1)! - 2, 0), styles.length / STYLE_WIDTH - 1) * STYLE_WIDTH;
    const { waveform } = await model({
      input_ids,
      style: new Tensor('float32', styles.slice(offset, offset + STYLE_WIDTH), [1, STYLE_WIDTH]),
      speed: new Tensor('float32', [0.96], [1]),
    });
    const samples = waveform.data as Float32Array<ArrayBuffer>;
    self.postMessage({ id, samples, sampleRate: SAMPLE_RATE }, [samples.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Sol’s voice could not start' });
  }
};
