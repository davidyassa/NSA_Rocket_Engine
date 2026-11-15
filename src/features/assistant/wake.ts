/**
 * "Hey Sol": recognizing the wake phrase in transcribed speech, and removing it (and
 * any other way of addressing Sol) from what was asked. Pure and tested.
 *
 * Speech recognition hears a quick "Hey Sol" in many ways ("hey soul", "a saul",
 * "heysol", "hey there sole", "Sol, …"), so matching is phonetic, while look-alikes such
 * as "Hey Solar", "Hey, solve this", "Hey Sally" and "Sol 41" are rejected.
 */

// The strict pattern: greeting (+ optional "there") + a Sol-like word, or a glued form.
const WAKE = /^\W*(?:(?:um+|uh+|okay|ok|so|oh|and|well)\W+){0,2}(?:(?:hey|hay|hei|hi|a|ay|eh|okay|ok|hello|hullo|hallo|yo|heya|hiya|oi)[\s,.:!?–—-]+(?:there[\s,]+)?(?:sol|soul|saul|seoul|sole|sal|sall|solle|sorl|sell|zol|sul|sole)|hey(?:sol|soul|saul|seoul|sole)|hay(?:sol|soul)|taysol)\b[\s,.:!?–—-]*([\s\S]*)$/i;

const GREET = new Set(['hey', 'hay', 'hei', 'heya', 'hiya', 'hi', 'hello', 'hullo', 'hallo', 'ay', 'ey', 'eh', 'yo', 'oi', 'a', 'ok', 'okay']);
const FILLER = new Set(['um', 'umm', 'uh', 'uhm', 'uhh', 'erm', 'er', 'well', 'so', 'okay', 'ok', 'hmm', 'mm', 'oh', 'and', 'right']);
const GLUED = ['hey', 'hay', 'ha', 'ay', 'a', 'ok', 'okay', 'yo', 'tay', 'he', 'hi'];

const edges = /^[\W_]+|[\W_]+$/g;
const bare = (word: string) => word.replace(edges, '').toLowerCase();
const skeleton = (word: string) => word.replace(/[aeiou]/g, '').replace(/[^a-z]/g, '');

/** True for a single word that sounds like "Sol": s/z + vowels + l, nothing after. */
export const soundsLikeSol = (word: string) =>
  ((/^[sz][aeiouwyh]+l{1,2}[aeiouy]?$/.test(word) && skeleton(word.replace(/[wyh]/g, '').replace(/^z/, 's').replace(/ll/, 'l')) === 'sl')
    && !/^(?:sally|sully|silly|selly|sallie|sale|seal|soil|sail|sell(?:y)?)$/.test(word))
  || ['seoul', 'zol', 'sul', 'saul', 'sole', 'soul', 'sol'].includes(word);

const restFrom = (words: string[], from: number) => words.slice(from).join(' ').replace(/^[\s\W_]+/, '').trim();

function fuzzyWake(text: string): { woke: boolean; rest: string } {
  const raw = text.trim().split(/\s+/).filter(Boolean);
  const words = raw.map(bare);
  // The greeting opens the phrase, after at most two throwaway fillers.
  for (let g = 0; g <= 2 && g < words.length; g += 1) {
    if (g > 0 && !FILLER.has(words[g - 1])) break;
    const head = words[g];
    if (!head) continue;
    const next = words[g + 1] === 'there' ? g + 2 : g + 1;
    if (GREET.has(head) && soundsLikeSol(words[next] ?? '')) return { woke: true, rest: restFrom(raw, next + 1) };
    for (const pre of GLUED) {
      if (head.length > pre.length && head.startsWith(pre) && soundsLikeSol(head.slice(pre.length))) return { woke: true, rest: restFrom(raw, g + 1) };
    }
    // Name first: "Sol, what is my pulse?" or just "Sol!" — but not "Sol 41".
    if (soundsLikeSol(head) && (words.length === g + 1 || (/[,.!?:]$/.test(raw[g]) && !/^\d/.test(words[g + 1] ?? '')))) {
      return { woke: true, rest: restFrom(raw, g + 1) };
    }
  }
  return { woke: false, rest: '' };
}

export function matchWake(text: string): { woke: boolean; rest: string } {
  const m = text.trim().match(WAKE);
  if (m) return { woke: true, rest: m[1].trim() };
  return fuzzyWake(text);
}

/**
 * What was asked, without the ways of addressing Sol: an opening "Hey Sol" (and its
 * variants), "Sol," at the start, ", Sol" at the end, and ", Sol," in the middle.
 * "Hey Sol" alone becomes ''. Mission days ("Sol 41") are never touched.
 */
export function stripAddress(text: string): string {
  let rest = text.trim();
  for (let i = 0; i < 3; i += 1) {
    const w = matchWake(rest);
    if (!w.woke) break;
    rest = w.rest;
  }
  const name = String.raw`(?:sol|soul|saul|sole|seoul)`;
  rest = rest
    // A trailing name needs a comma ("…, Sol"): "the Ask Sol tab" keeps its "Sol".
    .replace(new RegExp(String.raw`,\s*(?:hey\s+)?${name}[\s.!?]*$`, 'i'), (m) => m.replace(/[^.!?]/g, ''))
    .replace(new RegExp(String.raw`,\s*${name}\s*,`, 'gi'), ',')
    .replace(/^[\s,.:;!?–—-]+/, '')
    .trim();
  return rest;
}
