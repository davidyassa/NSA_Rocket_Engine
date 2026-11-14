import { describe, expect, it } from 'vitest';
import { EMERGENCIES, STEPS_PER_TURN, emergencyTurn, isEmergencyCall, matchEmergency } from './emergency';
import { converse, newDialogue } from './dialogue';
import { KnowledgeIndex } from './knowledge';
import type { AssistantContext } from './respond';
import { URGENT_CREW, URGENT_HABITAT } from './urgentSpeech';

const ctx: AssistantContext = { crewName: 'Alex Rivera', sol: 43, oneWayDelayMinutes: 12, latest: null, assessment: null, history: [] };
const index = new KnowledgeIndex();

describe('emergency detection', () => {
  const cases: [string, string][] = [
    ['He is not breathing!', 'cardiac-arrest'],
    ['my crewmate collapsed and is unresponsive', 'cardiac-arrest'],
    ['how do I do CPR', 'cardiac-arrest'],
    ['she is choking', 'choking'],
    ['I cut my hand and it is bleeding a lot', 'bleeding'],
    ['there is blood everywhere', 'bleeding'],
    ['I have chest pain', 'chest-pain'],
    ['my chest feels tight', 'chest-pain'],
    ['his face is drooping and his speech is slurred', 'stroke'],
    ['she is having a seizure', 'seizure'],
    ['my throat is swelling', 'allergy'],
    ['I can’t breathe', 'breathing'],
    ['I burned my hand on the heater', 'burn'],
    ['chemical in my eye', 'eye'],
    ['he got an electric shock', 'electric-shock'],
    ['I hit my head on the hatch', 'head-injury'],
    ['I think I broke my wrist', 'fracture'],
    ['she fainted', 'faint'],
    ['I’m having a panic attack', 'panic'],
    ['I smell smoke', 'fire'],
    ['there is a fire in the galley', 'fire'],
    ['cabin pressure is dropping', 'pressure'],
    ['ammonia leak', 'toxic'],
    ['oxygen is low in the room', 'air'],
    ['solar flare alert', 'radiation'],
    ['water in my helmet', 'eva'],
    ['we lost power', 'power'],
    ['the master alarm is going off', 'alarm'],
    ['emergency', 'help'],
    ['help help', 'help'],
    ['my nose is bleeding', 'nosebleed'],
    ['there is a piece of metal stuck in his leg', 'impaled'],
    ['he is trapped under the rack', 'crush'],
    ['she hurt her neck and can’t feel her legs', 'spinal'],
    ['I’m having an asthma attack', 'asthma'],
    ['my knee pain after the EVA is getting worse', 'decompression'],
    ['he is pale, cold and clammy', 'shock'],
    ['my blood sugar is low', 'low-sugar'],
    ['I think it’s heat exhaustion', 'heat'],
    ['I can’t stop shivering', 'hypothermia'],
    ['he swallowed some cleaner', 'poison'],
    ['I knocked my tooth out', 'tooth'],
    ['I twisted my ankle', 'sprain'],
    ['I cut my finger', 'minor-cut'],
    ['I can’t stop vomiting', 'vomiting'],
    ['Help me!', 'help'],
    ['someone is hurt', 'help'],
  ];
  it.each(cases)('“%s” → %s', (said, id) => {
    expect(matchEmergency(said)?.id).toBe(id);
  });

  it('does not treat questions about a topic as emergencies', () => {
    for (const q of ['I need help with the check-in', 'help me find the timeline', 'What is a solar flare?', 'Why does smoke matter on a spacecraft?', 'What is CPR?', 'Fire up the console', 'How am I doing today?', 'Why does CO2 cause headaches?']) {
      expect(matchEmergency(q), q).toBeNull();
    }
  });

  it('wakes Sol without “Hey Sol” only for clear emergencies', () => {
    expect(isEmergencyCall('there is a fire')).toBe(true);
    expect(isEmergencyCall('he is not breathing')).toBe(true);
    expect(isEmergencyCall('the alarm clock is set')).toBe(false);
    expect(isEmergencyCall('what time is it')).toBe(false);
  });
});

describe('emergency replies', () => {
  it('opens with the pre-recorded alert and numbers the steps', () => {
    const fire = emergencyTurn(EMERGENCIES.find((p) => p.id === 'fire')!);
    expect(fire.text.startsWith(URGENT_HABITAT)).toBe(true);
    expect(fire.text).toMatch(/Step 1: .* Step 2: .* Step 3: /);
    expect(fire.steps).toHaveLength(STEPS_PER_TURN);
    const bleed = emergencyTurn(EMERGENCIES.find((p) => p.id === 'bleeding')!);
    expect(bleed.text.startsWith(URGENT_CREW)).toBe(true);
    expect(bleed.steps[0]).toMatch(/^Press hard on the wound/);
  });

  it('never names or doses a medicine', () => {
    for (const protocol of EMERGENCIES) {
      for (const step of protocol.steps) {
        expect(step).not.toMatch(/\b(?:mg|milligram|tablet|pill|capsule|dose|aspirin|epinephrine|adrenaline|ibuprofen|paracetamol|nitroglycerin|inhaler|injection)\b/i);
      }
    }
  });

  it('keeps every step short enough to speak quickly', () => {
    for (const protocol of EMERGENCIES) for (const step of protocol.steps) expect(step.length, step).toBeLessThan(230);
  });
});

describe('emergency conversation', () => {
  it('walks through the steps with “next”, “repeat” and stands down when safe', () => {
    let turn = converse('Hey Sol, he is not breathing', newDialogue(), ctx, index);
    expect(turn.reply.kind).toBe('urgent');
    expect(turn.reply.stepStart).toBe(1);
    expect(turn.reply.text).toMatch(/Say “next”/);

    turn = converse('okay next', turn.state, ctx, index);
    expect(turn.reply.stepStart).toBe(STEPS_PER_TURN + 1);
    expect(turn.reply.text.startsWith(URGENT_CREW)).toBe(false);

    turn = converse('repeat', turn.state, ctx, index);
    expect(turn.reply.stepStart).toBe(STEPS_PER_TURN + 1);

    turn = converse('what now?', turn.state, ctx, index);
    expect(turn.reply.stepStart).toBe(2 * STEPS_PER_TURN + 1);

    turn = converse('next', turn.state, ctx, index);
    expect(turn.reply.text).toMatch(/last step/);

    turn = converse("he's breathing again", turn.state, ctx, index);
    expect(turn.reply.kind).toBe('help');
    expect(turn.state.emergency).toBeNull();
  });

  it('switches protocol when a new emergency is reported mid-way', () => {
    const first = converse('I smell smoke', newDialogue(), ctx, index);
    const second = converse('someone is bleeding badly', first.state, ctx, index);
    expect(second.reply.emergency).toBe('bleeding');
  });

  it('asks what is happening for a bare call for help, then gives the right steps', () => {
    const triage = converse('Emergency!', newDialogue(), ctx, index);
    expect(triage.reply.kind).toBe('urgent');
    expect(triage.reply.text).toMatch(/what is happening/i);
    expect(converse('fire', triage.state, ctx, index).reply.emergency).toBe('fire');
  });

  it('still declines medicine questions during an emergency', () => {
    const first = converse('I have chest pain', newDialogue(), ctx, index);
    const med = converse('Should I take an aspirin?', first.state, ctx, index);
    expect(med.reply.kind).toBe('declined');
  });
});

describe('first aid for common cases', () => {
  const ctxFA: AssistantContext = { crewName: 'Alex Rivera', sol: 43, oneWayDelayMinutes: 12, latest: null, assessment: null, history: [] };
  it('opens Emergency Mode only when the medical officer is needed now', () => {
    expect(converse('he swallowed some cleaner', newDialogue(), ctxFA, index).action?.emergency).toMatchObject({ id: 'poison' });
    for (const minor of ['my nose is bleeding', 'I twisted my ankle', 'I cut my finger', 'I can’t stop vomiting']) {
      const turn = converse(minor, newDialogue(), ctxFA, index);
      expect(turn.reply.kind, minor).toBe('urgent');
      expect(turn.reply.steps?.length, minor).toBeGreaterThan(0);
      expect(turn.action?.emergency, minor).toBeUndefined();
    }
  });

  it('gives the standard counts and times', () => {
    const steps = (id: string) => EMERGENCIES.find((p) => p.id === id)!.steps.join(' ');
    expect(steps('nosebleed')).toMatch(/lean slightly forward.*10 minutes/);
    expect(steps('sprain')).toMatch(/20 minutes, every 2 to 3 hours/);
    expect(steps('low-sugar')).toMatch(/Wait 15 minutes/);
    expect(steps('poison')).toMatch(/^Do not make them vomit/);
    expect(steps('impaled')).toMatch(/^Do not pull the object out/);
    expect(steps('spinal')).toMatch(/^Do not move them/);
  });

  it('does not treat machines or feelings as medical emergencies', () => {
    expect(matchEmergency('the laptop is overheating')).toBeNull();
    expect(matchEmergency('I’m in shock about the news')).toBeNull();
  });
});
