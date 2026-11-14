import { describe, expect, it } from 'vitest';
import { converse, newDialogue } from './dialogue';
import { KnowledgeIndex } from './knowledge';
import type { AssistantContext, AssistantReply } from './respond';
import { SPOKEN_BUDGET, spokenText } from './spoken';
import { URGENT_CREW } from './urgentSpeech';

const ctx: AssistantContext = { crewName: 'Alex Rivera', sol: 43, oneWayDelayMinutes: 12, latest: null, assessment: null, history: [] };
const index = new KnowledgeIndex();
const ask = (q: string) => converse(q, newDialogue(), ctx, index).reply;

describe('what Sol says out loud', () => {
  it('speaks a short version of long answers and points to the screen', () => {
    for (const q of ['What is SANS?', 'Why does CO2 cause headaches?', 'what can you do', 'I have a headache', 'What happened on Sol 41?']) {
      const reply = ask(q);
      const said = spokenText(reply);
      expect(said.length, q).toBeLessThanOrEqual(Math.max(SPOKEN_BUDGET, said.split(/(?<=[.!?])\s/)[0].length) + 25);
      if (reply.text.length > SPOKEN_BUDGET + 80) expect(said, q).toMatch(/More is on screen\.$/);
    }
  });

  it('drops asides in brackets and the "Also:" extra', () => {
    const reply: AssistantReply = { kind: 'personal', sources: [], text: 'Your pulse on Sol 43: 62 bpm. Your usual (the middle of your last 7 readings) is 60 bpm. Also: Heart rate rises in space.' };
    expect(spokenText(reply)).toBe('Your pulse on Sol 43: 62 bpm. Your usual is 60 bpm.');
  });

  it('keeps every emergency step, word for word', () => {
    const reply = ask('he is not breathing');
    const said = spokenText(reply);
    expect(said.startsWith(URGENT_CREW)).toBe(true);
    for (const step of reply.steps!) expect(said).toContain(step);
    expect(said).toMatch(/1: .* 2: .* 3: .*Say next for more\.$/);
    expect(said.length).toBeLessThan(reply.text.length);
  });

  it('keeps crisis replies in full', () => {
    const reply = ask('I want to die');
    expect(spokenText(reply)).toBe(reply.text);
  });
});
