import { describe, expect, it } from 'vitest';
import { METRIC_IDS, METRICS, type DailyCheckin, type HabitatSample, type MetricId } from '../contracts';
import { DEMO_OPTIONS, DEFAULT_SCENARIO_ID } from '../scenarios';
import { evaluateCheckin } from './index';

function checkin(sol: number, values: Partial<Record<MetricId, number>>, symptoms: string[] = []): DailyCheckin {
  const submittedAtUtc = new Date(Date.UTC(2039, 0, sol, 10)).toISOString();
  const id = `crew-1:${sol}`;
  return {
    id, sol, astronautId: 'crew-1', submittedAtUtc, note: '',
    measurements: METRIC_IDS.flatMap((metric) => values[metric] === undefined ? [] : [{
      id: `${id}:${metric}`, astronautId: 'crew-1', metric, value: values[metric]!, unit: METRICS[metric].unit,
      observedAtUtc: submittedAtUtc, provenance: 'synthetic_demo' as const,
    }]),
    symptoms: ['headache', 'dizziness', 'vertigo', 'nausea', 'vomiting', 'balance_problems', 'vision_changes', 'head_fullness']
      .map((s) => ({ id: s, label: s.replace('_', ' '), present: symptoms.includes(s) })),
  };
}
const seated = { heart_rate: 70, bp_systolic: 118, bp_diastolic: 76 };
const ids = (c: DailyCheckin, history: DailyCheckin[] = [], environment?: HabitatSample[]) =>
  evaluateCheckin(c, history, environment ? { events: [], archiveEvent: { sol: 1, date: '2017-09-11' }, environment } : undefined);

describe('stand-up (orthostatic) test', () => {
  it('flags a 20/10 mmHg fall or a 30 bpm rise on standing and routes to the Crew Medical Officer', () => {
    const drop = ids(checkin(43, { ...seated, bp_systolic_standing: 96, bp_diastolic_standing: 70, heart_rate_standing: 82 }));
    expect(drop.findings.some((f) => f.ruleId === 'orthostatic-check')).toBe(true);
    expect(drop.recommendedTier).toBe('crew_medical_officer');
    expect(drop.domainStatuses.cardiovascular).not.toBe('no_change_detected');

    const pulse = ids(checkin(43, { ...seated, bp_systolic_standing: 116, bp_diastolic_standing: 78, heart_rate_standing: 100 }));
    expect(pulse.findings.find((f) => f.ruleId === 'orthostatic-check')?.summary).toMatch(/pulse rose by 30 bpm/);
  });

  it('stays quiet for a normal stand test, a 28 bpm rise, or no standing reading', () => {
    expect(ids(checkin(43, { ...seated, bp_systolic_standing: 112, bp_diastolic_standing: 78, heart_rate_standing: 98 }))
      .findings.some((f) => f.ruleId === 'orthostatic-check')).toBe(false);
    const none = ids(checkin(43, seated));
    expect(none.findings.some((f) => f.ruleId === 'orthostatic-check' || f.summary.includes('Standing'))).toBe(false);
  });

  it('rejects a reversed standing pair as an entry problem', () => {
    const bad = ids(checkin(43, { ...seated, bp_systolic_standing: 70, bp_diastolic_standing: 80 }));
    expect(bad.dataQualityWarnings.join(' ')).toMatch(/Standing systolic/);
    expect(bad.domainStatuses.cardiovascular).toBe('check_entry');
  });
});

describe('hydration and exercise countermeasures', () => {
  it('notes a single low-fluid day and trends three in five', () => {
    expect(ids(checkin(43, { fluid_intake: 1.6 })).findings.find((f) => f.ruleId === 'hydration-low')?.kind).toBe('observation');
    expect(ids(checkin(43, { fluid_intake: 2 })).findings.some((f) => f.ruleId === 'hydration-low')).toBe(false);
    const history = [checkin(41, { fluid_intake: 1.5 }), checkin(42, { fluid_intake: 1.7 })];
    expect(ids(checkin(43, { fluid_intake: 1.6 }), history).findings.find((f) => f.ruleId === 'hydration-low')?.kind).toBe('trend');
  });

  it('flags exercise below target on 3 of 5 sols but not one short day, and never sets a body-area status', () => {
    const history = [checkin(41, { exercise_minutes: 20 }), checkin(42, { exercise_minutes: 35 })];
    const low = ids(checkin(43, { exercise_minutes: 45 }), history);
    expect(low.findings.find((f) => f.ruleId === 'countermeasure-adherence')?.summary).toMatch(/not muscle or bone directly/);
    expect(low.domainStatuses.metabolic).toBe(ids(checkin(43, {}), history).domainStatuses.metabolic); // exercise never changes it
    expect(ids(checkin(43, { exercise_minutes: 45 })).findings.some((f) => f.ruleId === 'countermeasure-adherence')).toBe(false);
  });
});

describe('motion sickness, SANS and CO2', () => {
  it('needs two vestibular symptoms; vomiting goes to the Crew Medical Officer', () => {
    expect(ids(checkin(43, {}, ['nausea'])).findings.some((f) => f.ruleId === 'motion-sickness-pattern')).toBe(false);
    const sick = ids(checkin(43, {}, ['dizziness', 'nausea']));
    expect(sick.findings.some((f) => f.ruleId === 'motion-sickness-pattern')).toBe(true);
    expect(sick.recommendedTier).toBe('self_care');
    expect(ids(checkin(43, {}, ['nausea', 'vomiting'])).recommendedTier).toBe('crew_medical_officer');
  });

  it('refers vision changes for an eye check; head fullness alone stays self-care', () => {
    const vision = ids(checkin(43, {}, ['vision_changes']));
    expect(vision.findings.some((f) => f.ruleId === 'sans-screen')).toBe(true);
    expect(vision.recommendedTier).toBe('crew_medical_officer');
    expect(ids(checkin(43, {}, ['head_fullness'])).recommendedTier).toBe('self_care');
  });

  it('links headaches to habitat CO2 only at or above the 3 mmHg limit', () => {
    const env = (co2: number): HabitatSample[] => [{ sol: 43, co2Mmhg: co2, cabinTempC: 22, provenance: 'synthetic_demo' }];
    const high = ids(checkin(43, {}, ['headache']), [], env(3.4));
    expect(high.findings.find((f) => f.ruleId === 'co2-headache-context')?.kind).toBe('contextual_association');
    expect(ids(checkin(43, {}, ['headache']), [], env(2.2)).findings.some((f) => f.ruleId === 'co2-headache-context')).toBe(false);
  });
});

describe('Sol 43 hero scenario tells the after-the-storm story', () => {
  it('shows short exercise and CO2-linked shelter headaches alongside sleep and mood', () => {
    const { scenario, prefill } = DEMO_OPTIONS[DEFAULT_SCENARIO_ID];
    const today = checkin(43, prefill);
    const history = scenario.history.map((h) => ({ ...h, astronautId: 'crew-1', measurements: h.measurements.map((m) => ({ ...m, astronautId: 'crew-1' })) }));
    const result = evaluateCheckin(today, history, { events: scenario.events, archiveEvent: { sol: 41, date: '2017-09-11' }, environment: scenario.environment });
    const rules = result.findings.map((f) => f.ruleId);
    expect(rules).toEqual(expect.arrayContaining(['combined-sleep-mood', 'countermeasure-adherence', 'co2-headache-context']));
    expect(rules).not.toContain('orthostatic-check'); // the scripted stand test is normal
    expect(result.engineVersion).toBe('1.4.0');
  });
});
