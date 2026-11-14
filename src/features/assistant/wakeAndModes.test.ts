import { describe, expect, it } from 'vitest';
import { METRIC_IDS, METRICS, type DailyCheckin, type MetricId } from '../../contracts';
import { evaluateCheckin } from '../../engine';
import { DEFAULT_SCENARIO_ID, DEMO_OPTIONS } from '../../scenarios';
import { converse, newDialogue } from './dialogue';
import { KnowledgeIndex } from './knowledge';
import type { AssistantContext } from './respond';
import { spokenText } from './spoken';
import { matchWake, stripAddress } from './wake';

// The Sol 43 demo mission, exactly as the app loads it.
const { scenario, prefill } = DEMO_OPTIONS[DEFAULT_SCENARIO_ID];
const at = new Date(Date.UTC(2039, 6, 14, 11)).toISOString();
const today: DailyCheckin = { id: 'x', sol: 43, astronautId: scenario.profile.id, submittedAtUtc: at, note: '', symptoms: [],
  measurements: METRIC_IDS.flatMap((m) => prefill[m] === undefined ? [] : [{ id: `x:${m}`, astronautId: scenario.profile.id, metric: m, value: prefill[m as MetricId]!, unit: METRICS[m].unit, observedAtUtc: at, provenance: 'synthetic_demo' as const }]) };
const assessment = evaluateCheckin(today, scenario.history, { events: scenario.events, archiveEvent: { sol: 41, date: '2017-09-11' }, environment: scenario.environment });
const ctx: AssistantContext = { crewName: 'Maya Chen', sol: 43, oneWayDelayMinutes: 20, latest: today, assessment, history: scenario.history };
const index = new KnowledgeIndex();
const say = (q: string, c: AssistantContext = ctx, page = '/') => converse(q, newDialogue(), c, index, page);

describe('“Hey Sol” sensitivity', () => {
  it.each([
    'Hey Sol', 'Hay Soul', 'A Saul, what is HRV?', 'Hey there Sol', 'Hi Sole', 'Yo Sol', 'Heysol', 'Okay Sol',
    'Sol!', 'Sol, what is my pulse?', 'Oh hey Sol', 'Um, so, hey Sol', 'Hei Sol', 'Eh Sol', 'Hello Seoul', 'Hey Zol',
  ])('wakes on “%s”', (text) => {
    expect(matchWake(text).woke).toBe(true);
  });

  it.each(['Sol 41 was the storm', 'Hey Solar', 'Hey Sally', 'Hey, so what is this page?', 'The console is slow', 'Sold out', 'Hey, solve this'])('ignores “%s”', (text) => {
    expect(matchWake(text).woke).toBe(false);
  });
});

describe('“Hey Sol” is only a hook, never part of the request', () => {
  it.each([
    ['Hey Sol, what is HRV?', 'what is HRV?'],
    ['Okay Sol I’m okay now', 'I’m okay now'],
    ['Sol, open the timeline', 'open the timeline'],
    ['What is SANS, Sol?', 'What is SANS?'],
    ['Tell me about Sol 41', 'Tell me about Sol 41'],
    ['How do I use the Ask Sol tab', 'How do I use the Ask Sol tab'],
  ])('“%s” → “%s”', (said, asked) => {
    expect(stripAddress(said)).toBe(asked);
  });

  it('answers the request the same with or without the address', () => {
    for (const q of ['what is HRV?', 'open the timeline', 'scroll down', 'I have a headache']) {
      const plain = say(q);
      const addressed = say(`Hey Sol, ${q}`);
      expect(addressed.reply.text).toBe(plain.reply.text);
      expect(addressed.action).toEqual(plain.action);
    }
  });

  it('“Hey Sol” alone just listens', () => {
    expect(say('Hey Sol').reply.text).toBe('I’m listening.');
  });
});

describe('emergencies start and end reliably', () => {
  it.each(['And I am dying.', 'I’m dying', 'I think I’m dying', 'I feel like I’m dying', 'I might die', 'Help, I’m dying', 'Dying!', 'Hey Sol, I am dying'])('“%s” starts Emergency Mode', (q) => {
    const turn = say(q);
    expect(turn.reply.kind).toBe('urgent');
    expect(turn.action?.emergency).toMatchObject({ id: 'critical' });
  });

  it.each(['Okay Sol I’m okay now', 'I am safe.', 'We’re safe', 'Everything’s fine now', 'It’s okay now', 'The danger is over', 'Emergency has ended', 'I’m alright now', 'he is breathing again'])('“%s” ends it', (q) => {
    const active = say('I am dying').state;
    expect(converse(q, active, ctx, index).action?.emergency).toBe('safe');
    // Also when "Hey Sol" restarted the conversation while Emergency Mode is on screen.
    expect(say(q, { ...ctx, emergencyMode: 'alert' }).action?.emergency).toBe('safe');
  });

  it('“I am safe” without an emergency is acknowledged, not “outside what I know”', () => {
    const r = say('I am safe.').reply;
    expect(r.text).toMatch(/Glad you’re safe/);
    expect(r.kind).not.toBe('out_of_scope');
  });

  it('casual “I’m good” is still small talk', () => {
    expect(say('I’m good').reply.text).not.toMatch(/safe/);
  });
});

describe('demo data is spoken like real data', () => {
  it.each([
    'What is my heart rate?', 'What is my blood pressure?', 'Show my vitals', 'What is my sleep trend?',
    'How am I doing today?', 'What supplies do we have?', 'What is the habitat air on Sol 41?', 'Summarize this page',
  ])('no demo or synthetic remark in “%s”', (q) => {
    for (const page of ['/', '/trends', '/cmo']) {
      const r = say(q, ctx, page).reply;
      expect(`${r.text} ${spokenText(r)}`, `${page}: ${q}`).not.toMatch(/\b(?:demo|synthetic|simulated)\b/i);
    }
  });
});
