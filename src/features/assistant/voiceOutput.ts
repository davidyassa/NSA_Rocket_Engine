import { urgentClipFor } from './urgentSpeech';

// Remove the old voice preference, which could include a saved API key.
try { localStorage.removeItem('sol-check:voice'); } catch { /* storage unavailable */ }

interface VoiceAudio {
  samples: Float32Array<ArrayBuffer>;
  sampleRate: number;
}

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (audio?: VoiceAudio) => void; reject: (error: Error) => void }>();
let output: AudioContext | undefined;
let current: AbortController | undefined;

function resetWorker(error: Error) {
  worker?.terminate();
  worker = undefined;
  pending.forEach(({ reject }) => reject(error));
  pending.clear();
}

function requestVoice(text?: string): Promise<VoiceAudio | undefined> {
  if (!worker) {
    worker = new Worker(new URL('./solVoice.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<Partial<VoiceAudio> & { id: number; error?: string }>) => {
      const request = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) {
        const error = new Error(data.error);
        request?.reject(error);
        resetWorker(error);
      } else {
        request?.resolve(data.samples && data.sampleRate ? { samples: data.samples, sampleRate: data.sampleRate } : undefined);
      }
    };
    worker.onerror = () => resetWorker(new Error('Sol’s voice worker could not start'));
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, text, vendorUrl: new URL('vendor/', document.baseURI).href });
  });
}

/** Unlock playback during active microphone capture or a user interaction. */
export function enableVoiceAudio() {
  try {
    output ??= new AudioContext();
    if (output.state !== 'running') void output.resume().catch(() => undefined);
  } catch { /* Device speech can still be available. */ }
}

/** Start loading while the user waits for speech recognition. */
export function prepareVoice() {
  void requestVoice().catch(() => undefined);
}

export const isSpeaking = () => current !== undefined;
export function stopSpeaking() {
  current?.abort();
  current = undefined;
}

function playVoice({ samples, sampleRate }: VoiceAudio, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    enableVoiceAudio();
    if (!output || output.state !== 'running' || signal.aborted) { resolve(false); return; }
    const buffer = output.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = output.createBufferSource();
    source.buffer = buffer;
    source.connect(output.destination);
    const finish = () => {
      signal.removeEventListener('abort', cancel);
      source.onended = null;
      source.disconnect();
      resolve(true);
    };
    const cancel = () => { source.stop(); finish(); };
    source.onended = finish;
    signal.addEventListener('abort', cancel, { once: true });
    source.start();
  });
}

function speakDevice(text: string, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth || !window.SpeechSynthesisUtterance || signal.aborted) { resolve(false); return; }
    const voices = synth.getVoices().filter((voice) => voice.localService && /^en(?:[-_]|$)/i.test(voice.lang));
    const voice = voices.find((candidate) => /natural|neural|premium|enhanced/i.test(candidate.name)) ?? voices[0];
    if (!voice) { resolve(false); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.95;
    const finish = (played: boolean) => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      utterance.onend = utterance.onerror = null;
      resolve(played);
    };
    const cancel = () => { finish(false); synth.cancel(); };
    const timer = window.setTimeout(cancel, 2500 + text.length * 75);
    signal.addEventListener('abort', cancel, { once: true });
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    try { synth.speak(utterance); } catch { finish(false); }
  });
}

function playAlert(url: string, signal: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    const audio = new Audio(url);
    const finish = (played: boolean) => {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', stop);
      audio.onended = audio.onerror = null;
      audio.pause();
      resolve(played);
    };
    const stop = () => finish(false);
    const timeout = window.setTimeout(stop, 12_000);
    signal.addEventListener('abort', stop, { once: true });
    audio.onended = () => finish(true);
    audio.onerror = stop;
    audio.play().catch(stop);
  });
}

/** Speak the existing reply with the bundled model, with a local system voice as fallback. */
export async function speak(text: string, signal?: AbortSignal): Promise<'sol' | 'device' | 'unavailable' | 'stopped'> {
  if (signal?.aborted) return 'stopped';
  stopSpeaking();
  enableVoiceAudio();
  const playback = new AbortController();
  current = playback;
  const abort = () => playback.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let spokenLength = 0;
  try {
    const alert = urgentClipFor(text);
    if (alert && await playAlert(alert.url, playback.signal)) text = alert.rest;
    if (playback.signal.aborted) return 'stopped';
    // Start on the first sentence. Long sentences are split at word boundaries.
    const sentences = new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text);
    const chunks = [...sentences].flatMap(({ segment }, index) => segment.match(index === 0 ? /.{1,65}(?:\s|$)|\S+/gs : /.{1,100}(?:\s|$)|\S+/gs) ?? []);
    let queued = chunks[0] === undefined ? undefined : synthesize(chunks[0].trim(), playback.signal);
    for (const [index, section] of chunks.entries()) {
      if (playback.signal.aborted) return 'stopped';
      const audio = await queued;
      if (playback.signal.aborted) return 'stopped';
      const next = chunks[index + 1];
      queued = next === undefined ? undefined : synthesize(next.trim(), playback.signal);
      void queued?.catch(() => undefined); // Playback may be interrupted before the next section.
      if (!audio || !(await playVoice(audio, playback.signal))) throw new Error('Local playback unavailable');
      spokenLength += section.length;
    }
    return playback.signal.aborted ? 'stopped' : 'sol';
  } catch {
    if (playback.signal.aborted) return 'stopped';
    const played = await speakDevice(text.slice(spokenLength), playback.signal).catch(() => false);
    return playback.signal.aborted ? 'stopped' : played ? 'device' : 'unavailable';
  } finally {
    signal?.removeEventListener('abort', abort);
    if (current === playback) current = undefined;
  }
}

function synthesize(text: string, signal: AbortSignal): Promise<VoiceAudio | undefined> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => { finish(); resolve(undefined); };
    const timeout = window.setTimeout(() => {
      finish();
      resetWorker(new Error('Sol’s voice timed out'));
      reject(new Error('Sol’s voice timed out'));
    }, 45_000);
    signal.addEventListener('abort', cancel, { once: true });
    requestVoice(text).then((audio) => { finish(); resolve(audio); }, (error: unknown) => { finish(); reject(error); });
  });
}
