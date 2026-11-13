import { METRIC_IDS, METRICS, type MetricId, type RuleDefinition } from '../contracts';

export const BASELINE_LOOKBACK_SOLS = 14;
export const MIN_BASELINE_READINGS = 5;
export const TREND_LOOKBACK_SOLS = 5;
export const MIN_TREND_READINGS = 3;

// Differences from the individual's demo baseline, expressed in each metric's fixed unit.
export const DEMO_DELTAS: Readonly<Record<MetricId, number>> = {
  heart_rate: 8,
  bp_systolic: 10,
  bp_diastolic: 8,
  body_temp: 0.4,
  blood_glucose: 12,
  sleep_duration: 1,
  mood: 1,
};

const baselineCondition = `Use the median of at least ${MIN_BASELINE_READINGS} distinct measured sols in the prior ${BASELINE_LOOKBACK_SOLS} sols.`;
const deltaLabels = METRIC_IDS.map((metric) => {
  const { label, unitLabel } = METRICS[metric];
  const deltaUnit = metric === 'mood' ? 'point' : unitLabel;
  return `${label.toLowerCase()} ${DEMO_DELTAS[metric]} ${deltaUnit}`;
});
const deltaCondition = `The demo deltas by metric are ${deltaLabels.join(', ')}.`;
const baselineSources = ['demo-method', 'nasa-monitoring'];

const ruleDefinitions = {
  'entry-quality': {
    ruleId: 'entry-quality',
    version: '1.0.0',
    metricIds: [...METRIC_IDS],
    conditions: [
      'Check the recorded value, the fixed unit, the astronaut ID, and that each metric has one reading.',
      'If either blood pressure value is entered, both values must be usable and systolic must exceed diastolic.',
    ],
    contextRequirements: ['A submitted check-in.'],
    priority: 100,
    reason: 'Entry checks prevent conflicting or unusable measurements from contributing to the assessment.',
    sourceRefs: ['demo-method'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['recheck-entry'],
    testCases: ['A reversed blood pressure pair is flagged and excluded.', 'An omitted pair is marked not measured.'],
  },
  'combined-sleep-mood': {
    ruleId: 'combined-sleep-mood',
    version: '1.0.0',
    metricIds: ['sleep_duration', 'mood'],
    conditions: ['Both sleep duration and mood meet the sustained lower-trend demo rule.'],
    contextRequirements: ['A usable reading and personal baseline for both metrics.'],
    priority: 90,
    reason: 'Two lower trends trigger a simulated Crew Medical Officer review of the recorded pattern.',
    sourceRefs: ['demo-method', 'nasa-monitoring', 'nasa-eimo'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['crew-review'],
    testCases: ['Both lower trends recommend Crew Medical Officer review.', 'Either lower trend alone keeps self-care.'],
  },
  'sustained-trend': {
    ruleId: 'sustained-trend',
    version: '1.0.0',
    metricIds: [...METRIC_IDS],
    conditions: [
      baselineCondition,
      deltaCondition,
      `At least ${MIN_TREND_READINGS} of the last ${TREND_LOOKBACK_SOLS} mission sols meet the same-direction demo delta. Missing sols contribute no qualifying readings.`,
    ],
    contextRequirements: ['A usable reading on the check-in sol and an established personal baseline.'],
    priority: 70,
    reason: 'Repeated changes in the same direction are surfaced for review using a prototype comparison window.',
    sourceRefs: baselineSources,
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['record-and-monitor'],
    testCases: ['Four lower readings within five sols produce a trend.', 'Missing sols do not extend the window.'],
  },
  'baseline-change': {
    ruleId: 'baseline-change',
    version: '1.0.0',
    metricIds: [...METRIC_IDS],
    conditions: [baselineCondition, deltaCondition, 'The current reading differs from its baseline by at least the metric’s demo delta.'],
    contextRequirements: ['A usable reading and an established personal baseline.'],
    priority: 50,
    reason: 'An individual reading that differs from the prior median is surfaced for comparison.',
    sourceRefs: baselineSources,
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['record-and-monitor'],
    testCases: ['A single reading at its demo delta is marked as a change.'],
  },
  'urgent-symptoms': {
    ruleId: 'urgent-symptoms',
    version: '1.0.0',
    metricIds: [],
    conditions: [
      'Chest discomfort or shortness of breath is marked present on the current check-in.',
      'Recommend Crew Medical Officer review without waiting for a personal baseline or a repeated trend.',
      'Normal or missing measurements do not cancel this recommendation.',
    ],
    contextRequirements: ['A current symptom report.'],
    priority: 95,
    reason: 'A conservative prototype safety override keeps potentially concerning symptoms visible for onboard medical review; it does not identify a disease or replace the mission medical procedure.',
    sourceRefs: ['demo-method', 'nasa-monitoring', 'nasa-eimo'],
    reviewStatus: 'needs_clinical_review',
    actionCardIds: ['crew-review'],
    testCases: ['Either concerning symptom escalates even with normal vitals.', 'An unrelated entry problem does not cancel the escalation.'],
  },
  'reported-symptoms': {
    ruleId: 'reported-symptoms',
    version: '1.0.0',
    metricIds: [],
    conditions: [
      'Show symptoms marked present on the current check-in.',
      `Show a sustained symptom trend when the same symptom is recorded on at least ${MIN_TREND_READINGS} of the last ${TREND_LOOKBACK_SOLS} mission sols.`,
    ],
    contextRequirements: ['A symptom marked present on the current check-in.'],
    priority: 40,
    reason: 'A direct record of reported symptoms and repeated reports gives the crew context for reviewing their log.',
    sourceRefs: baselineSources,
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['record-and-monitor'],
    testCases: ['Three reports in five sols produce a sustained symptom trend.'],
  },
  'archive-replay-context': {
    ruleId: 'archive-replay-context',
    version: '1.0.0',
    metricIds: ['sleep_duration', 'mood'],
    conditions: [
      'Sleep and mood both meet the sustained lower-trend demo rule.',
      'A synthetic shelter event includes the sol mapped to the verified radiation archive reading within the same five-sol window.',
    ],
    contextRequirements: ['A dated RadLab archive reading mapped onto the synthetic mission.', 'A synthetic shelter event.'],
    priority: 35,
    reason: 'The replay alignment gives the crew a shared timeline for reviewing the simulated shelter event and check-in history. Timing alone cannot establish a cause.',
    sourceRefs: ['demo-method', 'nasa-radlab-msl-rad-surface'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: [],
    testCases: ['An aligned shelter event adds a context finding without changing the recommendation.', 'No context finding is made when the events do not overlap.'],
  },
  'data-unavailable': {
    ruleId: 'data-unavailable',
    version: '1.0.0',
    metricIds: [...METRIC_IDS],
    conditions: ['Report a skipped reading as not measured.', baselineCondition],
    contextRequirements: ['A submitted check-in.'],
    priority: 20,
    reason: 'A comparison needs both the current reading and enough prior measured sols.',
    sourceRefs: ['demo-method'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: [],
    testCases: ['Missing readings and insufficient history produce separate reasons for data unavailable.'],
  },
} satisfies Record<string, RuleDefinition>;

export type RuleId = keyof typeof ruleDefinitions;
export const RULES: Readonly<Record<string, RuleDefinition>> = ruleDefinitions;
