import { describe, expect, it } from 'vitest';
import { converse, newDialogue } from './dialogue';
import { EMERGENCIES } from './emergency';
import { KnowledgeIndex } from './knowledge';
import { PAGE_FIGURES } from './pageFigures';
import { PAGE_GUIDES } from './pageGuides';
import type { AssistantContext } from './respond';

const ctx: AssistantContext = { crewName: 'Maya Chen', sol: 43, oneWayDelayMinutes: 12, latest: null, assessment: null, history: [] };
const index = new KnowledgeIndex();
const say = (q: string, page = '/') => converse(q, newDialogue(), ctx, index, page);

describe('Sol answers what was asked', () => {
  it('treats a reported heart attack as an emergency, with no greeting filler', () => {
    const { reply } = say('Hey, so I’m experiencing very hard, heart palpitations and I think I’m having a heart attack.');
    expect(reply.kind).toBe('urgent');
    expect(reply.emergency).toBe('chest-pain');
    expect(reply.text).not.toMatch(/good to hear|Hi Maya/);
  });

  it('does not answer half a sentence with an unrelated article', () => {
    const { reply } = say('Hey, so I’m experiencing very hard');
    expect(reply.kind).not.toBe('answer');
    expect(reply.text).not.toMatch(/speaking pace/i);
  });

  it.each([
    ['I have heart palpitations', 'palpitations'],
    ['my heart is racing', 'palpitations'],
    ['I’m in danger', 'help'],
    ['something is wrong with me', 'help'],
  ])('“%s” → %s steps', (q, id) => {
    expect(say(q).reply.emergency).toBe(id);
  });
});

describe('emergency steps are exact', () => {
  const steps = (id: string) => EMERGENCIES.find((p) => p.id === id)!.steps.join(' ');
  it('gives counts for every exercise', () => {
    expect(steps('cardiac-arrest')).toMatch(/30 times.*100 to 120 a minute/);
    expect(steps('cardiac-arrest')).toMatch(/30 pushes, 2 breaths/);
    expect(steps('choking')).toMatch(/5 sharp back blows.*5 abdominal thrusts.*Repeat 5 blows and 5 thrusts/);
    expect(steps('breathing')).toMatch(/2 seconds.*4\. Repeat 10 times/);
    expect(steps('panic')).toMatch(/for 4, hold for 4, out .* for 6\. Repeat 5 times/);
    expect(steps('palpitations')).toMatch(/30 seconds and double it.*Repeat 10 times/);
    expect(steps('bleeding')).toMatch(/10 minutes without lifting/);
  });

  it('every reference to CPR says how', () => {
    for (const p of EMERGENCIES) for (const step of p.steps) {
      if (/\bCPR\b/.test(step)) expect(step, `${p.id}: ${step}`).toMatch(/30 pushes, 2 breaths/);
    }
  });

  it('has no filler', () => {
    for (const p of EMERGENCIES) for (const step of p.steps) {
      expect(step, p.id).not.toMatch(/\b(?:you are safe|don’t worry|it’s okay|I’m sorry|try to relax)\b/i);
      expect(step.length, step).toBeLessThan(180);
    }
  });
});

describe('Sol explains every tab and its numbers', () => {
  it('explains how to use any tab by name, briefly', () => {
    for (const guide of PAGE_GUIDES) {
      const { reply } = say(`How do I use the ${guide.aliases[0]}?`);
      expect(reply.text, guide.route).toMatch(/How to use it:/);
      expect(reply.text.length, guide.route).toBeLessThan(420);
    }
  });

  it('explains the numbers on a tab', () => {
    expect(say('Explain the numbers on this page', '/hazards/radiation').reply.text).toMatch(/Dose rate: .*0\.15.*2\.1/);
    expect(say('What do these numbers mean?', '/cognitive').reply.text).toMatch(/Mean reaction time.*Attention lapses.*False starts/);
  });

  it.each([
    ['/hazards/radiation', 'What does the 30-day dose mean?', /250/],
    ['/hazards/radiation', 'What is the career limit?', /600/],
    ['/hazards/radiation', 'What does restricted mean?', /2\.1 per hour/],
    ['/cognitive', 'What are lapses?', /500 ms/],
    ['/timeline', 'What does the CO2 number mean?', /limit 3/],
    ['/', 'What does orange mean?', /solar particle event/],
    ['/hazards/distance', 'What does the delay mean?', /twice/],
  ])('on %s, “%s”', (page, q, expected) => {
    expect(say(q, page).reply.text).toMatch(expected);
  });

  it('keeps every explanation short', () => {
    for (const [route, figures] of Object.entries(PAGE_FIGURES)) for (const f of figures) expect(f.means.length, `${route} ${f.name}`).toBeLessThan(130);
  });

  it('still gives your own reading for “my …” questions', () => {
    expect(say('What is my heart rate?').reply.kind).toBe('personal');
  });
});

describe('Sol controls the screen', () => {
  it.each([
    ['scroll down', { scroll: 'down' }],
    ['can you scroll up please', { scroll: 'up' }],
    ['Sol, scroll to the bottom', { scroll: 'bottom' }],
    ['scroll down 5 lines', { scrollLines: 5 }],
    ['scroll to the career dose', { scrollTo: 'career dose' }],
  ])('“%s”', (q, action) => {
    expect(say(q).action).toMatchObject(action);
  });

  it.each([
    ['tap on the galley', 'galley'],
    ['click the storm shelter', 'storm-shelter'],
    ['can you open the airlock', 'airlock'],
    ['select the flight deck', 'flight-deck'],
    ['press on the equipment bay', 'equipment-bay'],
  ])('“%s” selects that room on the radiation map', (q, room) => {
    const elsewhere = say(q, '/');
    expect(elsewhere.action).toMatchObject({ radiationRoom: room, navigate: '/hazards/radiation' });
    expect(say(q, '/hazards/radiation').action).toMatchObject({ radiationRoom: room, navigate: undefined });
  });
});
