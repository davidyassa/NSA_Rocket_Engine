import { describe, expect, it } from 'vitest';
import { analyzeBreathSound } from './breathSound';
import { analyzeHeartSound } from './heartSound';
import { synthBreathSound, synthHeartSound, synthVoice, seededRandom } from './synthetic';
import { analyzeVoice, PASSAGE_SYLLABLES, READING_PASSAGE } from './voiceAnalysis';

function noise(seconds: number, sampleRate = 48000, level = 0.05) {
  const random = seededRandom(9);
  return Float32Array.from({ length: seconds * sampleRate }, () => (random() - 0.5) * level);
}

describe('heart sounds (phone pressed to the chest)', () => {
  it.each([48, 60, 72, 90, 110, 140])('reads %i bpm within 1 bpm', (bpm) => {
    const result = analyzeHeartSound(synthHeartSound({ bpm, seed: bpm }), 48000);
    expect(result.ok).toBe(true);
    expect(Math.abs((result.bpm ?? 0) - bpm)).toBeLessThanOrEqual(1);
    expect(result.windowSpread).toBeLessThanOrEqual(8);
  });

  it('works at 44.1 kHz and with loud background noise', () => {
    const result = analyzeHeartSound(synthHeartSound({ bpm: 66, sampleRate: 44100, noise: 1.5 }), 44100);
    expect(result.ok).toBe(true);
    expect(Math.abs((result.bpm ?? 0) - 66)).toBeLessThanOrEqual(1);
  });

  it('survives a few friction spikes', () => {
    const result = analyzeHeartSound(synthHeartSound({ bpm: 75, spikes: 3, noise: 0.3 }), 48000);
    expect(result.ok).toBe(true);
    expect(Math.abs((result.bpm ?? 0) - 75)).toBeLessThanOrEqual(1);
  });

  it('shows no number for room noise or a short recording', () => {
    expect(analyzeHeartSound(noise(20), 48000)).toMatchObject({ ok: false, bpm: null });
    expect(analyzeHeartSound(synthHeartSound({ bpm: 70, seconds: 8 }), 48000).problem).toMatch(/too short/);
  });

  it('keeps a playback copy and peak markers for the screen', () => {
    const result = analyzeHeartSound(synthHeartSound({ bpm: 60 }), 48000);
    expect(result.playback?.sampleRate).toBeCloseTo(1000, 0);
    expect(result.trace.markers.length).toBeGreaterThan(10);
  });
});

describe('breath sounds (microphone below the nose)', () => {
  it.each([8, 12, 15, 18, 22, 28])('reads %i breaths/min within 1.5', (rate) => {
    const result = analyzeBreathSound(synthBreathSound({ breathsPerMinute: rate, seconds: 40, seed: rate * 7 }), 48000);
    expect(result.ok).toBe(true);
    expect(Math.abs((result.brpm ?? 0) - rate)).toBeLessThanOrEqual(1.5);
  });

  it('pairs breath-in and breath-out sounds into one breath, even when equally loud', () => {
    const result = analyzeBreathSound(synthBreathSound({ breathsPerMinute: 14, seconds: 40, inhaleLevel: 1 }), 48000);
    expect(result.paired).toBe(true);
    expect(Math.abs((result.brpm ?? 0) - 14)).toBeLessThanOrEqual(1.5);
  });

  it('counts breaths correctly when only the breath-out is heard', () => {
    const result = analyzeBreathSound(synthBreathSound({ breathsPerMinute: 16, seconds: 40, inhaleLevel: 0.05 }), 48000);
    expect(result.paired).toBe(false);
    expect(Math.abs((result.brpm ?? 0) - 16)).toBeLessThanOrEqual(1.5);
  });

  it('shows a number only when the two methods agree', () => {
    const result = analyzeBreathSound(synthBreathSound({ breathsPerMinute: 18, seconds: 40 }), 48000);
    expect(Math.abs((result.acfBrpm ?? 0) - (result.countBrpm ?? 99))).toBeLessThanOrEqual(2);
  });

  it('shows no number for steady room noise', () => {
    expect(analyzeBreathSound(noise(40), 48000)).toMatchObject({ ok: false, brpm: null });
  });
});

describe('voice check (reading the passage aloud)', () => {
  it('uses the 144-syllable IPA passage', () => {
    expect(READING_PASSAGE.join(' ')).toMatch(/^The North Wind and the Sun.*stronger of the two\.$/);
    expect(PASSAGE_SYLLABLES).toBe(144);
  });

  it('measures pitch variability, pace and pauses against the known truth', () => {
    const voice = synthVoice();
    const result = analyzeVoice(voice.samples, voice.sampleRate);
    expect(result.ok).toBe(true);
    const m = result.markers!;
    expect(Math.abs(m.pitchVariabilitySt - voice.truth.pitchSdSt)).toBeLessThan(0.15);
    expect(Math.abs(m.pauseRatio - (100 * voice.truth.pauseSeconds) / voice.truth.readingSeconds)).toBeLessThan(2);
    expect(Math.abs(m.articulationRate - voice.truth.syllables / voice.truth.phonationSeconds)).toBeLessThan(0.15);
    expect(Math.abs(m.syllableNuclei - PASSAGE_SYLLABLES)).toBeLessThanOrEqual(7);
    expect(m.pitchMedianHz).toBeGreaterThanOrEqual(118);
    expect(m.pitchMedianHz).toBeLessThanOrEqual(122);
  });

  it('tells a flatter, slower reading apart from the usual one', () => {
    const usual = analyzeVoice(synthVoice().samples, 48000).markers!;
    const flat = synthVoice({ swingSt: 1, syllableS: 0.2, pauseS: 1.0 });
    const low = analyzeVoice(flat.samples, flat.sampleRate).markers!;
    expect(low.pitchVariabilitySt).toBeLessThan(usual.pitchVariabilitySt - 1);
    expect(low.articulationRate).toBeLessThan(usual.articulationRate - 0.4);
    expect(low.pauseRatio).toBeGreaterThan(usual.pauseRatio + 5);
  });

  it('reports more jitter for a less steady voice', () => {
    const steady = analyzeVoice(synthVoice().samples, 48000).markers!;
    const shaky = analyzeVoice(synthVoice({ jitter: 0.02 }).samples, 48000).markers!;
    expect(shaky.jitterPct!).toBeGreaterThan(steady.jitterPct! + 0.5);
    expect(shaky.hnrDb!).toBeLessThan(steady.hnrDb!);
  });

  it('works at 44.1 kHz with a lower voice', () => {
    const voice = synthVoice({ sampleRate: 44100, f0Hz: 95, swingSt: 4 });
    const result = analyzeVoice(voice.samples, voice.sampleRate);
    expect(result.ok).toBe(true);
    expect(Math.abs(result.markers!.pitchVariabilitySt - voice.truth.pitchSdSt)).toBeLessThan(0.15);
  });

  it('refuses a partial reading, a noisy room or silence', () => {
    const partial = synthVoice({ syllables: 60 });
    expect(analyzeVoice(partial.samples, partial.sampleRate).problem).toMatch(/missing|too short/);
    const noisy = synthVoice({ noise: 0.2 });
    expect(analyzeVoice(noisy.samples, noisy.sampleRate).problem).toMatch(/background noise/);
    expect(analyzeVoice(new Float32Array(48000 * 20), 48000).ok).toBe(false);
  });
});
