import { describe, expect, it } from 'vitest';
import { METRIC_IDS, METRICS, type DailyCheckin, type Finding } from '../contracts';
import { DEMO_OPTIONS, DEFAULT_SCENARIO_ID } from '../scenarios';
import { evaluateCheckin } from './index';
import { supersedeSubsumedFindings } from './supersession';

function finding(ruleId: string, summary: string, inputMeasurementIds: string[], kind: Finding['kind'] = 'trend'): Finding {
  return {
    kind, ruleId, summary, inputMeasurementIds,
    baselineUsed: [], sourceRefs: ['demo-method'], reviewStatus: 'demo_heuristic',
  } as Finding;
}

const sleepIds = ['c:40:sleep_duration', 'c:41:sleep_duration', 'c:42:sleep_duration', 'c:43:sleep_duration'];
const moodIds = ['c:40:mood', 'c:41:mood', 'c:42:mood', 'c:43:mood'];
const sleepFell = finding('sustained-trend', 'Sleep duration was below its personal baseline…', sleepIds);
const moodFell = finding('sustained-trend', 'Mood was below its personal baseline…', moodIds);
const combined = finding('combined-sleep-mood', 'Sleep duration and mood both met the sustained lower-trend demo rule.', [...sleepIds, ...moodIds]);

describe('supersedeSubsumedFindings (CMO observation normalization)', () => {
  it('sleep and mood both lower: shows only the combined observation', () => {
    const result = supersedeSubsumedFindings([combined, sleepFell, moodFell]);
    expect(result).toEqual([combined]);
  });

  it('sleep only: keeps the single sleep observation', () => {
    expect(supersedeSubsumedFindings([sleepFell])).toEqual([sleepFell]);
  });

  it('mood only: keeps the single mood observation', () => {
    expect(supersedeSubsumedFindings([moodFell])).toEqual([moodFell]);
  });

  it('neither: produces no spurious finding', () => {
    expect(supersedeSubsumedFindings([])).toEqual([]);
  });

  it('keeps findings from a different window or with extra evidence', () => {
    const olderSleep = finding('sustained-trend', 'Sleep duration was below…', ['c:30:sleep_duration', 'c:31:sleep_duration']);
    const heartRate = finding('sustained-trend', 'Heart rate was above…', ['c:42:heart_rate', 'c:43:heart_rate']);
    const result = supersedeSubsumedFindings([combined, sleepFell, olderSleep, heartRate]);
    expect(result).toEqual([combined, olderSleep, heartRate]);
  });

  it('never suppresses findings from other rules that share the evidence', () => {
    const archive = finding('archive-replay-context', 'A synthetic shelter event…', [...sleepIds, ...moodIds], 'contextual_association');
    const result = supersedeSubsumedFindings([combined, archive, sleepFell]);
    expect(result).toEqual([combined, archive]);
  });

  it('is idempotent and removes exact repeats across recomputation', () => {
    const once = supersedeSubsumedFindings([combined, sleepFell, combined, moodFell]);
    expect(once).toEqual([combined]);
    expect(supersedeSubsumedFindings(once)).toEqual(once);
  });

  it('Sol 43 hero scenario: one combined observation instead of three', () => {
    const { scenario, prefill } = DEMO_OPTIONS[DEFAULT_SCENARIO_ID];
    const submittedAtUtc = new Date(Date.UTC(2039, 0, 43, 10)).toISOString();
    const today: DailyCheckin = {
      id: 'crew-1:43', sol: 43, astronautId: 'crew-1', submittedAtUtc, note: '',
      measurements: METRIC_IDS.flatMap((metric) => prefill[metric] === undefined ? [] : [{
        id: `crew-1:43:${metric}`, astronautId: 'crew-1', metric, value: prefill[metric]!, unit: METRICS[metric].unit,
        observedAtUtc: submittedAtUtc, provenance: 'synthetic_demo' as const,
      }]),
      symptoms: [],
    };
    const history = scenario.history.map((h) => ({ ...h, astronautId: 'crew-1', measurements: h.measurements.map((m) => ({ ...m, astronautId: 'crew-1' })) }));
    const raw = evaluateCheckin(today, history, { events: scenario.events, archiveEvent: { sol: 41, date: '2017-09-11' }, environment: scenario.environment }).findings;
    expect(raw.some((f) => f.ruleId === 'combined-sleep-mood')).toBe(true);
    const isSleepOrMoodTrend = (f: Finding) => f.ruleId === 'sustained-trend'
      && f.inputMeasurementIds.some((id) => id.endsWith(':sleep_duration') || id.endsWith(':mood'));
    expect(raw.filter(isSleepOrMoodTrend)).toHaveLength(2); // the engine still derives both constituents
    const shown = supersedeSubsumedFindings(raw);
    expect(shown.filter((f) => f.ruleId === 'combined-sleep-mood')).toHaveLength(1);
    expect(shown.filter(isSleepOrMoodTrend)).toHaveLength(0);
    expect(shown).toHaveLength(raw.length - 2);
  });
});
