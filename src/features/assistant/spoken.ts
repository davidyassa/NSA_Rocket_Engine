/**
 * What Sol says out loud. The screen keeps the full answer; the voice gives the short
 * version, because every character spoken costs time. Pure and tested.
 *
 *  - emergencies: every step in full (accuracy first), with shorter wrappers;
 *  - crisis replies: in full;
 *  - everything else: the first sentence or two, without asides in brackets or the
 *    "Also: …" extra, and "More is on screen." when a lot was left out.
 */
import type { AssistantReply } from './respond';

/** Rough spoken budget for an ordinary answer (about 10–12 seconds at Sol's pace). */
export const SPOKEN_BUDGET = 190;
const MORE = 'More is on screen.';

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"‘'(])/).map((s) => s.trim()).filter(Boolean);
}

function tidy(text: string): string {
  return text
    .replace(/\s*\([^)]*\)/g, '') // asides in brackets
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/[→•·]/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function emergencySpeech(reply: AssistantReply): string {
  const steps = reply.steps ?? [];
  const start = reply.stepStart ?? 1;
  const first = reply.text.indexOf(`Step ${start}:`);
  const lead = first > 0 ? reply.text.slice(0, first).trim() : '';
  const more = /Say “next”/.test(reply.text);
  const done = /all the steps/i.test(reply.text);
  // "1: Press hard…" reads as "one, press hard…": shorter than "Step 1:".
  const body = steps.map((step, i) => `${start + i}: ${step}`).join(' ');
  return [lead, body, more ? 'Say next for more.' : done ? 'That’s all the steps.' : ''].filter(Boolean).join(' ');
}

/** The short spoken version of a reply. */
export function spokenText(reply: AssistantReply, budget = SPOKEN_BUDGET): string {
  if (reply.steps?.length) return emergencySpeech(reply);
  if (reply.speech) return reply.speech;
  if (reply.kind === 'crisis' || reply.kind === 'farewell') return reply.text;
  const all = sentences(tidy(reply.text.replace(/\s*Also:[\s\S]*$/, '')));
  const kept: string[] = [];
  let used = 0;
  for (const sentence of all) {
    if (kept.length && used + sentence.length > budget) break;
    kept.push(sentence);
    used += sentence.length + 1;
  }
  const left = tidy(reply.text).length - used;
  return left > 60 ? `${kept.join(' ')} ${MORE}` : kept.join(' ');
}
