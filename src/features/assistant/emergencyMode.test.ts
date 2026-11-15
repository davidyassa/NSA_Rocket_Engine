import { describe, expect, it } from 'vitest';
import { bestMatch, matchScore } from './computerUse';
import { converse, newDialogue, roomIn, type ScreenControls } from './dialogue';
import { CONTACT_DOTS } from './EmergencyMode';
import { KnowledgeIndex } from './knowledge';
import type { AssistantContext } from './respond';

const ctx: AssistantContext = { crewName: 'Maya Chen', sol: 43, oneWayDelayMinutes: 12, latest: null, assessment: null, history: [] };
const index = new KnowledgeIndex();

describe('Emergency Mode', () => {
  it('opens when the medical officer is needed, and sends the crew to the compartment', () => {
    const turn = converse('I’m bleeding badly in the galley', newDialogue(), ctx, index);
    expect(turn.action?.emergency).toMatchObject({ id: 'bleeding', label: 'Severe bleeding', room: 'Galley & Wardroom', stepStart: 1 });
    expect(turn.reply.text).toMatch(/^Tell your crew medical officer straight away\. Severe bleeding\. All crewmates to Galley & Wardroom\. Step 1:/);
  });

  it('opens without a compartment when none is said', () => {
    const turn = converse('my crewmate collapsed and is not breathing', newDialogue(), ctx, index);
    expect(turn.action?.emergency).toMatchObject({ id: 'cardiac-arrest' });
    expect((turn.action?.emergency as { room?: string }).room).toBeUndefined();
  });

  it('adds the compartment when it is said later, and keeps it for the next steps', () => {
    const first = converse('he is having a seizure', newDialogue(), ctx, index);
    const where = converse('we are in the airlock', first.state, ctx, index);
    expect(where.reply.text).toBe('All crewmates to Science & EVA Airlock.');
    expect(where.action?.emergency).toMatchObject({ room: 'Science & EVA Airlock' });
    const next = converse('next', where.state, ctx, index);
    expect(next.action?.emergency).toMatchObject({ room: 'Science & EVA Airlock', stepStart: 4 });
  });

  it('turns to safe mode when the crew stands down', () => {
    const first = converse('chest pain', newDialogue(), ctx, index);
    expect(converse('we’re safe', first.state, ctx, index).action?.emergency).toBe('safe');
  });

  it('is for medical emergencies only, not habitat alarms', () => {
    expect(converse('there is a fire', newDialogue(), ctx, index).action?.emergency).toBeUndefined();
  });

  it('cycles the dots in the requested order', () => {
    expect(CONTACT_DOTS).toEqual(['...', '.', '..']);
  });

  it.each([
    ['I collapsed on the flight deck', 'Flight Deck'],
    ['she fainted near the storm shelter', 'Central Storm Shelter'],
    ['he is in the habitat', 'Habitation Module'],
    ['I’m in a mess', undefined],
  ])('finds the compartment in “%s”', (text, room) => {
    expect(roomIn(text)).toBe(room);
  });
});

describe('Sol clicks any control', () => {
  const cognitive = ['Quick · 3 trials', 'Standard · 6 trials', 'Timed · 3 minutes', 'Start vigilance check', 'Scoring and NASA evidence', 'Words explained', 'Reset demo'].map((name) => ({ name }));
  const screen: ScreenControls = { find: (label) => bestMatch(label, cognitive) };

  it.each([
    ['start', 'Start vigilance check'],
    ['standard', 'Standard · 6 trials'],
    ['timed', 'Timed · 3 minutes'],
    ['scoring and nasa evidence', 'Scoring and NASA evidence'],
    ['words explained', 'Words explained'],
  ])('“%s” → %s', (said, name) => {
    expect(bestMatch(said, cognitive)?.name).toBe(name);
  });

  it('ignores weak matches', () => {
    expect(bestMatch('submit report', cognitive)).toBeNull();
    expect(matchScore('start', 'Restart')).toBe(0);
  });

  it.each([
    ['Click start button.', 'start', 'Clicking Start vigilance check.'],
    ['tap on the standard option', 'standard', 'Clicking Standard · 6 trials.'],
    ['can you press timed please', 'timed', 'Clicking Timed · 3 minutes.'],
    ['open scoring and NASA evidence', 'scoring and NASA evidence', 'Clicking Scoring and NASA evidence.'],
  ])('“%s” clicks it', (said, target, reply) => {
    const turn = converse(said, newDialogue(), ctx, index, '/cognitive', '', screen);
    expect(turn.action?.click).toBe(target);
    expect(turn.reply.text).toBe(reply);
  });

  it('says so when the control is not on screen', () => {
    const turn = converse('click submit report', newDialogue(), ctx, index, '/cognitive', '', screen);
    expect(turn.action).toBeUndefined();
    expect(turn.reply.text).toBe('I can’t find “submit report” on this screen.');
  });

  it('still opens tabs and radiation rooms the usual way', () => {
    expect(converse('open the timeline', newDialogue(), ctx, index, '/cognitive', '', screen).action).toMatchObject({ navigate: '/timeline' });
    expect(converse('tap on the galley', newDialogue(), ctx, index, '/cognitive', '', screen).action).toMatchObject({ radiationRoom: 'galley' });
  });
});
