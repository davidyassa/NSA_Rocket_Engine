import { describe, expect, it } from 'vitest';
import {
  METRIC_IDS,
  METRICS,
  riskAssessmentSchema,
  ruleDefinitionSchema,
  type DailyCheckin,
  type MetricId,
} from '../contracts';
import { evaluateCheckin, metricBaseline, RULES, validateCheckinMeasurements } from './index';

function checkin(
  sol: number,
  values: Partial<Record<MetricId, number>>,
  { astronautId = 'crew-1', revision = 0, fatigue = false, chestDiscomfort = false } = {},
): DailyCheckin {
  const submittedAtUtc = new Date(Date.UTC(2039, 0, sol, 10, revision)).toISOString();
  const id = `${astronautId}:${sol}:${revision}`;
  return {
    id,
    sol,
    astronautId,
    submittedAtUtc,
    measurements: METRIC_IDS.flatMap((metric) => {
      const value = values[metric];
      return value === undefined ? [] : [{
        id: `${id}:${metric}`,
        astronautId,
        metric,
        value,
        unit: METRICS[metric].unit,
        observedAtUtc: submittedAtUtc,
        provenance: 'synthetic_demo',
      }];
    }),
    symptoms: [
      { id: 'fatigue', label: 'Fatigue', present: fatigue },
      { id: 'chest_discomfort', label: 'Chest discomfort', present: chestDiscomfort },
    ],
    note: '',
  };
}

describe('personal baselines', () => {
  it('uses the preceding 14 sols for this astronaut and counts each sol once', () => {
    const current = checkin(43, { sleep_duration: 4 });
    const revision = checkin(29, { sleep_duration: 7 }, { revision: 1 });
    const history = [
      checkin(28, { sleep_duration: 1 }),
      checkin(29, { sleep_duration: 20 }),
      revision,
      checkin(30, { sleep_duration: 5 }),
      checkin(31, { sleep_duration: 10 }),
      checkin(32, { sleep_duration: 8 }),
      checkin(42, { sleep_duration: 9 }),
      checkin(40, { sleep_duration: 15 }, { astronautId: 'crew-2' }),
      checkin(43, { sleep_duration: 18 }),
      checkin(44, { sleep_duration: 19 }),
    ];

    const baseline = metricBaseline('sleep_duration', current, history);
    expect(baseline).toMatchObject({ median: 8, count: 5, lookbackSols: 14 });
    expect(baseline?.mad).toBeDefined();
    expect(baseline?.inputMeasurementIds).toHaveLength(5);
    expect(baseline?.inputMeasurementIds[0]).toBe(revision.measurements[0].id);
    expect(metricBaseline('sleep_duration', current, [...history].reverse())).toEqual(baseline);
  });

  it('calculates robust median absolute deviation (MAD) spread', () => {
    const current = checkin(10, { heart_rate: 70 });
    // Readings: 60, 62, 70, 78, 80 -> median = 70.
    // Absolute deviations from 70: |60-70|=10, |62-70|=8, |70-70|=0, |78-70|=8, |80-70|=10 -> [0, 8, 8, 10, 10] -> median deviation (MAD) = 8
    const history = [60, 62, 70, 78, 80].map((val, idx) => checkin(idx + 1, { heart_rate: val }));
    const baseline = metricBaseline('heart_rate', current, history);
    expect(baseline?.median).toBe(70);
    expect(baseline?.mad).toBe(8);
  });

  it('requires at least five measured sols and averages the middle pair for an even count', () => {
    const current = checkin(10, { heart_rate: 68 });
    const history = [62, 64, 67, 70, 78, 82].map((value, index) => checkin(index + 1, { heart_rate: value }));
    expect(metricBaseline('heart_rate', current, history.slice(0, 4))).toBeNull();
    expect(metricBaseline('heart_rate', current, history)?.median).toBe(68.5);
  });
});

describe('explainable assessment', () => {
  it('shows the Sol 43 lower-trend inputs and recommends Crew Medical Officer review', () => {
    const lowSols = new Set([39, 41, 42]);
    const history = Array.from({ length: 42 }, (_, index) => {
      const sol = index + 1;
      return checkin(sol, { sleep_duration: lowSols.has(sol) ? 5 : 7.5, mood: lowSols.has(sol) ? 2 : 4 });
    });
    const current = checkin(43, { sleep_duration: 4.5, mood: 2 }, { fatigue: true });
    const assessment = evaluateCheckin(current, history);
    const sleep = assessment.findings.find((item) => item.ruleId === 'sustained-trend' && item.baselineUsed[0]?.metric === 'sleep_duration');

    expect(assessment.recommendedTier).toBe('crew_medical_officer');
    expect(assessment.overallState).toBe('escalation_recommended');
    expect(assessment.domainStatuses).toMatchObject({ sleep: 'sustained_trend', behavioral: 'sustained_trend' });
    expect(assessment.actionCardIds).toContain('crew-review');
    expect(sleep?.summary).toContain('4 of the last 5 sols');
    expect(sleep?.baselineUsed[0]).toMatchObject({ median: 7.5, count: 14 });
    expect(sleep?.inputMeasurementIds).toEqual([39, 40, 41, 42, 43].map((sol) => `crew-1:${sol}:0:sleep_duration`));
    expect(sleep?.sourceRefs).toContain('demo-method');
    expect(sleep?.reviewStatus).toBe('demo_heuristic');
    expect(riskAssessmentSchema.safeParse(assessment).success).toBe(true);
    expect(evaluateCheckin(current, [...history].reverse())).toEqual(assessment);

    const context = {
      events: [{ id: 'shelter', kind: 'shelter_protocol' as const, startSol: 41, endSol: 42,
        label: 'Shelter protocol', provenance: 'synthetic_demo' as const }],
      archiveEvent: { sol: 41, date: '2017-09-11' },
    };
    const withContext = evaluateCheckin(current, history, context);
    expect(withContext.findings).toContainEqual(expect.objectContaining({
      kind: 'contextual_association', ruleId: 'archive-replay-context',
    }));
    expect(withContext.recommendedTier).toBe(assessment.recommendedTier);
    expect(withContext.actionCardIds).toEqual(assessment.actionCardIds);
    expect(evaluateCheckin(current, history, { ...context, archiveEvent: { sol: 38, date: '2017-09-11' } }))
      .toEqual(assessment);
  });

  it('counts mission sols without reaching farther back to replace missing readings', () => {
    const current = checkin(43, { sleep_duration: 5 });
    const history = [30, 31, 32, 33, 34, 35, 36, 37].map((sol) => checkin(sol, { sleep_duration: 8 }));
    history.push(checkin(38, { sleep_duration: 5 }), checkin(39, { sleep_duration: 5 }));

    const assessment = evaluateCheckin(current, history);
    expect(assessment.domainStatuses.sleep).toBe('change_from_baseline');
    expect(assessment.findings.some((item) => item.ruleId === 'sustained-trend')).toBe(false);
    expect(assessment.recommendedTier).toBe('self_care');
  });

  it('distinguishes skipped measurements from measured values without a baseline', () => {
    const assessment = evaluateCheckin(checkin(43, { mood: 4 }), []);
    expect(assessment.domainStatuses).toMatchObject({ sleep: 'not_measured', behavioral: 'baseline_not_established' });
    expect(assessment.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'data_unavailable', summary: 'Sleep duration was not measured.', inputMeasurementIds: [] }),
      expect.objectContaining({ kind: 'data_unavailable', summary: expect.stringContaining('Mood baseline not established'), inputMeasurementIds: ['crew-1:43:0:mood'] }),
    ]));
  });

  it('shows a generic change at a decimal demo delta with no escalation', () => {
    const history = [35, 36, 37, 38, 39].map((sol) => checkin(sol, { body_temp: 37 }));
    const assessment = evaluateCheckin(checkin(43, { body_temp: 37.4 }), history);

    expect(assessment.domainStatuses.temperature).toBe('change_from_baseline');
    expect(assessment.findings).toContainEqual(expect.objectContaining({ kind: 'observation', ruleId: 'baseline-change', reviewStatus: 'demo_heuristic' }));
    expect(assessment.recommendedTier).toBe('self_care');
  });

  it('excludes a reversed blood pressure pair and explains the entry problem', () => {
    const current = checkin(43, { bp_systolic: 76, bp_diastolic: 118 });
    const assessment = evaluateCheckin(current, []);

    expect(assessment.domainStatuses.cardiovascular).toBe('check_entry');
    expect(assessment.overallState).toBe('remeasurement_recommended');
    expect(assessment.dataQualityWarnings).toEqual(['Systolic blood pressure must be greater than diastolic.']);
    expect(validateCheckinMeasurements(current)).toEqual(assessment.dataQualityWarnings);
    expect(assessment.findings[0]).toMatchObject({
      kind: 'data_quality',
      ruleId: 'entry-quality',
      inputMeasurementIds: current.measurements.map(({ id }) => id),
    });
    expect(assessment.actionCardIds).toContain('recheck-entry');
  });

  it('reports repeated symptom records without escalating the demo tier', () => {
    const history = [39, 41].map((sol) => checkin(sol, {}, { fatigue: true }));
    const assessment = evaluateCheckin(checkin(43, {}, { fatigue: true }), history);

    expect(assessment.domainStatuses.symptoms).toBe('sustained_trend');
    expect(assessment.findings).toContainEqual(expect.objectContaining({
      ruleId: 'reported-symptoms',
      kind: 'trend',
      summary: 'Fatigue was reported on 3 of the last 5 sols.',
    }));
    expect(assessment.recommendedTier).toBe('self_care');
  });

  it('escalates concerning symptoms even when another reading needs correction', () => {
    const current = checkin(43, {
      heart_rate: 68,
      bp_systolic: 76,
      bp_diastolic: 118,
    }, { chestDiscomfort: true });
    const assessment = evaluateCheckin(current, []);

    expect(assessment.overallState).toBe('escalation_recommended');
    expect(assessment.recommendedTier).toBe('crew_medical_officer');
    expect(assessment.dataQualityWarnings).toHaveLength(1);
    expect(assessment.findings[0]).toMatchObject({
      ruleId: 'urgent-symptoms',
      reviewStatus: 'needs_clinical_review',
    });
    expect(assessment.actionCardIds).toContain('crew-review');
  });

  it('excludes rejected or superseded readings from current assessments and baselines', () => {
    const current = checkin(43, { heart_rate: 74 });
    current.measurements[0].status = 'rejected_low_quality';
    current.measurements[0].signalQuality = 0.2;
    const history = [60, 62, 70, 78, 80].map((value, index) => checkin(index + 1, { heart_rate: value }));
    history[0].measurements[0].status = 'corrected';

    const assessment = evaluateCheckin(current, history);
    expect(assessment.overallState).toBe('remeasurement_recommended');
    expect(assessment.dataQualityWarnings[0]).toContain('signal quality was insufficient');
    expect(assessment.domainStatuses.cardiovascular).toBe('check_entry');
    expect(metricBaseline('heart_rate', current, history)).toBeNull();
  });

  it('publishes a valid reviewable rule definition for each rule', () => {
    expect(Object.keys(RULES).length).toBeLessThanOrEqual(16);
    for (const [ruleId, rule] of Object.entries(RULES)) {
      expect(rule.ruleId).toBe(ruleId);
      expect(ruleDefinitionSchema.safeParse(rule).success).toBe(true);
      expect(rule.sourceRefs).not.toHaveLength(0);
    }
  });
});
