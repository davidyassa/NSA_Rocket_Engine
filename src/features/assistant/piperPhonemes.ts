/**
 * Text → Piper voice input (pure, tested). Piper reads espeak-ng phonemes, one id per
 * phoneme character with a pad id after each, between start and end ids.
 */

/** Sol's speaking rate (1 = the voice's natural pace). */
export const SOL_SPEED = 1.25;

/**
 * Piper's variation settings. Lower than the voice's defaults (0.667 / 0.8): steadier
 * and clearer, which measured fewer misheard words on Sol's emergency steps.
 */
export const PIPER_NOISE = { scale: 0.5, width: 0.6 } as const;

/** Split at punctuation, keeping it, so pauses land in the right places (not inside "15.38"). */
const PUNCTUATION = /((?<!\d)\.|\.(?!\d)|[,;:!?—…]+)/;

/** Spoken form: the app name rhymes with "soul", and typographic apostrophes are plain. */
export const speakableText = (text: string) => text.replace(/\bSol\b/gi, 'soul').replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

/**
 * Phonemes for a whole piece of text. `phonemize` turns one clause into phoneme words
 * (the phonemizer drops punctuation, so it is put back between clauses).
 */
export async function piperPhonemes(text: string, phonemize: (clause: string) => Promise<string[]>): Promise<string> {
  const parts = speakableText(text).split(PUNCTUATION);
  const phones = await Promise.all(parts.map(async (part, index) => {
    if (index % 2) return part.replace('—', ',').replace('…', '.');
    if (!part.trim()) return part;
    const leading = part.match(/^\s*/)?.[0] ? ' ' : '';
    const trailing = part.match(/\s*$/)?.[0] ? ' ' : '';
    return leading + (await phonemize(part.trim())).join(' ') + trailing;
  }));
  return phones.join('').replace(/\s+/g, ' ').trim();
}

/** Piper ids: "^", then each known phoneme followed by the pad "_", then "$". */
export function piperIds(phonemes: string, idMap: Record<string, number[]>): number[] {
  const ids = [...(idMap['^'] ?? [1])];
  const pad = idMap._ ?? [0];
  for (const symbol of Array.from(phonemes)) {
    const id = idMap[symbol];
    if (!id) continue;
    ids.push(...id, ...pad);
  }
  ids.push(...(idMap.$ ?? [2]));
  return ids;
}
