import { describe, expect, it } from 'vitest';
import { METRIC_IDS, METRICS, type DailyCheckin, type MetricId } from '../../contracts';
import { evaluateCheckin } from '../../engine';
import { DEFAULT_SCENARIO_ID, DEMO_OPTIONS } from '../../scenarios';
import { KnowledgeIndex } from './knowledge';
import { respond, type AssistantContext } from './respond';

const { scenario, prefill } = DEMO_OPTIONS[DEFAULT_SCENARIO_ID];
const id = `${scenario.profile.id}:43`;
const at = new Date(Date.UTC(2039, 6, 14, 11)).toISOString();
const today: DailyCheckin = {
  id, sol: 43, astronautId: scenario.profile.id, submittedAtUtc: at, note: '',
  measurements: METRIC_IDS.flatMap((metric) => prefill[metric] === undefined ? [] : [{
    id: `${id}:${metric}`, astronautId: scenario.profile.id, metric, value: prefill[metric as MetricId]!, unit: METRICS[metric].unit,
    observedAtUtc: at, provenance: 'synthetic_demo' as const,
  }]),
  symptoms: [],
};
const assessment = evaluateCheckin(today, scenario.history, { events: scenario.events, archiveEvent: { sol: 41, date: '2017-09-11' }, environment: scenario.environment });
const ctx: AssistantContext = { crewName: 'Maya Chen', sol: 43, oneWayDelayMinutes: 20, latest: today, assessment, history: scenario.history };
const index = new KnowledgeIndex();
const ask = (q: string) => respond(q, ctx, index);

describe('Ask Sol safety rules come first', () => {
  it('sends crisis words to a person now, before anything else', () => {
    const reply = ask('I feel hopeless and I can’t cope anymore');
    expect(reply.kind).toBe('crisis');
    expect(reply.text).toMatch(/crew medical officer or a crewmate/);
    expect(reply.text).toMatch(/40 minutes/);
  });

  it('treats emergency symptoms as urgent', () => {
    expect(ask('I have chest pain and can’t breathe').kind).toBe('urgent');
  });

  it('never recommends medicines, doses or diagnoses', () => {
    for (const q of ['What medicine should I take for my headache?', 'How many paracetamol tablets can I take?', 'Do I have a kidney stone?']) {
      const reply = ask(q);
      expect(reply.kind).toBe('declined');
      expect(reply.text).toMatch(/can’t recommend medicines, doses or diagnoses/);
      expect(reply.text).not.toMatch(/\b\d+\s?mg\b/i);
      expect(reply.text).not.toMatch(/breaths you take/);
    }
  });
});

describe('Ask Sol answers only from Sol Check’s cited knowledge', () => {
  it.each([
    ['Why does CO2 cause headaches?', /CO2|carbon dioxide/i],
    ['What is SANS?', /neuro-ocular|eye/i],
    ['How do I measure blood pressure?', /cuff|blood pressure/i],
    ['What happened on Sol 41?', /solar/i],
    ['Tell me about the Inspiration4 data', /baseline/i],
    ['Why is there a delay talking to Earth?', /20 minutes/],
  ])('%s', (question, pattern) => {
    const reply = ask(question);
    expect(reply.kind).toBe('answer');
    expect(reply.text).toMatch(pattern);
    expect(reply.sources.length).toBeGreaterThan(0);
  });

  it('declines questions outside the project', () => {
    for (const q of ['Who won the football world cup?', 'Write me a poem about cats', 'What is the stock price of Tesla?']) {
      expect(ask(q).kind, q).toBe('out_of_scope');
    }
  });
});

describe('Ask Sol handles everyday conversation', () => {
  it.each([
    ['Hello, Sol!', /Hi Maya/],
    ['Hello, Soul.', /Hi Maya/],
    ['Good morning.', /Hi Maya/],
    ['Hey, how are you?', /ready to help/],
    ['Thank you, Sol.', /welcome/],
    ['I\'m doing great. So, what about you?', /glad to hear that.*doing well too/i],
    ['What about you?', /ready to help/],
    ['I\'m doing great.', /Glad to hear/],
  ])('replies naturally to %s', (question, pattern) => {
    expect(ask(question)).toMatchObject({ kind: 'help', text: expect.stringMatching(pattern), sources: [] });
  });

  it.each(['Good bye, Sol.', 'Goodbye, Soul.', 'Goodbye!', 'Bye.', 'Thanks, see you later.'])('gives a farewell for %s', (question) => {
    expect(ask(question)).toMatchObject({ kind: 'farewell', text: expect.stringMatching(/Goodbye, Maya/), sources: [] });
  });

  it('answers the question after a greeting', () => {
    expect(ask('Hi Sol, how is my sleep?').kind).toBe('personal');
    expect(ask('Hello. What is SANS?').kind).toBe('answer');
  });

  it('prioritizes urgent symptoms even when the message opens with a social phrase', () => {
    expect(ask('Hello, I have chest pain.').kind).toBe('urgent');
    expect(ask('Goodbye. I feel hopeless.').kind).toBe('crisis');
  });
});

describe('Ask Sol knows the crew member’s own check-in', () => {
  it('explains a personal reading against their usual', () => {
    const reply = ask('How is my sleep?');
    expect(reply.kind).toBe('personal');
    expect(reply.text).toMatch(/4\.5 h/);
    expect(reply.text).toMatch(/usual/);
  });

  it('summarises today and suggests the right person', () => {
    const reply = ask('How am I doing today?');
    expect(reply.kind).toBe('personal');
    expect(reply.text).toMatch(/crew medical officer/i);
  });

  it('starts a mood conversation when asked or when someone says they feel low', () => {
    expect(ask('Start a mood check').kind).toBe('mood_start');
    expect(ask('I feel stressed today').kind).toBe('mood_start');
    expect(ask('Start a mode check.').kind).toBe('mood_start'); // common voice mishearing
  });
});
