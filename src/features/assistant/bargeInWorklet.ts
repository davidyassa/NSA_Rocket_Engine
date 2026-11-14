/**
 * AudioWorklet that notices the person talking over Sol (voice band 85 Hz – 3.4 kHz),
 * so Sol stops and listens. Runs on the audio thread.
 */

/**
 * Barge-in must be sure it is a person talking over Sol, not Sol's own voice leaking
 * back from the speaker, a cough, a click or a fan:
 *  - the noise floor follows the room (and Sol's echo) up slowly and down quickly;
 *  - the voice must be clearly louder than that floor, for about a quarter of a
 *    second of speech (short gaps between syllables are allowed);
 *  - after it fires, it rests for a second.
 */
export const BARGE_IN = { minLevel: 0.03, floorRatio: 4, sustainMs: 240, cooldownMs: 1000 } as const;

const WORKLET_CODE = `
const BARGE_IN = ${JSON.stringify(BARGE_IN)};
class VocalBargeInProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.noiseFloor = 0.005;
    this.voicedMs = 0;
    this.cooldownMs = 0;
    this.enabled = true;
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.enabled === 'boolean') {
        this.enabled = e.data.enabled;
        if (!this.enabled) this.voicedMs = 0;
      }
    };
  }

  process(inputs) {
    if (!this.enabled) return true;
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    const blockMs = (channel.length / sampleRate) * 1000;

    let sum = 0;
    for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i];
    const rms = Math.sqrt(sum / Math.max(1, channel.length));

    this.noiseFloor = rms < this.noiseFloor
      ? this.noiseFloor * 0.9 + rms * 0.1
      : this.noiseFloor * 0.999 + rms * 0.001;
    if (this.cooldownMs > 0) { this.cooldownMs -= blockMs; return true; }

    const voiced = rms > Math.max(BARGE_IN.minLevel, this.noiseFloor * BARGE_IN.floorRatio);
    this.voicedMs = voiced ? this.voicedMs + blockMs : Math.max(0, this.voicedMs - blockMs * 0.5);
    if (this.voicedMs >= BARGE_IN.sustainMs) {
      this.port.postMessage({ type: 'vocal_start', rms, timestamp: currentTime });
      this.voicedMs = 0;
      this.cooldownMs = BARGE_IN.cooldownMs;
    }
    return true;
  }
}

registerProcessor('vocal-barge-in-processor', VocalBargeInProcessor);
`;

let workletModuleUrl: string | null = null;

function getWorkletUrl(): string {
  if (!workletModuleUrl) {
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    workletModuleUrl = URL.createObjectURL(blob);
  }
  return workletModuleUrl;
}

export interface VocalDetectorNode {
  node: AudioNode;
  setEnabled: (enabled: boolean) => void;
  disconnect: () => void;
}

export async function createVocalDetector(
  context: AudioContext,
  source: AudioNode,
  onVocalStart: (rms: number) => void,
): Promise<VocalDetectorNode> {
  // Pre-filter with high-pass at 85 Hz to eliminate mechanical vibrations, desk bumps, AC hum
  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 85;

  // Low-pass at 3400 Hz for human vocal formants
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 3400;

  source.connect(highpass);
  highpass.connect(lowpass);

  if ('audioWorklet' in context && typeof AudioWorkletNode !== 'undefined') {
    try {
      await context.audioWorklet.addModule(getWorkletUrl());
      const workletNode = new AudioWorkletNode(context, 'vocal-barge-in-processor');
      lowpass.connect(workletNode);
      workletNode.port.onmessage = (event) => {
        if (event.data?.type === 'vocal_start') {
          onVocalStart(event.data.rms);
        }
      };

      return {
        node: workletNode,
        setEnabled: (enabled: boolean) => {
          workletNode.port.postMessage({ enabled });
        },
        disconnect: () => {
          try {
            workletNode.disconnect();
            lowpass.disconnect();
            highpass.disconnect();
          } catch { /* already disconnected */ }
        },
      };
    } catch (workletError) {
      console.warn('[BargeIn] AudioWorklet init failed, falling back to ScriptProcessor:', workletError);
    }
  }

  // Fallback to ScriptProcessor if AudioWorklet is not permitted
  const processor = context.createScriptProcessor(512, 1, 1);
  lowpass.connect(processor);
  const muted = context.createGain();
  muted.gain.value = 0;
  processor.connect(muted);
  muted.connect(context.destination);

  let noiseFloor = 0.005;
  let voicedMs = 0;
  let cooldownMs = 0;
  let active = true;

  processor.onaudioprocess = (e) => {
    if (!active) return;
    const channel = e.inputBuffer.getChannelData(0);
    const blockMs = (channel.length / context.sampleRate) * 1000;
    let sum = 0;
    for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i];
    const rms = Math.sqrt(sum / Math.max(1, channel.length));
    noiseFloor = rms < noiseFloor ? noiseFloor * 0.9 + rms * 0.1 : noiseFloor * 0.996 + rms * 0.004;
    if (cooldownMs > 0) { cooldownMs -= blockMs; return; }
    const voiced = rms > Math.max(BARGE_IN.minLevel, noiseFloor * BARGE_IN.floorRatio);
    voicedMs = voiced ? voicedMs + blockMs : Math.max(0, voicedMs - blockMs * 0.5);
    if (voicedMs >= BARGE_IN.sustainMs) {
      onVocalStart(rms);
      voicedMs = 0;
      cooldownMs = BARGE_IN.cooldownMs;
    }
  };

  return {
    node: processor,
    setEnabled: (enabled: boolean) => {
      active = enabled;
      if (!enabled) voicedMs = 0;
    },
    disconnect: () => {
      try {
        processor.disconnect();
        lowpass.disconnect();
        highpass.disconnect();
      } catch { /* already disconnected */ }
    },
  };
}
