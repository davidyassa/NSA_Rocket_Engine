import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function load(fetchImpl: Fetch, native = false) {
  vi.resetModules();
  vi.doMock('../../app/native', () => ({ isNativeApp: native }));
  vi.stubGlobal('document', { baseURI: 'https://sol.test/' });
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', { getItem: () => native ? 'https://voice.sol.test/' : null });
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => { calls.push(`${init?.method ?? 'GET'} ${url}`); return fetchImpl(url, init); });
  return { mod: await import('./voiceServer'), calls };
}

describe('Sol voice server client', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.unstubAllGlobals());

  it('uses the server through the app’s own address when it is up', async () => {
    const { mod, calls } = await load(async (url) => url.endsWith('health')
      ? new Response(JSON.stringify({ ok: true }))
      : new Response(JSON.stringify({ text: ' Hey Sol, fire! ' })));
    expect(await mod.voiceServerAvailable()).toBe(true);
    expect(await mod.serverTranscribe(new Float32Array(1600))).toBe('Hey Sol, fire!');
    expect(calls).toEqual(['GET https://sol.test/sol-voice/health', 'POST https://sol.test/sol-voice/stt']);
  });

  it('keeps packaged apps offline even with a saved server address', async () => {
    const { mod, calls } = await load(async () => new Response(JSON.stringify({ ok: true })), true);

    expect(await mod.voiceServerAvailable()).toBe(false);
    await expect(mod.serverTranscribe(new Float32Array(10))).rejects.toThrow('bundled voice models');
    await expect(mod.serverSpeak('Step 1.', 1.12, new AbortController().signal)).rejects.toThrow('bundled voice models');
    expect(calls).toEqual([]);
  });

  it('reports the server down when it is not running, without retrying on every phrase', async () => {
    const { mod, calls } = await load(async () => { throw new TypeError('connection refused'); });
    expect(await mod.voiceServerAvailable()).toBe(false);
    expect(await mod.voiceServerAvailable()).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('marks the server down when a request fails, so callers fall back to the device', async () => {
    const { mod } = await load(async (url) => url.endsWith('health')
      ? new Response(JSON.stringify({ ok: true }))
      : new Response('boom', { status: 500 }));
    expect(await mod.voiceServerAvailable()).toBe(true);
    await expect(mod.serverTranscribe(new Float32Array(10))).rejects.toThrow();
    expect(mod.voiceServerUp()).toBe(false);
  });

  it('turns the server’s 16-bit audio into samples with its sample rate', async () => {
    const pcm = new Int16Array([0, 16384, -32768]);
    const { mod } = await load(async () => new Response(pcm.buffer, { headers: { 'X-Sample-Rate': '24000' } }));
    const audio = await mod.serverSpeak('Step 1.', 1.12, new AbortController().signal);
    expect(audio?.sampleRate).toBe(24000);
    expect(Array.from(audio!.samples)).toEqual([0, 0.5, -1]);
  });
});
