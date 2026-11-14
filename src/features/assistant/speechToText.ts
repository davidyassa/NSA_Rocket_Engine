/**
 * Speech to text for Sol. Uses the Sol voice server (faster-whisper) when it is
 * running, and the on-device Moonshine / Whisper worker otherwise.
 */
import { serverTranscribe, voiceServerAvailable } from './voiceServer';

export type LoadProgress = { loaded: number; total: number };

export class SpeechToText {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();
  private speculativePending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();
  private files = new Map<string, LoadProgress>();
  private activeEngine: 'moonshine' | 'whisper' = 'moonshine';

  get engine() {
    return this.activeEngine;
  }

  /**
   * Get ready to listen. With the voice server up there is nothing to wait for; the
   * on-device model still loads quietly in the background, so it can take over at once
   * if the server stops. Without the server, waits for the on-device model.
   */
  async prepare(onProgress?: (fraction: number) => void): Promise<void> {
    if (await voiceServerAvailable()) {
      onProgress?.(1);
      window.setTimeout(() => { void this.load().catch(() => undefined); }, 3000);
      return;
    }
    await this.load(onProgress);
  }

  /** Server first (fast, accurate); on-device if it is down or fails mid-phrase. */
  private async viaServer(audio16k: Float32Array): Promise<string | null> {
    if (!(await voiceServerAvailable())) return null;
    try { return await serverTranscribe(audio16k); } catch { return null; }
  }

  load(onProgress?: (fraction: number) => void): Promise<void> {
    if (this.ready) return this.ready;
    this.worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
    let startupTimeout: number;
    this.ready = new Promise<void>((resolve, reject) => {
      startupTimeout = window.setTimeout(() => reject(new Error('Speech model did not finish loading')), 60_000);
      this.worker!.onmessage = (event: MessageEvent) => {
        const msg = event.data as {
          type: string;
          id?: number;
          text?: string;
          message?: string;
          file?: string;
          loaded?: number;
          total?: number;
          engine?: 'moonshine' | 'whisper';
        };
        if (msg.engine) {
          this.activeEngine = msg.engine;
        }
        if (msg.type === 'progress' && msg.file) {
          this.files.set(msg.file, { loaded: msg.loaded ?? 0, total: msg.total ?? 0 });
          const all = [...this.files.values()];
          const total = all.reduce((s, f) => s + f.total, 0);
          if (total) onProgress?.(all.reduce((s, f) => s + f.loaded, 0) / total);
        } else if (msg.type === 'ready') {
          resolve();
        } else if (msg.type === 'text' && msg.id !== undefined) {
          this.pending.get(msg.id)?.resolve(msg.text ?? '');
          this.pending.delete(msg.id);
        } else if (msg.type === 'speculative_text' && msg.id !== undefined) {
          this.speculativePending.get(msg.id)?.resolve(msg.text ?? '');
          this.speculativePending.delete(msg.id);
        } else if (msg.type === 'error') {
          const error = new Error(msg.message ?? 'Speech model error');
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            this.pending.get(msg.id)!.reject(error);
            this.pending.delete(msg.id);
          } else if (msg.id !== undefined && this.speculativePending.has(msg.id)) {
            this.speculativePending.get(msg.id)!.reject(error);
            this.speculativePending.delete(msg.id);
          } else {
            reject(error);
          }
        }
      };
      this.worker!.onerror = (event) => {
        const error = new Error(event.message || 'Speech worker stopped');
        reject(error);
        this.dispose(error);
      };
    }).catch((error: Error) => {
      this.dispose(error);
      throw error;
    }).finally(() => window.clearTimeout(startupTimeout));
    this.worker.postMessage({ type: 'load', vendorUrl: new URL('vendor/', document.baseURI).href });
    return this.ready;
  }

  async transcribe(audio16k: Float32Array): Promise<string> {
    const heard = await this.viaServer(audio16k);
    if (heard !== null) return heard;
    await this.load();
    const id = this.nextId++;
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ type: 'transcribe', id, audio: audio16k }, [audio16k.buffer]);
    });
  }

  /**
   * Aegis-Zero Speculative Token Streaming:
   * Fast parallel transcription of an intermediate audio slice without blocking the primary segmenter.
   */
  async transcribeSpeculative(audio16k: Float32Array): Promise<string> {
    const heard = await this.viaServer(audio16k);
    if (heard !== null) return heard;
    if (!this.ready) return '';
    await this.ready;
    const id = this.nextId++;
    return new Promise<string>((resolve, reject) => {
      this.speculativePending.set(id, { resolve, reject });
      this.worker!.postMessage({ type: 'transcribe', id, audio: audio16k, speculative: true }, [audio16k.buffer]);
    });
  }

  dispose(error = new Error('Speech worker closed')) {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
    this.speculativePending.forEach(({ reject }) => reject(error));
    this.speculativePending.clear();
    this.files.clear();
  }
}

/** One shared instance so the model loads once per session. */
export const speechToText = new SpeechToText();
