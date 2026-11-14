/**
 * Guard for the optional on-device language model ("Natural replies").
 *
 * The model may only REWORD Sol Check's checked answer into warmer spoken
 * language. This verifier rejects any rewrite that could change the facts:
 * new numbers, medicines or diagnoses, dropped "tell your crew medical officer",
 * or text that is empty, too long or claims to be a doctor. On rejection the
 * checked answer is used unchanged. Pure, so the rules are unit-tested.
 *
 * Status: NOT wired into the app. In our evaluation (docs/validation/local-llm-evaluation.md)
 * two small on-device models (SmolLM2-360M, Qwen2.5-0.5B) invented health facts or broke
 * down on every test answer, and this guard rejected all of them. Kept for a future,
 * stronger model.
 */
import type { AssistantReply, ReplyKind } from './respond';

/** Replies the model never touches: safety text must stay exactly as written. */
export const NEVER_REWRITE: readonly ReplyKind[] = ['crisis', 'urgent', 'declined', 'out_of_scope', 'mood_start', 'farewell'];

export function canRewrite(reply: AssistantReply): boolean {
  return !NEVER_REWRITE.includes(reply.kind) && reply.text.length > 25;
}

const MEDICINE = /\b(medicine|medication|drug|pill|tablet|dose|dosage|mg\b|prescri\w*|antibiotic|ibuprofen|paracetamol|acetaminophen|aspirin|melatonin)\b/i;
const DIAGNOSIS = /\b(you have|you'?ve got|diagnos\w*|it is (definitely|probably) (a|an))\b/i;
const CLAIMS = /\b(as a doctor|i am a doctor|i'?m a doctor|as an ai language model)\b/i;
const ESCALATE = /\b(crew medical officer|medical officer|cmo)\b/i;

/** Words a rewording may add: conversation glue, not facts. */
const FILLER = new Set('about actually also alright always another anything because been being better could does doing done each else even ever every feel feeling feels fine first from gets getting give going good great have having help helps here hope just keep know let lets like little look make maybe more most much need nice okay only other over please quite really right same should since some something still sure take than thank thanks that their them then there these they thing things think this those though through today together very want well were what when where which while will with worth would your yours sorry glad important simply worry worried alone happy'.split(' '));
const stem = (w: string) => w.replace(/(ings|ing|ies|ied|es|s|ed|ly)$/, '');
const contentWords = (text: string) => (text.toLowerCase().replace(/[’']/g, '').match(/[a-z]{4,}/g) ?? []).map(stem);

/** Share of the rewording's content words that are not in the checked answer. */
export function novelty(original: string, rewrite: string): { ratio: number; added: string[] } {
  const known = new Set(contentWords(original));
  const words = contentWords(rewrite).filter((w) => !FILLER.has(w));
  const added = [...new Set(words.filter((w) => !known.has(w)))];
  return { ratio: words.length ? added.length / new Set(words).size : 0, added };
}

const numbers = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));

export type GuardResult = { ok: true; text: string } | { ok: false; reason: string };

export function verifyRewrite(original: string, rewrite: string): GuardResult {
  const text = rewrite.replace(/\s+/g, ' ').replace(/^["“'\s]+|["”'\s]+$/g, '').trim();
  if (text.length < 15) return { ok: false, reason: 'empty' };
  if (text.length > Math.max(420, original.length * 1.2)) return { ok: false, reason: 'too long' };
  const allowed = new Set(numbers(original));
  const added = numbers(text).filter((n) => !allowed.has(n));
  if (added.length) return { ok: false, reason: `new numbers: ${added.join(', ')}` };
  if (MEDICINE.test(text) && !MEDICINE.test(original)) return { ok: false, reason: 'medicine' };
  if (DIAGNOSIS.test(text) && !DIAGNOSIS.test(original)) return { ok: false, reason: 'diagnosis' };
  if (CLAIMS.test(text)) return { ok: false, reason: 'claims' };
  // New statements hide in new words ("long-term effects", "well-being"): allow only a few.
  const fresh = novelty(original, text);
  if (fresh.added.length > 3 || fresh.ratio > 0.4) return { ok: false, reason: `new content: ${fresh.added.slice(0, 6).join(', ')}` };
  if (ESCALATE.test(original) && !ESCALATE.test(text)) return { ok: false, reason: 'dropped the crew medical officer' };
  return { ok: true, text };
}

export function rewritePrompt(question: string, answer: string): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content: 'You are Sol, a warm and calm health helper talking to an astronaut. Rewrite the CHECKED ANSWER as a short, natural spoken reply (1 to 3 sentences) to their QUESTION. Use only facts from the CHECKED ANSWER. Do not add facts, numbers, medicines or diagnoses. If it says to talk to the crew medical officer, keep that. Do not use lists or headings.',
    },
    { role: 'user', content: `QUESTION: ${question}\nCHECKED ANSWER: ${answer}` },
  ];
}
