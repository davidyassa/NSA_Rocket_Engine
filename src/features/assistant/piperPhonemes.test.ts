import { describe, expect, it } from 'vitest';
import { piperIds, piperPhonemes, speakableText } from './piperPhonemes';

const idMap: Record<string, number[]> = { '^': [1], $: [2], _: [0], ' ': [3], ',': [8], '.': [10], '!': [4], a: [14], b: [15], ˈ: [120] };

describe('Piper voice input', () => {
  it('puts a pad after every phoneme between the start and end ids, skipping unknown symbols', () => {
    expect(piperIds('ˈab, a!', idMap)).toEqual([1, 120, 0, 14, 0, 15, 0, 8, 0, 3, 0, 14, 0, 4, 0, 2]);
    expect(piperIds('a☃b', idMap)).toEqual([1, 14, 0, 15, 0, 2]);
  });

  it('keeps punctuation between clauses (the phonemizer drops it) but not decimal points', async () => {
    const seen: string[] = [];
    const phones = await piperPhonemes('Press hard, keep going. It is 15.38 now!', async (clause) => { seen.push(clause); return [clause.toLowerCase()]; });
    expect(seen).toEqual(['Press hard', 'keep going', 'It is 15.38 now']);
    expect(phones).toBe('press hard, keep going. it is 15.38 now!');
  });

  it('says the app name like "soul" and uses plain apostrophes', () => {
    expect(speakableText('Hey Sol, I’m here')).toBe("Hey soul, I'm here");
  });
});
