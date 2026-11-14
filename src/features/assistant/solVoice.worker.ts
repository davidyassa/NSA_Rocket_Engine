/// <reference lib="webworker" />
/**
 * Sol's on-device voice, in a Web Worker.
 *  1. Piper "lessac" (fast VITS voice: several times faster than Kokoro, also on phones);
 *  2. Kokoro 82M as a fallback if Piper cannot load.
 * Both run on WASM from the app's own files; no text leaves the device.
 */
import { AutoTokenizer, StyleTextToSpeech2Model, Tensor, env } from '@huggingface/transformers';
import * as ort from 'onnxruntime-web';
import { phonemize } from 'phonemizer';
import { PIPER_NOISE, SOL_SPEED, piperIds, piperPhonemes, speakableText } from './piperPhonemes';

const PIPER_VOICE = 'en_US-lessac-medium';
const KOKORO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const STYLE_WIDTH = 256;
const KOKORO_RATE = 24_000;

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false; // The service worker caches the static assets for the PWA.

/** Use more CPU cores when the page allows shared memory (cross-origin isolated). */
const THREADS = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;

type Voice = (text: string) => Promise<{ samples: Float32Array<ArrayBuffer>; sampleRate: number }>;

const phonemizeClause = (clause: string) => phonemize(clause, 'en-us');

async function loadPiper(vendorUrl: string): Promise<Voice> {
  const base = new URL(`piper/${PIPER_VOICE}`, vendorUrl).href;
  const [modelResponse, configResponse] = await Promise.all([fetch(`${base}.onnx`), fetch(`${base}.onnx.json`)]);
  if (!modelResponse.ok || !configResponse.ok) throw new Error('Piper voice files are missing');
  const config = await configResponse.json() as {
    audio: { sample_rate: number };
    inference: { length_scale: number };
    phoneme_id_map: Record<string, number[]>;
  };
  const session = await ort.InferenceSession.create(new Uint8Array(await modelResponse.arrayBuffer()), { executionProviders: ['wasm'] });
  const { length_scale } = config.inference;
  return async (text) => {
    const ids = piperIds(await piperPhonemes(text, phonemizeClause), config.phoneme_id_map);
    const output = await session.run({
      input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([PIPER_NOISE.scale, length_scale / SOL_SPEED, PIPER_NOISE.width]), [3]),
    });
    const audio = Object.values(output)[0].data as Float32Array<ArrayBuffer>;
    return { samples: trimSilence(Float32Array.from(audio), config.audio.sample_rate), sampleRate: config.audio.sample_rate };
  };
}

async function loadKokoro(vendorUrl: string): Promise<Voice> {
  env.localModelPath = new URL('kokoro/', vendorUrl).href;
  const [model, tokenizer, styles] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(KOKORO, { device: 'wasm', dtype: 'q8', local_files_only: true }) as Promise<StyleTextToSpeech2Model>,
    AutoTokenizer.from_pretrained(KOKORO, { local_files_only: true }),
    fetch(new URL(`${KOKORO}/voices/af_heart.bin`, env.localModelPath)).then(async (response) => {
      if (!response.ok) throw new Error('Sol’s voice data could not load');
      return new Float32Array(await response.arrayBuffer());
    }),
  ]);
  return async (text) => {
    const phones = (await piperPhonemes(speakableText(text), phonemizeClause)).replaceAll('r', 'ɹ').replaceAll('ʲ', 'j');
    const { input_ids } = tokenizer(phones, { truncation: true });
    const offset = Math.min(Math.max(input_ids.dims.at(-1)! - 2, 0), styles.length / STYLE_WIDTH - 1) * STYLE_WIDTH;
    const { waveform } = await model({
      input_ids,
      style: new Tensor('float32', styles.slice(offset, offset + STYLE_WIDTH), [1, STYLE_WIDTH]),
      speed: new Tensor('float32', [SOL_SPEED], [1]),
    });
    return { samples: trimSilence(waveform.data as Float32Array<ArrayBuffer>, KOKORO_RATE), sampleRate: KOKORO_RATE };
  };
}

async function loadVoice(vendorUrl: string): Promise<Voice> {
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.numThreads = THREADS;
    env.backends.onnx.wasm.wasmPaths = new URL('ort/', vendorUrl).href;
  }
  try {
    return await loadPiper(vendorUrl);
  } catch (error) {
    console.warn('[Sol voice] Piper unavailable, using Kokoro:', error);
    return loadKokoro(vendorUrl);
  }
}

/** Cut the model's silent padding so sentences follow each other without dead air. */
function trimSilence(samples: Float32Array<ArrayBuffer>, rate: number): Float32Array<ArrayBuffer> {
  const threshold = 0.004;
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < threshold) first += 1;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last -= 1;
  const start = Math.max(0, first - Math.round(rate * 0.02));
  const end = Math.min(samples.length, last + Math.round(rate * 0.09));
  return start === 0 && end === samples.length ? samples : samples.slice(start, end);
}

let ready: Promise<Voice> | undefined;

self.onmessage = async ({ data }: MessageEvent<{ id: number; vendorUrl: string; text?: string }>) => {
  const { id, vendorUrl, text } = data;
  try {
    const voice = await (ready ??= loadVoice(vendorUrl));
    if (text === undefined) {
      self.postMessage({ id });
      return;
    }
    const { samples, sampleRate } = await voice(text);
    self.postMessage({ id, samples, sampleRate }, [samples.buffer]);
  } catch (error) {
    ready = undefined;
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Sol’s voice could not start' });
  }
};
