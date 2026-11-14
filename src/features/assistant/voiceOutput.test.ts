import { describe, expect, it } from 'vitest';
import { speechChunks } from './voiceOutput';

describe('Sol speaks in quick pieces', () => {
  it('starts with a short clause so the first sound comes out sooner', () => {
    const chunks = speechChunks('Tell your crew medical officer straight away, and stay with them until help comes. Step 1: Press hard on the wound.');
    expect(chunks[0]).toBe('Tell your crew medical officer straight away,');
    expect(chunks[1]).toBe('and stay with them until help comes.');
    expect(chunks[2]).toBe('Step 1: Press hard on the wound.');
  });

  it('keeps short sentences whole', () => {
    expect(speechChunks('I’m listening. Go ahead.')).toEqual(['I’m listening.', 'Go ahead.']);
  });
});
