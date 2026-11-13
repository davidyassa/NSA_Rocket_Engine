import { describe, expect, it } from 'vitest';
import { summarizeVigilance } from './pvtEngine';
import { vigilanceBaseline, vigilanceSessionSchema, type VigilanceSession } from './vigilance';

describe('Vigilance results', () => {
  it('applies the selected lapse threshold and excludes missed and early responses from the mean', () => {
    const trials = [354, 355, 499, 500, 'early', 'missed'] as const;
    const timed = summarizeVigilance(trials, 'timed', 43);
    const standard = summarizeVigilance(trials, 'standard', 43);

    expect(vigilanceSessionSchema.parse(timed)).toMatchObject({
      sol: 43, meanRtMs: 427, lapsesCount: 4, validTrials: 4, totalTrials: 6, missedCount: 1, falseStartsCount: 1,
    });
    expect(standard?.lapsesCount).toBe(2);
    expect(summarizeVigilance(['early', 'missed'], 'quick', 43)).toBeNull();
  });

  it('compares the latest usable session on each distinct prior sol in the same mode', () => {
    const current = summarizeVigilance([250, 500, 250], 'quick', 45)!;
    const session = (sol: number, meanRtMs: number, extra: Partial<VigilanceSession> = {}) => ({
      ...current, sol, meanRtMs, ...extra,
    });
    const prior = [
      session(30, 900),
      session(41, 220),
      session(42, 400, { mode: 'timed' }),
      session(43, 260, { completedAt: '2026-11-13T08:00:00.000Z' }),
      session(43, 240, { completedAt: '2026-11-13T09:00:00.000Z' }),
      session(45, 700),
    ];

    expect(vigilanceBaseline(prior, current)).toBeNull();
    expect(vigilanceBaseline([...prior, session(44, 280, { lapsesCount: 2 })], current))
      .toEqual({ meanRtMs: 240, lapsesCount: 1, count: 3 });
  });

  it('summarizes quick 3-trial session with reaction times and false starts correctly', () => {
    const trials = ['early', 240, 260, 250] as const;
    const session = summarizeVigilance(trials, 'quick', 43);
    expect(session).not.toBeNull();
    expect(session?.validTrials).toBe(3);
    expect(session?.falseStartsCount).toBe(1);
    expect(session?.totalTrials).toBe(4);
    expect(session?.meanRtMs).toBe(250);
    expect(session?.lapsesCount).toBe(0);
    expect(vigilanceSessionSchema.parse(session)).toBeDefined();
  });
});
