import { describe, expect, it } from 'vitest';
import { HERO_SCENARIO } from '../../scenarios';
import { calculateCheckinStreak } from './streak';
import type { DailyCheckin } from '../../contracts';

function dummyCheckin(sol: number, provenance: 'synthetic_demo' | 'user_entered' = 'synthetic_demo'): DailyCheckin {
  return {
    id: `test-sol-${sol}`,
    astronautId: 'maya-chen',
    sol,
    submittedAtUtc: '2039-06-01T08:00:00.000Z',
    measurements: [
      {
        id: `test-sol-${sol}-hr`,
        astronautId: 'maya-chen',
        metric: 'heart_rate',
        value: 70,
        unit: 'bpm',
        observedAtUtc: '2039-06-01T08:00:00.000Z',
        provenance,
      },
    ],
    symptoms: [],
    note: '',
  };
}

describe('check-in streak calculation', () => {
  it('returns zero streak for empty history', () => {
    const streak = calculateCheckinStreak([]);
    expect(streak.count).toBe(0);
    expect(streak.syntheticCount).toBe(0);
    expect(streak.userEnteredCount).toBe(0);
    expect(streak.throughSol).toBeNull();
  });

  it('calculates full consecutive streak on hero scenario history', () => {
    const streak = calculateCheckinStreak(HERO_SCENARIO.history);
    expect(streak.count).toBe(42);
    expect(streak.syntheticCount).toBe(42);
    expect(streak.userEnteredCount).toBe(0);
    expect(streak.startSol).toBe(1);
    expect(streak.throughSol).toBe(42);
  });

  it('counts each sol once even if duplicate check-ins exist for that sol', () => {
    const withDuplicates = [
      ...HERO_SCENARIO.history,
      dummyCheckin(42, 'user_entered'), // duplicate for sol 42
    ];
    const streak = calculateCheckinStreak(withDuplicates);
    expect(streak.count).toBe(42);
    expect(streak.throughSol).toBe(42);
  });

  it('breaks the sequence at a missing sol', () => {
    // Sols 1, 2, 3, (missing 4), 5, 6
    const records = [
      dummyCheckin(1),
      dummyCheckin(2),
      dummyCheckin(3),
      dummyCheckin(5),
      dummyCheckin(6, 'user_entered'),
    ];

    const streak = calculateCheckinStreak(records);
    // Walking back from 6: Sol 6 (yes), Sol 5 (yes), Sol 4 (missing -> break)
    expect(streak.count).toBe(2);
    expect(streak.startSol).toBe(5);
    expect(streak.throughSol).toBe(6);
    expect(streak.userEnteredCount).toBe(1);
    expect(streak.syntheticCount).toBe(1);
  });

  it('accurately distinguishes user-entered from seeded synthetic contributions', () => {
    const records = [
      dummyCheckin(40, 'synthetic_demo'),
      dummyCheckin(41, 'synthetic_demo'),
      dummyCheckin(42, 'synthetic_demo'),
      dummyCheckin(43, 'user_entered'),
    ];

    const streak = calculateCheckinStreak(records);
    expect(streak.count).toBe(4);
    expect(streak.syntheticCount).toBe(3);
    expect(streak.userEnteredCount).toBe(1);
    expect(streak.startSol).toBe(40);
    expect(streak.throughSol).toBe(43);
  });
});
