import { describe, expect, it } from 'vitest';
import { METRIC_IDS, METRICS, type DailyCheckin, type MetricId } from '../../contracts';
import { evaluateCheckin } from '../../engine';
import { DEFAULT_SCENARIO_ID, DEMO_OPTIONS } from '../../scenarios';
import { cleanSpeech, converse, newDialogue, type DialogueState } from './dialogue';
import { KnowledgeIndex } from './knowledge';
import { TOUR_ROUTES } from './pageGuides';
import type { AssistantContext } from './respond';

const { scenario, prefill } = DEMO_OPTIONS[DEFAULT_SCENARIO_ID];
const at = new Date(Date.UTC(2039, 6, 14, 11)).toISOString();
const today: DailyCheckin = { id: 'x', sol: 43, astronautId: scenario.profile.id, submittedAtUtc: at, note: '', symptoms: [],
  measurements: METRIC_IDS.flatMap((m) => prefill[m] === undefined ? [] : [{ id: `x:${m}`, astronautId: scenario.profile.id, metric: m, value: prefill[m as MetricId]!, unit: METRICS[m].unit, observedAtUtc: at, provenance: 'synthetic_demo' as const }]) };
const assessment = evaluateCheckin(today, scenario.history, { events: scenario.events, archiveEvent: { sol: 41, date: '2017-09-11' }, environment: scenario.environment });
const ctx: AssistantContext = { crewName: 'Maya Chen', sol: 43, oneWayDelayMinutes: 20, latest: today, assessment, history: scenario.history };
const index = new KnowledgeIndex();

function chat(lines: string[]) {
  let state: DialogueState = newDialogue();
  return lines.map((line) => { const r = converse(line, state, ctx, index); state = r.state; return r.reply; });
}

describe('Ask Sol conversation (the transcript that went wrong)', () => {
  it('cleans repeated filler and two voices in one clip', () => {
    expect(cleanSpeech('I don’t know why, I don’t know why. How are you?')).toContain('How are you?');
    expect(cleanSpeech('- Hello? - How old are you?')).toEqual(['Hello?', 'How old are you?']);
  });

  it('answers small talk warmly, even with noise around it', () => {
    const [how, old] = chat(['I don\'t know why, I don\'t know why. How are you?', '- Hello? - How old are you?']);
    expect(how.text).toMatch(/doing well/);
    expect(how.text).not.toMatch(/outside what I know/);
    expect(old.text).toMatch(/2026 NASA Space Apps/);
  });

  it('treats "oxygen is low in the room" as an urgent habitat problem', () => {
    const [reply] = chat(['I feel like oxygen is low in the room.']);
    expect(reply.kind).toBe('urgent');
    expect(reply.text).toMatch(/Alert your crew now/);
  });

  it('cares for "I am feeling dizzy" with steps and when to get help, not a definition', () => {
    const [reply] = chat(['I am feeling dizzy.']);
    expect(reply.text).toMatch(/sorry you’re feeling dizzy/);
    expect(reply.text).toMatch(/Sit or lie down|Rise slowly/);
    expect(reply.text).toMatch(/crew medical officer/);
    expect(reply.sources.length).toBeGreaterThan(0);
  });

  it('answers "How do I stop feeling dizzy?" with steps', () => {
    const [reply] = chat(['How do I stop feeling dizzy?']);
    expect(reply.text).toMatch(/Here’s what helps/);
  });

  it('remembers the topic for follow-ups', () => {
    const [, why, todo] = chat(['I have a headache', 'why?', 'what should I do?']);
    expect(why.text).toMatch(/CO2|carbon dioxide/i);
    expect(why.text.length).toBeGreaterThan(20);
    expect(todo.text).toMatch(/^For headache:/);
  });

  it('explains why dizziness happens in space, and is kind before a mood check', () => {
    const [, why] = chat(['I am feeling dizzy', 'why?']);
    expect(why.text).toMatch(/stand|blood pressure/i);
    const [lonely] = chat(['I feel lonely']);
    expect(lonely.kind).toBe('mood_start');
    expect(lonely.text).toMatch(/sorry you’re feeling lonely/);
  });

  it('keeps refusing medicines and invented facts', () => {
    const [med, off] = chat(['I have a headache, what pill should I take?', 'Who won the world cup?']);
    expect(med.kind).toBe('declined');
    expect(off.text).toMatch(/I don’t make things up/);
  });

  it('still puts crisis words first', () => {
    const [reply] = chat(['Hello. I feel hopeless.']);
    expect(reply.kind).toBe('crisis');
  });

  it('knows which tab you are on and explains it', () => {
    const r = converse('What is this page?', newDialogue(), ctx, index, '/timeline');
    expect(r.reply.text).toMatch(/^You’re on the Timeline\./);
    expect(converse('help me here', newDialogue(), ctx, index, '/cmo').reply.text).toMatch(/CMO console/);
    expect(converse('Where am I?', newDialogue(), ctx, index, '/hazards/isolation').reply.sources[0]?.route).toBe('/hazards/isolation');
  });

  it('opens a tab when asked', () => {
    const r = converse('Open the timeline', newDialogue(), ctx, index, '/');
    expect(r.action?.navigate).toBe('/timeline');
    expect(r.reply.text).toMatch(/^Opening the Timeline\./);
  });

  it('gives a guided tour with next, back and stop', () => {
    let r = converse('Give me a tour', newDialogue(), ctx, index, '/');
    expect(r.action?.navigate).toBe('/');
    expect(r.reply.text).toMatch(/Stop 1 of/);
    r = converse('next', r.state, ctx, index, '/');
    expect(r.action?.navigate).toBe('/check-in');
    r = converse('back', r.state, ctx, index, '/check-in');
    expect(r.action?.navigate).toBe('/');
    r = converse('Stop.', r.state, ctx, index, '/');
    expect(r.state.tour).toBeNull();
    expect(r.action).toBeUndefined();
  });

  it('ends the tour at the last tab and still prioritizes urgent symptoms during it', () => {
    let r = converse('Show me around', newDialogue(), ctx, index);
    expect(converse('Next, I have chest pain.', r.state, ctx, index).reply.kind).toBe('urgent');
    for (const route of TOUR_ROUTES.slice(1)) {
      r = converse('Next.', r.state, ctx, index);
      expect(r.action?.navigate).toBe(route);
    }
    expect(r.state.tour).toBeNull();
    expect(converse('next', r.state, ctx, index).action).toBeUndefined();
  });

  it('recognizes a farewell so the dock can return to wake mode', () => {
    expect(converse('Bye, Sol!', newDialogue(), ctx, index).reply.kind).toBe('farewell');
  });

  it('fills a reviewable check-in with spoken numbers, a symptom and a note', () => {
    const result = converse('Log my check-in. My pulse was 82, my blood pressure was 118 over 76, I slept six and a half hours, and I had a headache. Add a note: Took the reading after lunch.', newDialogue(), ctx, index);
    expect(result.action).toEqual({
      navigate: '/check-in',
      checkin: {
        readings: { heart_rate: 82, bp_systolic: 118, bp_diastolic: 76, sleep_duration: 6.5 },
        symptoms: { headache: true },
        note: { text: 'Took the reading after lunch.', append: true },
      },
    });
    expect(converse('Uncheck headache and set my pulse to 84', result.state, ctx, index, '/check-in').action?.checkin)
      .toEqual({ readings: { heart_rate: 84 }, symptoms: { headache: false } });
  });

  it('suggests a low mood for review and prioritizes emergencies over all edits', () => {
    expect(converse('I’m feeling very bad', newDialogue(), ctx, index).action?.checkin)
      .toEqual({ readings: { mood: 1 }, symptoms: {}, moodSuggested: true });
    const urgent = converse('Log my check-in. I have chest pain and my pulse is 82.', newDialogue(), ctx, index);
    expect(urgent.reply.kind).toBe('urgent');
    expect(urgent.reply.text).toMatch(/^Tell your crew medical officer straight away/);
    expect(urgent.action).toBeUndefined();
  });

  it('asks for clarification before writing questionable entries', () => {
    for (const text of ['Log my pulse as 82 or 83', 'Record my blood pressure as 76 over 118', 'Set sleep to around six hours', 'Set blood glucose to 5 mmol per litre']) {
      expect(converse(text, newDialogue(), ctx, index, '/check-in').action?.checkin, text).toBeUndefined();
    }
    expect(converse('Edit my standing heart rate to ninety two', newDialogue(), ctx, index).action?.checkin?.readings)
      .toEqual({ heart_rate_standing: 92 });
    expect(converse('Record my blog pressure as 118 over 76', newDialogue(), ctx, index).action?.checkin?.readings)
      .toEqual({ bp_systolic: 118, bp_diastolic: 76 });
    expect(converse('Log my check-in. I did not have a headache.', newDialogue(), ctx, index).action?.checkin?.symptoms ?? {}).not.toHaveProperty('headache', true);
  });

  it('refuses out-of-range BPM without applying any part of the edit', () => {
    const turn = converse('Change my bpm to 1000bpm and check headache', newDialogue(), ctx, index, '/check-in');
    expect(turn.action).toBeUndefined();
    expect(turn.reply.text).toContain('1000 bpm is outside the voice entry range');
  });

  it('reads the selected view and sends explicit controls to the app', () => {
    const live = { ...ctx, mission: {
      scenario, vigilance: [], followUps: [], timelineSol: 41,
      routine: [{ id: 'heart_rate', label: 'Resting pulse', checked: false, recorded: false }],
      checkinDraft: { page: 'Review & save', readings: { heart_rate: '84' }, symptoms: ['Headache'], note: 'After lunch' },
    } };
    expect(converse('Summarize this page', newDialogue(), live, index, '/timeline').reply.text).toContain('Sol 41');
    expect(converse('Summarize this page', newDialogue(), live, index, '/check-in').reply.text).toContain('Heart rate: 84 bpm');
    expect(converse('Summarize this page', newDialogue(), live, index, '/trends', '?metric=sleep_duration').reply.text).toContain('usable readings');
    expect(converse('Summarize this page', newDialogue(), live, index, '/cmo', '?tab=kit').reply.text).toContain('Demo supplies');
    expect(converse('Check checklist resting pulse', newDialogue(), live, index).action?.routine).toEqual({ id: 'heart_rate', checked: true });
    expect(converse('Scroll down', newDialogue(), live, index).action).toEqual({ scroll: 'down' });
    expect(converse('Open supplies', newDialogue(), live, index).action?.navigate).toBe('/cmo?tab=kit');
    expect(converse('Select sol 41', newDialogue(), live, index).action?.navigate).toBe('/timeline?sol=41');
  });

  it('reviews mission evidence without extrapolating survival or offering clearance', () => {
    const mission = { scenario, vigilance: [], followUps: [] };
    const result = converse('Review this mission. What are my chances of survival on a 2-hour EVA?', newDialogue(), { ...ctx, mission, history: [...ctx.history, today] }, index);
    expect(result.reply.text).toContain('Mission survival is undetermined');
    expect(result.reply.text).toContain('2-hour EVA');
    expect(result.reply.text).toContain('crew medical officer');
    expect(result.reply.text).not.toMatch(/\d+%|cleared to/i);
    expect(result.reply.sources.some(item => item.route === '/assessment')).toBe(true);
    const shortfall = converse('Review this mission: a 2-hour EVA and oxygen lasts 90 minutes.', newDialogue(), { ...ctx, mission }, index);
    expect(shortfall.reply.text).toMatch(/^The oxygen duration you gave is 30 minutes shorter/);
    const reserve = converse('Review this mission: a 2-hour EVA, oxygen lasts 130 minutes, and we need 20 minutes of reserve.', newDialogue(), { ...ctx, mission }, index);
    expect(reserve.reply.text).toContain('10 minutes short once the stated reserve is included');
  });

  it('answers from the active scenario, even when another tab is open', () => {
    const mission = { scenario, vigilance: [], followUps: [], radiation: { status: 'ORANGE', room: 'Flight deck', doseRate: 2.4, origin: 'simulated' } };
    const live = { ...ctx, mission };
    expect(converse('Give me my blood pressure', newDialogue(), live, index, '/demo').reply.text).toMatch(/over.*mercury/);
    expect(converse('What radiation status does the monitor show?', newDialogue(), live, index, '/timeline').reply.text).toMatch(/ORANGE.*2\.40.*simulated/);
    expect(converse('What happened on Sol 41?', newDialogue(), live, index, '/assistant').reply.sources.some(item => item.route === '/timeline')).toBe(true);
  });
});

