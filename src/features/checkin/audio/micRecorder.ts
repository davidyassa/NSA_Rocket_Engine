/**
 * Records raw microphone audio into memory for the microphone checks.
 *
 * - Echo cancellation, noise suppression and automatic gain are switched off where the
 *   device allows, because they remove exactly the quiet heart and breath sounds we need.
 * - Audio stays in this tab's memory. Nothing is written to storage or sent anywhere.
 */

export type MicLiveMode = 'heart' | 'breath' | 'voice';

export interface MicRecording { samples: Float32Array; sampleRate: number }

export interface MicRecorderOptions {
  mode: MicLiveMode;
  /** Called about 50 times a second with a display level (0–1). */
  onLevel?: (level: number) => void;
}

const WORKLET_SOURCE = `
class SolCheckRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('solcheck-recorder', SolCheckRecorder);
`;

export class MicUnavailableError extends Error {}
export class MicPermissionError extends Error {}

export function microphoneSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof window !== 'undefined' && Boolean(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
}

export class MicRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private nodes: AudioNode[] = [];
  private chunks: Float32Array[] = [];
  private length = 0;
  private stopped = false;
  // Live display state (a cheap one-pole filter per mode).
  private lp = 0;
  private hpPrev = 0;
  private hpOut = 0;
  private acc = 0;
  private accCount = 0;
  private accTarget = 960;

  constructor(private readonly options: MicRecorderOptions) {}

  get seconds(): number {
    return this.context ? this.length / this.context.sampleRate : 0;
  }

  async start(): Promise<void> {
    if (!microphoneSupported()) throw new MicUnavailableError('This browser cannot use the microphone here.');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
        video: false,
      });
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicPermissionError('Microphone permission was denied.');
      throw new MicUnavailableError('No microphone could be opened.');
    }
    const Context = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new Context();
    if (this.context.state === 'suspended') await this.context.resume();
    this.accTarget = Math.round(this.context.sampleRate / 50);
    const source = this.context.createMediaStreamSource(this.stream);
    this.nodes.push(source);

    const onSamples = (data: Float32Array) => {
      if (this.stopped) return;
      this.chunks.push(data);
      this.length += data.length;
      this.updateLevel(data);
    };

    let connected = false;
    if (this.context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
      try {
        await this.context.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(this.context, 'solcheck-recorder');
        node.port.onmessage = (event: MessageEvent<Float32Array>) => onSamples(event.data);
        source.connect(node);
        // Keep the graph pulling audio without playing it back.
        const mute = this.context.createGain();
        mute.gain.value = 0;
        node.connect(mute).connect(this.context.destination);
        this.nodes.push(node, mute);
        connected = true;
      } catch {
        connected = false;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (!connected) {
      const processor = this.context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => onSamples(Float32Array.from(event.inputBuffer.getChannelData(0)));
      const mute = this.context.createGain();
      mute.gain.value = 0;
      source.connect(processor);
      processor.connect(mute).connect(this.context.destination);
      this.nodes.push(processor, mute);
    }
  }

  private updateLevel(data: Float32Array) {
    if (!this.options.onLevel || !this.context) return;
    const rate = this.context.sampleRate;
    const lpAlpha = 1 - Math.exp((-2 * Math.PI * 150) / rate); // heart: keep < 150 Hz
    const hpAlpha = Math.exp((-2 * Math.PI * 150) / rate); // breath: drop < 150 Hz
    for (let i = 0; i < data.length; i += 1) {
      const v = data[i];
      let sample = v;
      if (this.options.mode === 'heart') {
        this.lp += lpAlpha * (v - this.lp);
        sample = this.lp;
      } else if (this.options.mode === 'breath') {
        this.hpOut = hpAlpha * (this.hpOut + v - this.hpPrev);
        this.hpPrev = v;
        sample = this.hpOut;
      }
      this.acc += sample * sample;
      this.accCount += 1;
      if (this.accCount >= this.accTarget) {
        const rms = Math.sqrt(this.acc / this.accCount);
        // Map −70…−10 dBFS to 0…1 for drawing.
        const db = 20 * Math.log10(rms + 1e-9);
        this.options.onLevel(Math.min(1, Math.max(0, (db + 70) / 60)));
        this.acc = 0;
        this.accCount = 0;
      }
    }
  }

  /** Stops the microphone and returns the recording (empty if nothing was captured). */
  async stop(): Promise<MicRecording> {
    this.stopped = true;
    const sampleRate = this.context?.sampleRate ?? 48000;
    for (const node of this.nodes) {
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    this.nodes = [];
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.context && this.context.state !== 'closed') await this.context.close().catch(() => undefined);
    this.context = null;
    const samples = new Float32Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) { samples.set(chunk, offset); offset += chunk.length; }
    this.chunks = [];
    this.length = 0;
    return { samples, sampleRate };
  }
}

/** Plays a recording through the speaker (used for "Listen back"). Returns a stop function. */
export function playRecording(samples: Float32Array, sampleRate: number, onEnded?: () => void): () => void {
  const Context = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new Context();
  // Some browsers (Safari) only accept buffers at 22.05 kHz or more: upsample linearly.
  const outRate = sampleRate < 22050 ? 22050 : Math.round(sampleRate);
  const factor = outRate / sampleRate;
  const out = factor === 1 ? Float32Array.from(samples) : new Float32Array(Math.floor(samples.length * factor));
  if (factor !== 1) {
    for (let i = 0; i < out.length; i += 1) {
      const position = i / factor;
      const lo = Math.floor(position);
      const hi = Math.min(samples.length - 1, lo + 1);
      out[i] = samples[lo] + (samples[hi] - samples[lo]) * (position - lo);
    }
  }
  const buffer = context.createBuffer(1, out.length, outRate);
  buffer.copyToChannel(out, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => { void context.close().catch(() => undefined); onEnded?.(); };
  source.start();
  return () => { try { source.stop(); } catch { /* already stopped */ } };
}
