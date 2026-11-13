/** Mood conversation helpers shared by the text chat and voice mode (pure, tested). */
import { MOOD_QUESTIONS, calculateBaseMoodScore, type MoodMcqAnswers } from '../checkin/moodAssessment';
import type { AssistantReply } from './respond';

export { MOOD_QUESTIONS };

const WORDS: Record<string, number> = { one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, tree: 3, four: 4, for: 4, five: 5 };

/**
 * Spoken answer → score 1–5. Accepts "four", "4", "number three", or words from an
 * option ("calm", "exhausted"). Returns null when unclear, so we can ask again.
 */
export function parseMoodAnswer(spoken: string, questionIndex: number): number | null {
  const text = spoken.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const digit = text.match(/\b([1-5])\b/);
  if (digit) return Number(digit[1]);
  for (const token of text.split(/\s+/)) if (WORDS[token] && token !== 'to' && token !== 'for') return WORDS[token];
  const question = MOOD_QUESTIONS[questionIndex];
  if (!question) return null;
  let best: { score: number; hits: number } | null = null;
  for (const option of question.options) {
    const words = option.label.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 4);
    const hits = words.filter((w) => text.includes(w)).length;
    if (hits && (!best || hits > best.hits)) best = { score: option.score, hits };
  }
  return best?.score ?? null;
}

export function moodQuestionSpeech(index: number): string {
  const q = MOOD_QUESTIONS[index];
  return `Question ${q.number} of ${MOOD_QUESTIONS.length}. ${q.prompt} Say a number from 1 to 5, where 5 is best.`;
}

export function moodReply(answers: MoodMcqAnswers): AssistantReply {
  const result = calculateBaseMoodScore(answers);
  const score = result.baseScore ?? 3;
  const lowest = Math.min(...Object.values(answers).filter((v): v is number => typeof v === 'number'));
  const talk = score <= 2 || lowest === 1;
  return {
    kind: 'personal',
    text: talk
      ? `Thanks for answering. Your mood check comes out at ${score} of 5 (${result.classification.toLowerCase()}). That is worth talking about today with your crew medical officer or a crewmate you trust. You don't have to wait for Earth.`
      : score === 3
        ? `Thanks. Your mood check comes out at ${score} of 5 (${result.classification.toLowerCase()}). Keep an eye on it: protect your next sleep, take a short break with a crewmate, and check again tomorrow.`
        : `Thanks. Your mood check comes out at ${score} of 5 (${result.classification.toLowerCase()}). That looks steady. Keep doing what helps.`,
    sources: [{ label: 'Sol Check mood questions (6 items)', route: '/check-in' }, ...(talk ? [{ label: 'Talk to someone now (action card)', route: '/assessment' }] : [])],
    suggestions: talk ? ['Why does isolation affect mood?', 'What does the crew medical officer do?'] : ['Why does sleep matter in space?'],
  };
}
