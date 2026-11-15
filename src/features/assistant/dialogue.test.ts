import { describe, expect, it } from 'vitest';
import { METRIC_IDS, METRICS, type DailyCheckin, type MetricId } from '../../contracts';
import { evaluateCheckin } from '../../engine';
import { DEFAULT_SCENARIO_ID, DEMO_OPTIONS } from '../../scenarios';
import { cleanSpeech, converse, newDialogue, speculateIntent, type DialogueState } from './dialogue';
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
    const [how, old, reciprocal, combined] = chat([
      'I don\'t know why, I don\'t know why. How are you?',
      '- Hello? - How old are you?',
      'I\'m doing great. So, what about you?',
      'Doing well, how about you?',
    ]);
    expect(how.text).toMatch(/doing well/);
    expect(how.text).not.toMatch(/outside what I know/);
    expect(old.text).toMatch(/2026 NASA Space Apps/);
    expect(reciprocal.text).toMatch(/glad to hear that.*doing well too/i);
    expect(reciprocal.text).not.toMatch(/outside what I know/);
    expect(combined.text).toMatch(/glad to hear that.*doing well too/i);
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
    expect(urgent.action?.checkin).toBeUndefined();
    expect(urgent.action?.navigate).toBeUndefined();
    expect(urgent.action?.emergency).toMatchObject({ id: "chest-pain" });
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
    expect(converse('Summarize this page', newDialogue(), live, index, '/cmo', '?tab=kit').reply.text).toContain('Supplies on Sol 43');
    expect(converse('Check checklist resting pulse', newDialogue(), live, index).action?.routine).toEqual({ id: 'heart_rate', checked: true });
    expect(converse('Scroll down', newDialogue(), live, index).action).toEqual({ scroll: 'down' });
    expect(converse('Open supplies', newDialogue(), live, index).action?.navigate).toBe('/cmo?tab=kit');
    expect(converse('Select sol 41', newDialogue(), live, index).action?.navigate).toBe('/timeline?sol=41');
    // Scroll a set number of lines, in either direction.
    expect(converse('Scroll down 5 lines', newDialogue(), live, index).action).toEqual({ scrollLines: 5 });
    expect(converse('scroll up by 3', newDialogue(), live, index).action).toEqual({ scrollLines: -3 });
    // Scroll to a named destination on the page.
    expect(converse('Scroll to the evidence passport', newDialogue(), live, index).action).toEqual({ scrollTo: 'evidence passport' });
    expect(converse('skip to tested on real astronaut data', newDialogue(), live, index).action).toEqual({ scrollTo: 'tested on real astronaut data' });
    // Click a compartment on the radiation 3D model.
    expect(converse('Open the storm shelter', newDialogue(), live, index).action).toEqual({ radiationRoom: 'storm-shelter', navigate: '/hazards/radiation' });
    expect(converse('zoom in on the flight deck', newDialogue(), live, index, '/hazards/radiation').action).toEqual({ radiationRoom: 'flight-deck' });
    // "Jump to sol N" must still go to the timeline, not be eaten by scroll-to.
    expect(converse('jump to sol 41', newDialogue(), live, index).action?.navigate).toBe('/timeline?sol=41');

    // Computer use task: navigate to subpages of a page like cardiovascular trends on the trends page
    const subpageTurn1 = converse('Navigate to cardiovascular trends on the trends page', newDialogue(), live, index);
    expect(subpageTurn1.action?.navigate).toBe('/trends?category=cardiovascular&metric=heart_rate');
    expect(subpageTurn1.action?.navigateLabel).toBe('Opening Cardiovascular trends');
    expect(subpageTurn1.reply.text).toContain('Opening Cardiovascular trends on the Trends page');

    const subpageTurn2 = converse('Navigate to subpages of a page like cardiovascular trends on the trends page', newDialogue(), live, index);
    expect(subpageTurn2.action?.navigate).toBe('/trends?category=cardiovascular&metric=heart_rate');

    const subpageTurn3 = converse('Open metabolic trends', newDialogue(), live, index);
    expect(subpageTurn3.action?.navigate).toBe('/trends?category=metabolic&metric=blood_glucose');
    expect(subpageTurn3.action?.navigateLabel).toBe('Opening Metabolic & physical trends');

    const subpageTurn4 = converse('Navigate to timed mode on cognitive lab', newDialogue(), live, index);
    expect(subpageTurn4.action?.navigate).toBe('/cognitive?mode=timed');
    expect(subpageTurn4.action?.navigateLabel).toBe('Opening Timed vigilance check');
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

  it('speculates intent and pre-warms routes with Aegis-Zero zero-latency prediction', () => {
    // 1. "check my cardio..." while user is mid-speech
    const cardioSpec = speculateIntent('check my cardio');
    expect(cardioSpec.isActionable).toBe(true);
    expect(cardioSpec.predictedRoute).toBe('/trends?category=cardiovascular&metric=heart_rate');
    expect(cardioSpec.action?.navigate).toBe('/trends?category=cardiovascular&metric=heart_rate');
    expect(cardioSpec.action?.navigateLabel).toBe('Cardiovascular trends');

    // 2. "check my sleep"
    const sleepSpec = speculateIntent('check my sleep');
    expect(sleepSpec.isActionable).toBe(true);
    expect(sleepSpec.predictedRoute).toBe('/trends?category=wellbeing&metric=sleep_duration');

    // 3. 3D radiation room targeting
    const roomSpec = speculateIntent('open the flight deck');
    expect(roomSpec.isActionable).toBe(true);
    expect(roomSpec.action?.radiationRoom).toBe('flight-deck');

    // 4. Primary route navigation
    const navSpec = speculateIntent('go to cognitive lab', '/');
    expect(navSpec.isActionable).toBe(true);
    expect(navSpec.predictedRoute).toBe('/cognitive');

    // 5. Short noise or question should not trigger speculative routing
    expect(speculateIntent('um').isActionable).toBe(false);
    expect(speculateIntent('what is my heart rate').isActionable).toBe(false);
  });
});

