/**
 * Optional Sol voice server (voice-server/server.py): faster-whisper for listening and
 * Piper for speaking, on a laptop next to the web app. When it is not running,
 * the web app falls back to the on-device models. The packaged apps always use
 * their own models.
 *
 * Address: the dev/preview server proxies it at ./sol-voice/ (same origin, works over
 * HTTPS on phones). Override with VITE_SOL_VOICE_URL at build time, or the
 * `sol-check:voice-server` local-storage key.
 */
import { isNativeApp } from '../../app/native';

const KEY = 'sol-check:voice-server';

function baseUrl(): string {
  if (isNativeApp) throw new Error('The packaged app uses bundled voice models');
  let saved: string | null = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  const configured = saved || (import.meta.env.VITE_SOL_VOICE_URL as string | undefined);
  const base = configured || new URL('sol-voice/', document.baseURI).href;
  return base.endsWith('/') ? base : `${base}/`;
}

/** Re-check a server that was down after this long; a healthy one is trusted this long. */
const RETRY_DOWN_MS = 15_000;
const TRUST_UP_MS = 60_000;
const HEALTH_TIMEOUT_MS = 900;

let state: { up: boolean; at: number } | null = null;
let probing: Promise<boolean> | null = null;
const subscribers = new Set<() => void>();

function setUp(up: boolean) {
  const changed = state?.up !== up;
  state = { up, at: Date.now() };
  if (changed) subscribers.forEach((fn) => fn());
}

export const voiceServerUp = () => state?.up === true;
export function onVoiceServerChange(fn: () => void) {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  const relay = () => controller.abort();
  signal?.addEventListener('abort', relay, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
  }
}

/** True when the voice server answers. Cached, so it is cheap to call before every phrase. */
export function voiceServerAvailable(): Promise<boolean> {
  if (isNativeApp || typeof fetch === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);
  if (state && Date.now() - state.at < (state.up ? TRUST_UP_MS : RETRY_DOWN_MS)) return Promise.resolve(state.up);
  probing ??= fetchWithTimeout(`${baseUrl()}health`, {}, HEALTH_TIMEOUT_MS)
    .then(async (response) => response.ok && (await response.json() as { ok?: boolean }).ok === true)
    .catch(() => false)
    .then((up) => { setUp(up); return up; })
    .finally(() => { probing = null; });
  return probing;
}

/** Transcribe 16 kHz mono audio on the server. Throws (and marks the server down) on any failure. */
export async function serverTranscribe(audio16k: Float32Array, timeoutMs = 5000): Promise<string> {
  const pcm = new Int16Array(audio16k.length);
  for (let i = 0; i < audio16k.length; i += 1) pcm[i] = Math.max(-1, Math.min(1, audio16k[i])) * 32767;
  try {
    const response = await fetchWithTimeout(`${baseUrl()}stt`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: pcm.buffer,
    }, timeoutMs);
    if (!response.ok) throw new Error(`voice server ${response.status}`);
    const { text } = await response.json() as { text?: string };
    setUp(true);
    return (text ?? '').trim();
  } catch (error) {
    setUp(false);
    throw error;
  }
}

/** Synthesize Sol's voice on the server. Throws (and marks the server down) on failure; resolves undefined if aborted. */
export async function serverSpeak(text: string, speed: number, signal: AbortSignal, timeoutMs = 8000): Promise<{ samples: Float32Array<ArrayBuffer>; sampleRate: number } | undefined> {
  try {
    const response = await fetchWithTimeout(`${baseUrl()}tts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, speed }),
    }, timeoutMs, signal);
    if (!response.ok) throw new Error(`voice server ${response.status}`);
    const sampleRate = Number(response.headers.get('X-Sample-Rate')) || 24_000;
    const pcm = new Int16Array(await response.arrayBuffer());
    const samples = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i += 1) samples[i] = pcm[i] / 32768;
    setUp(true);
    return { samples, sampleRate };
  } catch (error) {
    if (signal.aborted) return undefined;
    setUp(false);
    throw error;
  }
}
