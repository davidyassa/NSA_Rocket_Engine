import { describe, expect, it } from 'vitest';
import { evaluatePvtTrials, type PvTrialResult } from './pvtEngine';

describe('NASA Brief Psychomotor Vigilance Task (PVT-B) Engine', () => {
  it('correctly assesses optimal cognitive performance with 0 lapses and fast reaction times', () => {
    const trials: PvTrialResult[] = [
      { trialIndex: 1, reactionTimeMs: 215, isFalseStart: false, isLapse: false, timestamp: 1 },
      { trialIndex: 2, reactionTimeMs: 228, isFalseStart: false, isLapse: false, timestamp: 2 },
      { trialIndex: 3, reactionTimeMs: 210, isFalseStart: false, isLapse: false, timestamp: 3 },
      { trialIndex: 4, reactionTimeMs: 235, isFalseStart: false, isLapse: false, timestamp: 4 },
      { trialIndex: 5, reactionTimeMs: 222, isFalseStart: false, isLapse: false, timestamp: 5 },
    ];

    const summary = evaluatePvtTrials(trials, 43, 220);
    expect(summary.sol).toBe(43);
    expect(summary.validTrials).toBe(5);
    expect(summary.lapsesCount).toBe(0);
    expect(summary.falseStartsCount).toBe(0);
    expect(summary.performanceTier).toBe('optimal');
    expect(summary.meanRtMs).toBeGreaterThan(210);
    expect(summary.meanRtMs).toBeLessThan(230);
    expect(summary.vigilanceScore).toBeGreaterThanOrEqual(90);
  });

  it('detects significant fatigue when lapses and substantial reaction-time prolongation occur', () => {
    const trials: PvTrialResult[] = [
      { trialIndex: 1, reactionTimeMs: 340, isFalseStart: false, isLapse: false, timestamp: 1 },
      { trialIndex: 2, reactionTimeMs: 560, isFalseStart: false, isLapse: true, timestamp: 2 },
      { trialIndex: 3, reactionTimeMs: 380, isFalseStart: false, isLapse: false, timestamp: 3 },
      { trialIndex: 4, reactionTimeMs: 620, isFalseStart: false, isLapse: true, timestamp: 4 },
      { trialIndex: 5, reactionTimeMs: 390, isFalseStart: false, isLapse: false, timestamp: 5 },
    ];

    const summary = evaluatePvtTrials(trials, 43, 220);
    expect(summary.validTrials).toBe(5);
    expect(summary.lapsesCount).toBe(2);
    expect(summary.performanceTier).toBe('significant_fatigue');
    expect(summary.clinicalInterpretation).toContain('cognitive lapse');
    expect(summary.vigilanceScore).toBeLessThan(70);
  });

  it('correctly tracks false starts and excludes them from valid reaction time averages', () => {
    const trials: PvTrialResult[] = [
      { trialIndex: 1, reactionTimeMs: 45, isFalseStart: true, isLapse: false, timestamp: 1 },
      { trialIndex: 2, reactionTimeMs: 230, isFalseStart: false, isLapse: false, timestamp: 2 },
      { trialIndex: 3, reactionTimeMs: 240, isFalseStart: false, isLapse: false, timestamp: 3 },
    ];

    const summary = evaluatePvtTrials(trials, 43, 220);
    expect(summary.totalTrials).toBe(3);
    expect(summary.validTrials).toBe(2);
    expect(summary.falseStartsCount).toBe(1);
    expect(summary.meanRtMs).toBe(235);
  });
});
