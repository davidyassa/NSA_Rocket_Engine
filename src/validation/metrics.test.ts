import { describe, expect, it } from 'vitest';
import {
  averageRanks,
  buildValidationReport,
  CONCORDANCE_TOLERANCE_BPM,
  LOA_Z,
  mean,
  pairReadings,
  pearson,
  rocAuc,
  sampleSd,
  summarizeAgreement,
  youdenThreshold,
} from './metrics';

// Hand-checked fixture: errors are +2, -2, +4 bpm.
const PAIRS = [
  { estimate: 62, reference: 60 },
  { estimate: 68, reference: 70 },
  { estimate: 84, reference: 80 },
];

describe('paired reading assembly', () => {
  it('keeps finite pairs in order', () => {
    const { pairs, excluded } = pairReadings(PAIRS);
    expect(pairs).toEqual(PAIRS);
    expect(excluded).toEqual([]);
  });

  it('excludes an unpaired reference instead of inventing a value', () => {
    const { pairs, excluded } = pairReadings([
      ...PAIRS,
      { estimate: 71, reference: null },
      { estimate: 71, reference: undefined },
      { estimate: 71, reference: '72' },
      { estimate: 71, reference: Number.NaN },
    ]);
    expect(pairs).toHaveLength(3);
    expect(excluded).toHaveLength(4);
    expect(excluded.every(({ reason }) => reason.includes('reference'))).toBe(true);
  });

  it('excludes a missing estimate and reports which row failed', () => {
    const { pairs, excluded } = pairReadings([{ estimate: null, reference: 60 }]);
    expect(pairs).toEqual([]);
    expect(excluded[0].reason).toContain('row 0');
    expect(excluded[0].reason).toContain('estimate');
  });
});

describe('agreement statistics', () => {
  it('matches hand-computed bias, MAE and RMSE', () => {
    const summary = summarizeAgreement(PAIRS);
    // errors: 2, -2, 4
    expect(summary.bias).toBeCloseTo(4 / 3, 10);
    expect(summary.mae).toBeCloseTo(8 / 3, 10);
    expect(summary.rmse).toBeCloseTo(Math.sqrt(8), 10);
    expect(summary.n).toBe(3);
  });

  it('matches hand-computed sample SD and 95% limits of agreement', () => {
    const summary = summarizeAgreement(PAIRS);
    // deviations from bias 4/3: 2/3, -10/3, 8/3; squares sum 168/9; /(n-1)=2 -> 28/3
    const sd = Math.sqrt(28 / 3);
    expect(summary.sd).toBeCloseTo(sd, 10);
    expect(summary.lowerLoa).toBeCloseTo(4 / 3 - LOA_Z * sd, 10);
    expect(summary.upperLoa).toBeCloseTo(4 / 3 + LOA_Z * sd, 10);
    expect(LOA_Z).toBe(1.96);
  });

  it('counts concordance at exactly the tolerance boundary', () => {
    const summary = summarizeAgreement([
      { estimate: 70, reference: 60 }, // +10, at the boundary -> concordant
      { estimate: 50, reference: 60 }, // -10, at the boundary -> concordant
      { estimate: 71, reference: 60 }, // +11 -> discordant
    ]);
    expect(summary.concordanceRate).toBeCloseTo(2 / 3, 10);
    expect(CONCORDANCE_TOLERANCE_BPM).toBe(10);
  });

  it('reports zero SD for a single pair and refuses an empty sample', () => {
    expect(summarizeAgreement([{ estimate: 70, reference: 72 }]).sd).toBe(0);
    expect(() => summarizeAgreement([])).toThrow();
  });

  it('computes mean and sample SD with the n - 1 denominator', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(sampleSd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
    expect(() => sampleSd([1])).toThrow();
  });
});

describe('pearson correlation', () => {
  it('returns 1 for a positive linear series', () => {
    expect(pearson([
      { estimate: 1, reference: 2 },
      { estimate: 2, reference: 4 },
      { estimate: 3, reference: 6 },
      { estimate: 4, reference: 8 },
    ])).toBeCloseTo(1, 12);
  });

  it('returns 0 for an uncorrelated symmetric series', () => {
    expect(pearson([
      { estimate: 1, reference: 2 },
      { estimate: 2, reference: 1 },
      { estimate: 3, reference: 2 },
    ])).toBeCloseTo(0, 12);
  });

  it('returns the hand-computed coefficient for the fixture', () => {
    // r = 220 / sqrt(258.666... * 200)
    expect(pearson(PAIRS)).toBeCloseTo(220 / Math.sqrt((776 / 3) * 200), 10);
  });

  it('returns null when a series is constant and for a single pair', () => {
    expect(pearson([
      { estimate: 70, reference: 60 },
      { estimate: 70, reference: 70 },
    ])).toBeNull();
    expect(pearson([{ estimate: 70, reference: 60 }])).toBeNull();
  });
});

describe('average ranks', () => {
  it('assigns the mean rank to ties', () => {
    expect(averageRanks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(averageRanks([5, 5, 5])).toEqual([2, 2, 2]);
    expect(averageRanks([3, 1, 2])).toEqual([3, 1, 2]);
  });
});

describe('ROC AUC', () => {
  it('computes the hand-checked value for a separable ranking', () => {
    // positives score 0.9 and 0.4; negatives 0.8 and 0.3 -> U = 3 of 4 pairs
    expect(rocAuc([0.9, 0.8, 0.4, 0.3], [true, false, true, false])).toBeCloseTo(0.75, 12);
  });

  it('scores a tied positive/negative pair as one half', () => {
    expect(rocAuc([0.5, 0.5], [true, false])).toBeCloseTo(0.5, 12);
  });

  it('returns 1 for perfect separation and 0 for complete inversion', () => {
    expect(rocAuc([3, 2, 1], [true, true, false])).toBeCloseTo(1, 12);
    expect(rocAuc([1, 2, 3], [true, true, false])).toBeCloseTo(0, 12);
  });

  it('returns null when only one class is present', () => {
    expect(rocAuc([0.9, 0.8], [true, true])).toBeNull();
    expect(rocAuc([0.9, 0.8], [false, false])).toBeNull();
  });
});

describe('youden threshold search', () => {
  it('finds a separating quality threshold on hand-checked scans', () => {
    // inaccurate at SQI 0.4 and 0.6; accurate at 0.7 and 0.9
    const gate = youdenThreshold([
      { sqi: 0.4, absoluteError: 18 },
      { sqi: 0.6, absoluteError: 14 },
      { sqi: 0.7, absoluteError: 3 },
      { sqi: 0.9, absoluteError: 1 },
    ]);
    expect(gate).toMatchObject({ sensitivity: 1, specificity: 1, j: 1, trueAccept: 2, trueReject: 2 });
    expect(gate?.threshold).toBeCloseTo(0.65, 12);
    expect(gate?.minAcceptedSqi).toBe(0.7);
  });

  it('reports the trade-off when quality does not separate the classes', () => {
    // One accurate scan sits below the inaccurate one.
    const gate = youdenThreshold([
      { sqi: 0.8, absoluteError: 20 },
      { sqi: 0.6, absoluteError: 2 },
      { sqi: 0.9, absoluteError: 1 },
    ]);
    expect(gate?.j).toBeCloseTo(0.5, 12);
    expect(gate?.sensitivity).toBe(1);
    expect(gate?.specificity).toBeCloseTo(0.5, 12);
    expect(gate?.falseReject).toBe(1);
  });

  it('breaks a J tie toward the stricter threshold', () => {
    // Perfect separation but every operating point scores J = 1 is impossible;
    // here J = 0 at both extremes, so the stricter threshold must win.
    const gate = youdenThreshold([
      { sqi: 0.4, absoluteError: 0 },
      { sqi: 0.9, absoluteError: 0 },
    ]);
    expect(gate).toBeNull();
    const boundary = youdenThreshold([
      { sqi: 0.4, absoluteError: 0 },
      { sqi: 0.9, absoluteError: 0 },
      { sqi: 0.95, absoluteError: 30 },
    ]);
    expect(boundary?.threshold).toBeGreaterThan(0.75);
  });

  it('returns null when either class is empty or quality is missing', () => {
    expect(youdenThreshold([{ sqi: 0.9, absoluteError: 1 }])).toBeNull();
    expect(youdenThreshold([
      { sqi: Number.NaN, absoluteError: 1 },
      { sqi: 0.9, absoluteError: 40 },
    ])).toBeNull();
  });
});

describe('validation report assembly', () => {
  it('reports zero pairs without fabricating a summary', () => {
    const report = buildValidationReport([]);
    expect(report?.n).toBe(0);
    expect(report?.correlation).toBeNull();
    expect(report?.gate).toBeNull();
    expect(report?.agreement.bias).toBe(0);
  });

  it('counts unpaired scans and still summarizes the paired subset', () => {
    const report = buildValidationReport([
      { estimate: 62, reference: 60, sqi: 0.8 },
      { estimate: 68, reference: null, sqi: 0.8 },
      { estimate: 84, reference: 80, sqi: 0.5 },
    ]);
    expect(report?.n).toBe(2);
    expect(report?.excluded).toBe(1);
    expect(report?.agreement.bias).toBeCloseTo(3, 12);
  });

  it('orients the quality AUC so low SQI predicts inaccuracy', () => {
    const report = buildValidationReport([
      { estimate: 80, reference: 60, sqi: 0.4 }, // inaccurate
      { estimate: 61, reference: 60, sqi: 0.9 }, // accurate
      { estimate: 85, reference: 70, sqi: 0.5 }, // inaccurate
      { estimate: 71, reference: 70, sqi: 0.85 }, // accurate
    ]);
    expect(report?.qualityAuc).toBeCloseTo(1, 12);
  });

  it('pairs SQI with the right row after an excluded row is skipped', () => {
    const report = buildValidationReport([
      { estimate: 100, reference: 60, sqi: 0.99 },
      { estimate: 61, reference: null, sqi: 0.1 },
      { estimate: 81, reference: 60, sqi: 0.2 },
    ]);
    // The two retained rows have SQI 0.99 (inaccurate) and 0.2 (inaccurate),
    // so no accurate class exists and the AUC must be null rather than 0.5.
    expect(report?.n).toBe(2);
    expect(report?.qualityAuc).toBeNull();
  });
});
