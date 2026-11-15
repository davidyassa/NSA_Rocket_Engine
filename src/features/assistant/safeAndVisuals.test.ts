import { describe, expect, it } from 'vitest';
import { converse, newDialogue } from './dialogue';
import { KnowledgeIndex } from './knowledge';
import type { AssistantContext } from './respond';

const ctx: AssistantContext = { crewName: 'Maya Chen', sol: 43, oneWayDelayMinutes: 12, latest: null, assessment: null, history: [] };
const index = new KnowledgeIndex();
const say = (q: string, page = '/', c = ctx) => converse(q, newDialogue(), c, index, page);

describe('“I am dying” is an emergency', () => {
  it.each(['I am dying right now, help me.', 'I think I’m dying', 'he’s dying', 'I’m in terrible pain'])('“%s” calls the medical officer', (q) => {
    const turn = say(q, '/cognitive');
    expect(turn.reply.kind).toBe('urgent');
    expect(turn.action?.emergency).toMatchObject({ id: 'critical' });
    expect(turn.reply.text).not.toMatch(/Cognitive lab/);
  });

  it('“help me” alone is a call for help, not a page guide', () => {
    expect(say('help me', '/cognitive').reply.emergency).toBe('help');
    expect(say('help me on this page', '/cognitive').reply.text).toMatch(/Cognitive lab/);
  });

  it('keeps suicidal words on the crisis path', () => {
    expect(say('I want to die').reply.kind).toBe('crisis');
  });
});

describe('safe mode', () => {
  const inEmergency = () => say('he is choking').state;
  it.each([
    'We’re safe', 'Everything’s okay', 'Emergency has ended', 'The emergency is over', 'okay, we’re good now',
    'he’s stable', 'all clear', 'false alarm', 'it’s over', 'everything is under control', 'she’s breathing again',
  ])('“%s” turns Emergency Mode green', (q) => {
    expect(converse(q, inEmergency(), ctx, index).action?.emergency).toBe('safe');
  });

  it('works even after the conversation restarted, while Emergency Mode is on screen', () => {
    expect(say('Hey Sol, we’re safe', '/', { ...ctx, emergencyMode: 'alert' }).action?.emergency).toBe('safe');
    expect(say('Everything’s okay', '/').action?.emergency).toBeUndefined();
  });

  it('“all good” closes the islands in safe mode', () => {
    expect(say('all good', '/', { ...ctx, emergencyMode: 'safe' }).action?.emergency).toBe('close');
  });
});

describe('Sol explains tabs and features in at most two parts', () => {
  it('explains a whole tab specifically, then the details after one “next”, then stops', () => {
    let turn = say('Explain the charts on this page', '/timeline');
    expect(turn.reply.text).toMatch(/^Timeline: .* It has crew readings lane, mission events lane, habitat air lane, curiosity radiation lane, replay controls\. Say “next” for more\.$/);
    turn = converse('next', turn.state, ctx, index, '/timeline');
    expect(turn.reply.text).toMatch(/solid line is sleep in hours.*dotted line is NASA’s 1-hour limit of 3/);
    expect(turn.reply.text).not.toMatch(/next/);
    expect(turn.action).toBeUndefined(); // "next" did not move the timeline replay
    expect(turn.state.explain).toBeNull();
  });

  it('explains a named feature or sub-tab', () => {
    const turn = say('How do I read the CO2 chart?', '/timeline');
    expect(turn.reply.text).toMatch(/^Habitat air shows cabin CO2/);
    expect(converse('next', turn.state, ctx, index, '/timeline').reply.text).toMatch(/dotted line is NASA’s 1-hour limit of 3/);
  });

  it.each([
    ['/', 'What am I looking at?', /^Dashboard: .* It has general health status, crew digital twin/],
    ['/', 'Explain the digital twin', /^The astronaut figure shows/],
    ['/trends', 'Explain this chart', /^Trends: /],
    ['/hazards/radiation', 'Explain the 3D map', /^The 3D map shows the habitat’s six compartments/],
    ['/', 'What is the supplies tab?', /^Supplies lists what is on board/],
    ['/cmo', 'Explain the triage tab', /^Triage lists the active findings/],
    ['/cognitive', 'What is timed mode?', /^Timed mode runs for 3 minutes/],
    ['/radiation', 'Tell me about the evacuation route', /^The evacuation route shows/],
    ['/hazards', 'Explain this chart', /^There are no charts on the Hazards page/],
  ])('on %s, “%s”', (page, q, expected) => {
    expect(say(q, page).reply.text).toMatch(expected);
  });

  it('“explain this tab” on a sub-tab explains that sub-tab', () => {
    expect(converse('Explain this tab', newDialogue(), ctx, index, '/cmo', '?tab=kit').reply.text).toMatch(/^Supplies lists/);
  });

  it('never splits an explanation into more than two parts', async () => {
    const { FEATURES } = await import('./features');
    for (const f of FEATURES) expect(f.parts).toHaveLength(2);
  });
});
