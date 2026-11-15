import { urgentClipFor } from './urgentSpeech';
import { serverSpeak, voiceServerAvailable } from './voiceServer';
import { SOL_SPEED } from './piperPhonemes';

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
/** Emergency instructions are not cut off by noise (alarms, fans); a tap still stops them. */
let currentInterruptible = true;

/** Sol's speaking rate with the bundled voice is set in the worker; this is the system-voice rate. */
const DEVICE_RATE = 1.15;
/** In an emergency, if the bundled voice has not produced sound by now, use the system voice instead. */
const URGENT_FIRST_AUDIO_MS = 1200;

// Browsers load the system voice list lazily: ask early so it is ready for the first reply.
try {
  window.speechSynthesis?.getVoices();
  window.speechSynthesis?.addEventListener?.('voiceschanged', () => undefined);
} catch { /* no system voices */ }

function resetWorker(error: Error) {
  worker?.terminate();
  worker = undefined;
  pending.forEach(({ reject }) => reject(error));
  pending.clear();
}

function requestVoice(text?: string): Promise<VoiceAudio | undefined> {
  if (typeof DecompressionStream === 'undefined') {
    return Promise.reject(new Error('This device cannot load the bundled voice dictionary'));
  }
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

/** Start loading while the user waits for speech recognition (not needed when the voice server speaks). */
export function prepareVoice() {
  void voiceServerAvailable().then((up) => { if (!up) void requestVoice().catch(() => undefined); });
}

export const isSpeaking = () => current !== undefined;

/** A short two-note chime: Sol heard "Hey Sol" and is listening now. Instant, no model needed. */
export function playEarcon() {
  enableVoiceAudio();
  const ctx = output;
  if (!ctx || ctx.state !== 'running') return;
  const start = ctx.currentTime + 0.01;
  for (const [freq, at] of [[660, 0], [990, 0.09]] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start + at);
    gain.gain.linearRampToValueAtTime(0.16, start + at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.11);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + at);
    osc.stop(start + at + 0.12);
  }
}

type BargeInListener = () => void;
const bargeInListeners = new Set<BargeInListener>();

export function onBargeIn(fn: BargeInListener): () => void {
  bargeInListeners.add(fn);
  return () => { bargeInListeners.delete(fn); };
}

/**
 * Instant full-duplex conversational barge-in:
 * Immediately cuts Kokoro playback buffer and notifies listeners.
 */
export function triggerBargeIn(): boolean {
  if (current && currentInterruptible) {
    stopSpeaking();
    bargeInListeners.forEach((fn) => fn());
    return true;
  }
  return false;
}

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

function deviceVoice(): SpeechSynthesisVoice | undefined {
  try {
    const voices = window.speechSynthesis?.getVoices().filter((voice) => voice.localService && /^en(?:[-_]|$)/i.test(voice.lang)) ?? [];
    return voices.find((candidate) => /natural|neural|premium|enhanced/i.test(candidate.name)) ?? voices[0];
  } catch { return undefined; }
}

function speakDevice(text: string, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth || !window.SpeechSynthesisUtterance || signal.aborted || !text.trim()) { resolve(!text.trim()); return; }
    const voice = deviceVoice();
    if (!voice) { resolve(false); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = DEVICE_RATE;
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

/**
 * Split a reply into pieces the voice model can start on quickly: whole sentences
 * (so Sol never pauses mid-sentence), very long ones at a clause boundary, and a
 * short opening clause first so the first sound comes out sooner.
 */
export function speechChunks(text: string): string[] {
  const sentences = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)]
    .map(({ segment }) => segment.trim())
    .filter(Boolean);
  const chunks = sentences.flatMap((sentence) => sentence.length <= 180
    ? [sentence]
    : (sentence.match(/.{1,180}(?:[,;:]\s|\s|$)/gs) ?? [sentence]).map((part) => part.trim()).filter(Boolean));
  const first = chunks[0];
  if (first && first.length > 70) {
    const clause = first.match(/^(.{12,70}?[,;:])\s+(.+)$/s);
    if (clause) chunks.splice(0, 1, clause[1], clause[2]);
  }
  return chunks;
}

const delay = (ms: number) => new Promise<'late'>((resolve) => window.setTimeout(() => resolve('late'), ms));

/**
 * Speak the reply with the bundled model, with a local system voice as fallback.
 * `urgent` (emergency steps): cannot be cut off by background noise, and switches to
 * the instant system voice if the bundled model is slow to start.
 */
export async function speak(text: string, signal?: AbortSignal, options: { urgent?: boolean } = {}): Promise<'sol' | 'device' | 'unavailable' | 'stopped'> {
  if (signal?.aborted) return 'stopped';
  stopSpeaking();
  enableVoiceAudio();
  const playback = new AbortController();
  current = playback;
  const alert = urgentClipFor(text);
  const urgent = options.urgent ?? Boolean(alert);
  currentInterruptible = !urgent;
  const abort = () => playback.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let spokenLength = 0;
  try {
    const rest = alert ? alert.rest : text;
    const chunks = speechChunks(rest);
    // Synthesize one piece ahead of playback, so there is no dead air between sentences.
    const jobs = new Map<number, Promise<VoiceAudio | undefined>>();
    const job = (i: number) => {
      if (!jobs.has(i) && chunks[i] !== undefined) {
        const request = synthesize(chunks[i], playback.signal);
        request.catch(() => undefined); // Playback may be interrupted before this piece.
        jobs.set(i, request);
      }
      return jobs.get(i);
    };
    // Start straight away, so the model works while the alert clip plays.
    job(0);
    if (alert) {
      if (await playAlert(alert.url, playback.signal)) text = rest;
      else if (!playback.signal.aborted) {
        // The clip could not play: say the opening with the voice model instead.
        const ahead = jobs.get(0);
        chunks.unshift(text.slice(0, text.length - rest.length).trim());
        jobs.clear();
        if (ahead) jobs.set(1, ahead);
      }
    }
    if (playback.signal.aborted) return 'stopped';
    for (const [index, section] of chunks.entries()) {
      if (playback.signal.aborted) return 'stopped';
      const pending = job(index);
      const audio = index === 0 && urgent && deviceVoice()
        ? await Promise.race([pending, delay(URGENT_FIRST_AUDIO_MS)])
        : await pending;
      if (audio === 'late') throw new Error('Sol’s voice is slow to start');
      if (playback.signal.aborted) return 'stopped';
      job(index + 1);
      if (!audio || !(await playVoice(audio, playback.signal))) throw new Error('Local playback unavailable');
      const at = text.indexOf(section, spokenLength);
      spokenLength = at >= 0 ? at + section.length : spokenLength + section.length;
    }
    return playback.signal.aborted ? 'stopped' : 'sol';
  } catch {
    if (playback.signal.aborted) return 'stopped';
    const played = await speakDevice(text.slice(Math.max(0, spokenLength)), playback.signal).catch(() => false);
    return playback.signal.aborted ? 'stopped' : played ? 'device' : 'unavailable';
  } finally {
    signal?.removeEventListener('abort', abort);
    if (current === playback) { current = undefined; currentInterruptible = true; }
  }
}

/** Sol's voice for one piece of text: the voice server when it is up, else the on-device model. */
async function synthesize(text: string, signal: AbortSignal): Promise<VoiceAudio | undefined> {
  if (await voiceServerAvailable()) {
    try { return await serverSpeak(text, SOL_SPEED, signal); } catch { /* fall back to the device */ }
    if (signal.aborted) return undefined;
  }
  return synthesizeOnDevice(text, signal);
}

function synthesizeOnDevice(text: string, signal: AbortSignal): Promise<VoiceAudio | undefined> {
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
