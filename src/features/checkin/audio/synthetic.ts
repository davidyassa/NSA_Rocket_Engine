/**
 * Synthetic test signals with a known answer, used by the unit tests and the bench script.
 * A seeded random generator keeps every run identical.
 */

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function addBurst(out: Float32Array, sampleRate: number, startS: number, durationS: number, freqHz: number, amplitude: number) {
  const start = Math.round(startS * sampleRate);
  const length = Math.round(durationS * sampleRate);
  for (let i = 0; i < length && start + i < out.length; i += 1) {
    if (start + i < 0) continue;
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / length);
    out[start + i] += amplitude * window * Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  }
}

export interface HeartSoundOptions {
  bpm: number;
  seconds?: number;
  sampleRate?: number;
  noise?: number;
  /** Beat-to-beat timing variation, as a fraction of the cycle (SD). */
  variability?: number;
  /** Add short loud friction spikes. */
  spikes?: number;
  seed?: number;
}

/** S1 (50 Hz, 30 ms) and S2 (70 Hz, 25 ms) bursts at a known heart rate, plus white noise. */
export function synthHeartSound({ bpm, seconds = 20, sampleRate = 48000, noise = 0.08, variability = 0.02, spikes = 0, seed = 1 }: HeartSoundOptions): Float32Array {
  const random = seededRandom(seed);
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const cycle = 60 / bpm;
  const systole = Math.min(0.35, 0.21 + 0.1 * cycle); // S1→S2 interval shortens as heart rate rises
  for (let t = 0.2; t < seconds; t += cycle * (1 + variability * gaussian(random))) {
    addBurst(out, sampleRate, t, 0.03, 50, 0.5);
    addBurst(out, sampleRate, t + systole, 0.025, 70, 0.32);
  }
  for (let s = 0; s < spikes; s += 1) addBurst(out, sampleRate, random() * (seconds - 0.2), 0.05, 180, 0.98);
  for (let i = 0; i < out.length; i += 1) out[i] += noise * 0.1 * gaussian(random);
  return out;
}

export interface BreathOptions {
  breathsPerMinute: number;
  seconds?: number;
  sampleRate?: number;
  /** Loudness of the breath-in relative to the breath-out (1 = equally loud). */
  inhaleLevel?: number;
  noise?: number;
  variability?: number;
  seed?: number;
}

/**
 * Breath sounds: band-limited noise bursts for the breath in (1/3 of the cycle) and the
 * breath out (louder, about 1/2 of the cycle), separated by a short pause, plus room noise.
 */
export function synthBreathSound({ breathsPerMinute, seconds = 30, sampleRate = 48000, inhaleLevel = 0.45, noise = 0.01, variability = 0.05, seed = 2 }: BreathOptions): Float32Array {
  const random = seededRandom(seed);
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const cycle = 60 / breathsPerMinute;
  let t = 0.3;
  while (t < seconds) {
    const length = cycle * (1 + variability * gaussian(random));
    const inhale = length * 0.33;
    const exhale = length * 0.45;
    shapedNoise(out, sampleRate, t, inhale, 0.25 * inhaleLevel, random);
    shapedNoise(out, sampleRate, t + inhale + 0.05 * length, exhale, 0.25, random);
    t += length;
  }
  for (let i = 0; i < out.length; i += 1) out[i] += noise * gaussian(random);
  return out;
}

function shapedNoise(out: Float32Array, sampleRate: number, startS: number, durationS: number, amplitude: number, random: () => number) {
  const start = Math.round(startS * sampleRate);
  const length = Math.round(durationS * sampleRate);
  let previous = 0;
  for (let i = 0; i < length && start + i < out.length; i += 1) {
    const window = Math.sin((Math.PI * i) / length) ** 2;
    // One-pole low-pass keeps the hiss mostly below ~2 kHz, like airflow noise.
    previous = 0.75 * previous + 0.25 * gaussian(random);
    out[start + i] += amplitude * window * previous * 2;
  }
}

export interface VoiceOptions {
  syllables?: number;
  /** Seconds per syllable (voiced part) and gap between syllables. */
  syllableS?: number;
  gapS?: number;
  /** Insert a pause after every `wordsPerPhrase × 2` syllables. */
  pauseEvery?: number;
  pauseS?: number;
  /** Median pitch (Hz) and the swing of the intonation contour (semitones, sine amplitude). */
  f0Hz?: number;
  swingSt?: number;
  sampleRate?: number;
  noise?: number;
  jitter?: number;
  seed?: number;
}

export interface SyntheticVoice {
  samples: Float32Array;
  sampleRate: number;
  /** Ground truth for the tests. */
  truth: { pauseSeconds: number; readingSeconds: number; phonationSeconds: number; pitchSdSt: number; syllables: number };
}

/**
 * Vowel-like voiced syllables (10 harmonics, smooth intonation) separated by short gaps,
 * with longer pauses between phrases. Every number the voice check reports is known.
 */
export function synthVoice({
  syllables = 144, syllableS = 0.17, gapS = 0.05, pauseEvery = 12, pauseS = 0.6, f0Hz = 120, swingSt = 3,
  sampleRate = 48000, noise = 0.002, jitter = 0, seed = 3,
}: VoiceOptions = {}): SyntheticVoice {
  const random = seededRandom(seed);
  const lead = 0.8;
  const pauses = Math.floor((syllables - 1) / pauseEvery);
  const readingSeconds = syllables * syllableS + (syllables - 1 - pauses) * gapS + pauses * pauseS;
  const total = lead * 2 + readingSeconds;
  const out = new Float32Array(Math.round(total * sampleRate));
  let t = lead;
  let phase = 0;
  const pitchValues: number[] = [];
  for (let s = 0; s < syllables; s += 1) {
    const start = Math.round(t * sampleRate);
    const length = Math.round(syllableS * sampleRate);
    let periodJitter = 0;
    let cycleProgress = 0;
    for (let i = 0; i < length; i += 1) {
      const time = (start + i) / sampleRate;
      const st = swingSt * Math.sin((2 * Math.PI * time) / 2.3);
      const f0 = f0Hz * 2 ** (st / 12) * (1 + periodJitter);
      if (i % 200 === 0) pitchValues.push(st);
      const step = (2 * Math.PI * f0) / sampleRate;
      phase += step;
      cycleProgress += step;
      if (cycleProgress >= 2 * Math.PI) {
        cycleProgress -= 2 * Math.PI;
        periodJitter = jitter * gaussian(random);
      }
      const envelope = Math.sin((Math.PI * i) / length) ** 0.6;
      let voice = 0;
      for (let h = 1; h <= 10; h += 1) voice += Math.sin(h * phase) / h;
      out[start + i] += 0.25 * envelope * voice;
    }
    t += syllableS;
    t += (s + 1) % pauseEvery === 0 && s < syllables - 1 ? pauseS : gapS;
  }
  for (let i = 0; i < out.length; i += 1) out[i] += noise * gaussian(random);
  const m = pitchValues.reduce((a, b) => a + b, 0) / pitchValues.length;
  const pitchSdSt = Math.sqrt(pitchValues.reduce((a, b) => a + (b - m) ** 2, 0) / (pitchValues.length - 1));
  return {
    samples: out,
    sampleRate,
    truth: {
      pauseSeconds: pauses * pauseS,
      readingSeconds,
      phonationSeconds: readingSeconds - pauses * pauseS,
      pitchSdSt,
      syllables,
    },
  };
}
