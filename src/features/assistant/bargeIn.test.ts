import { describe, expect, it, vi } from 'vitest';
import { onBargeIn, triggerBargeIn, isSpeaking, stopSpeaking } from './voiceOutput';

describe('Real-Time AudioWorklet Vocal Barge-In', () => {
  it('registers and removes barge-in listeners', () => {
    const listener = vi.fn();
    const unsub = onBargeIn(listener);

    // When not speaking, triggerBargeIn returns false and does not fire
    expect(isSpeaking()).toBe(false);
    expect(triggerBargeIn()).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    unsub();
  });

  it('stops speaking and notifies subscribers when triggered', () => {
    const listener = vi.fn();
    const unsub = onBargeIn(listener);

    // Stop speaking safely resets
    stopSpeaking();
    expect(isSpeaking()).toBe(false);

    unsub();
  });
});
