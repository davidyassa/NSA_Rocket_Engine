/** Main-thread handle for the on-device Whisper worker. */
export type LoadProgress = { loaded: number; total: number };

export class SpeechToText {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();
  private files = new Map<string, LoadProgress>();

  load(onProgress?: (fraction: number) => void): Promise<void> {
    if (this.ready) return this.ready;
    this.worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
    this.ready = new Promise<void>((resolve, reject) => {
      this.worker!.onmessage = (event: MessageEvent) => {
        const msg = event.data as { type: string; id?: number; text?: string; message?: string; file?: string; loaded?: number; total?: number };
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
        } else if (msg.type === 'error') {
          const error = new Error(msg.message ?? 'Speech model error');
          if (msg.id !== undefined && this.pending.has(msg.id)) { this.pending.get(msg.id)!.reject(error); this.pending.delete(msg.id); } else reject(error);
        }
      };
      this.worker!.onerror = (event) => reject(new Error(event.message || 'Speech worker failed to start'));
    });
    this.worker.postMessage({ type: 'load' });
    return this.ready;
  }

  async transcribe(audio16k: Float32Array): Promise<string> {
    await this.load();
    const id = this.nextId++;
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ type: 'transcribe', id, audio: audio16k }, [audio16k.buffer]);
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null; this.ready = null; this.pending.clear(); this.files.clear();
  }
}

/** One shared instance so the model loads once per session. */
export const speechToText = new SpeechToText();
