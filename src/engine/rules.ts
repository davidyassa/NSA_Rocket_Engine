import { CORE_METRIC_IDS, METRICS, type MetricId, type RuleDefinition } from '../contracts';

export { CORE_METRIC_IDS } from '../contracts';

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
  heart_rate_standing: 10,
  bp_systolic_standing: 10,
  bp_diastolic_standing: 8,
  fluid_intake: 0.5,
  exercise_minutes: 30,
  respiratory_rate: 4,
  hrv_rmssd: 10,
  calorie_intake: 300,
  body_mass: 1,
  voice_pitch_variability: 0.6,
  voice_articulation_rate: 0.4,
  voice_pause_ratio: 6,
};

/** Stand-up test thresholds (consensus definition of orthostatic hypotension; adult heart-rate rise on standing). */
export const ORTHOSTATIC = { systolicDrop: 20, diastolicDrop: 10, heartRateRise: 30 } as const;
/** Demo daily minimum fluid intake, litres. */
export const FLUID_TARGET_L = 2;
/** Demo daily exercise target, minutes (ISS crews exercise about 2 hours a day). */
export const EXERCISE_TARGET_MIN = 90;
/** NASA-STD-3001 habitat CO2 limit (1-hour average), mmHg. */
export const CO2_LIMIT_MMHG = 3;
/** Usual adult resting breathing rate, breaths per minute. */
export const BREATHING_RANGE = { low: 12, high: 20 } as const;
/** HRV is very personal: flag only a drop below this fraction of the person's own 14-sol median. */
export const HRV_DROP_FRACTION = 0.7;
/** Demo daily food-energy minimum, kcal (real targets are individual). */
export const ENERGY_MIN_KCAL = 2000;
/**
 * Voice check: each marker counts when it moves the "tired / low" way (flatter pitch, slower
 * pace, more pausing) by at least its demo delta AND by at least 2 personal standard deviations
 * (1.4826 × MAD of the person's own readings). Two of the three markers must agree.
 */
export const VOICE_MARKERS = [
  { metric: 'voice_pitch_variability', lowDirection: -1 },
  { metric: 'voice_articulation_rate', lowDirection: -1 },
  { metric: 'voice_pause_ratio', lowDirection: 1 },
] as const satisfies readonly { metric: MetricId; lowDirection: -1 | 1 }[];
export const VOICE_MIN_MARKERS = 2;
export const VOICE_PERSONAL_SD = 2;
/** Body mass below the personal usual: 3% is flagged, 5% goes to the Crew Medical Officer (demo values). */
export const BODY_MASS_DROP = { flag: 0.03, cmo: 0.05 } as const;
export const MOTION_SICKNESS_SYMPTOMS = ['dizziness', 'vertigo', 'nausea', 'vomiting', 'balance_problems'] as const;

const baselineCondition = `Use the median of at least ${MIN_BASELINE_READINGS} distinct measured sols in the prior ${BASELINE_LOOKBACK_SOLS} sols.`;
const deltaLabels = CORE_METRIC_IDS.map((metric) => {
  const { label, unitLabel } = METRICS[metric];
  const deltaUnit = metric === 'mood' ? 'point' : unitLabel;
  return `${label.toLowerCase()} ${DEMO_DELTAS[metric]} ${deltaUnit}`;
});
const deltaCondition = `The demo deltas by metric are ${deltaLabels.join(', ')}.`;
const baselineSources = ['demo-method', 'nasa-monitoring'];

export const CORE_RULES = {
  'entry-quality': {
    ruleId: 'entry-quality',
    version: '1.0.0',
    metricIds: [...CORE_METRIC_IDS],
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
    metricIds: [...CORE_METRIC_IDS],
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
    metricIds: [...CORE_METRIC_IDS],
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
      'The recommendation applies even when measurements are missing or show no change.',
    ],
    contextRequirements: ['A current symptom report.'],
    priority: 110,
    reason: 'A conservative prototype safety override keeps potentially concerning symptoms visible for onboard medical review; it does not identify a disease or replace the mission medical procedure.',
    sourceRefs: ['demo-method', 'nasa-monitoring', 'nasa-eimo'],
    reviewStatus: 'needs_clinical_review',
    actionCardIds: ['crew-review'],
    testCases: ['Either symptom escalates even without a change in measurements.', 'An unrelated entry problem does not cancel the escalation.'],
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
    metricIds: [...CORE_METRIC_IDS],
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

const optionalRuleDefinitions = {
  'orthostatic-check': {
    ruleId: 'orthostatic-check',
    version: '1.0.0',
    metricIds: ['bp_systolic', 'bp_diastolic', 'heart_rate', 'bp_systolic_standing', 'bp_diastolic_standing', 'heart_rate_standing'],
    conditions: [
      `Compare the seated readings with the readings after 3 minutes standing on the same check-in.`,
      `Flag a fall of at least ${ORTHOSTATIC.systolicDrop} mmHg systolic or ${ORTHOSTATIC.diastolicDrop} mmHg diastolic, or a pulse rise of at least ${ORTHOSTATIC.heartRateRise} bpm.`,
    ],
    contextRequirements: ['A seated blood pressure pair and at least one standing reading on the same check-in.'],
    priority: 95,
    reason: 'Orthostatic intolerance is a known risk when moving between gravity levels; a positive stand test is shown to the Crew Medical Officer.',
    sourceRefs: ['orthostatic-consensus', 'orthostatic-hr-review'],
    reviewStatus: 'sourced',
    actionCardIds: ['orthostatic-care'],
    testCases: ['A 24/6 mmHg drop on standing is flagged.', 'A 28 bpm rise alone is not flagged; 30 bpm is.', 'No standing reading means no finding.'],
  },
  'hydration-low': {
    ruleId: 'hydration-low',
    version: '1.0.0',
    metricIds: ['fluid_intake'],
    conditions: [
      `Flag fluid intake below ${FLUID_TARGET_L} L on the current check-in.`,
      `Report a trend when intake is below ${FLUID_TARGET_L} L on at least ${MIN_TREND_READINGS} of the last ${TREND_LOOKBACK_SOLS} sols.`,
    ],
    contextRequirements: ['A fluid intake entry on the current check-in.'],
    priority: 60,
    reason: 'Thirst is blunted in low gravity; low intake is surfaced so the crew member can drink more.',
    sourceRefs: ['demo-method'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['hydrate'],
    testCases: ['1.6 L is flagged; 2.0 L is not.', 'Three low sols in five produce a trend.'],
  },
  'countermeasure-adherence': {
    ruleId: 'countermeasure-adherence',
    version: '1.0.0',
    metricIds: ['exercise_minutes'],
    conditions: [`Exercise is below ${EXERCISE_TARGET_MIN} minutes on at least ${MIN_TREND_READINGS} of the last ${TREND_LOOKBACK_SOLS} logged sols.`],
    contextRequirements: ['Exercise minutes logged on the current check-in.'],
    priority: 65,
    reason: 'Daily exercise is the main countermeasure against muscle and bone loss. Logged minutes are adherence, not a measurement of muscle mass or bone density.',
    sourceRefs: ['nasa-exercise'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['exercise-plan'],
    testCases: ['Three short sessions in five sols produce a finding.', 'A single short day does not.'],
  },
  'motion-sickness-pattern': {
    ruleId: 'motion-sickness-pattern',
    version: '1.0.0',
    metricIds: [],
    conditions: [
      'At least two of dizziness, spinning/vertigo, nausea, vomiting or balance problems are reported on the current check-in.',
      'Vomiting is shown to the Crew Medical Officer because it risks dehydration.',
    ],
    contextRequirements: ['A current symptom report.'],
    priority: 80,
    reason: 'A cluster of vestibular symptoms suggests space motion sickness while the body adapts to a new gravity level.',
    sourceRefs: ['nasa-monitoring'],
    reviewStatus: 'needs_clinical_review',
    actionCardIds: ['motion-sickness-care'],
    testCases: ['Dizziness and nausea together produce a finding.', 'One symptom alone does not.'],
  },
  'sans-screen': {
    ruleId: 'sans-screen',
    version: '1.0.0',
    metricIds: [],
    conditions: [
      'Blurred or changed vision is reported: recommend a Crew Medical Officer eye check.',
      'A puffy face or head fullness is reported: note the fluid shift and keep watching.',
    ],
    contextRequirements: ['A current symptom report.'],
    priority: 85,
    reason: 'Fluid shift can change the eye (SANS). Symptoms cannot detect SANS; they prompt an eye exam with imaging.',
    sourceRefs: ['sans-review'],
    reviewStatus: 'needs_clinical_review',
    actionCardIds: ['eye-check'],
    testCases: ['A vision change recommends Crew Medical Officer review.', 'Head fullness alone stays self-care.'],
  },
  'co2-headache-context': {
    ruleId: 'co2-headache-context',
    version: '1.0.0',
    metricIds: [],
    conditions: [
      `A headache was reported on a sol in the last ${TREND_LOOKBACK_SOLS} when the habitat CO2 daily mean was at or above ${CO2_LIMIT_MMHG} mmHg.`,
    ],
    contextRequirements: ['Habitat environment readings for the same sols (simulated in this demo).'],
    priority: 34,
    reason: 'NASA links cabin CO2 above about 2.5–3 mmHg with headaches. Timing alone cannot establish a cause; fluid shift causes similar headaches.',
    sourceRefs: ['nasa-co2-brief'],
    reviewStatus: 'sourced',
    actionCardIds: ['co2-check'],
    testCases: ['A headache on a 3.4 mmHg sol adds a context finding.', 'A headache on a 2.2 mmHg sol does not.'],
  },
  'breathing-rate-range': {
    ruleId: 'breathing-rate-range',
    version: '1.1.0',
    metricIds: ['respiratory_rate'],
    conditions: [
      `For a microphone estimate, flag a change of at least ${DEMO_DELTAS.respiratory_rate} breaths/min from the personal median of at least ${MIN_BASELINE_READINGS} prior sols in the last ${BASELINE_LOOKBACK_SOLS}.`,
      `For other sources, flag a resting breathing rate below ${BREATHING_RANGE.low} or above ${BREATHING_RANGE.high} breaths/min on the current check-in.`,
    ],
    contextRequirements: ['A breathing-rate entry on the current check-in.'],
    priority: 55,
    reason: 'Changes in resting breathing rate can have several causes. Repeat an estimate at rest to check the reading.',
    sourceRefs: ['ppg-respiratory-fusion', 'mic-respiration'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['breathing-recheck'],
    testCases: ['A counted rate of 24 breaths/min is flagged as higher.', 'A microphone estimate of 20 vs a personal median of 16 is flagged as higher.'],
  },
  'voice-change-from-usual': {
    ruleId: 'voice-change-from-usual',
    version: '1.0.0',
    metricIds: ['voice_pitch_variability', 'voice_articulation_rate', 'voice_pause_ratio'],
    conditions: [
      `Each voice marker is compared with the median of at least ${MIN_BASELINE_READINGS} prior sols in the last ${BASELINE_LOOKBACK_SOLS}.`,
      `A marker counts when it moves the tired way (pitch movement down, speaking pace down, pause time up) by at least its demo delta (${DEMO_DELTAS.voice_pitch_variability} semitones, ${DEMO_DELTAS.voice_articulation_rate} syllables/s, ${DEMO_DELTAS.voice_pause_ratio} percentage points) and by at least ${VOICE_PERSONAL_SD} personal standard deviations.`,
      `At least ${VOICE_MIN_MARKERS} of the 3 markers must count.`,
    ],
    contextRequirements: ['A voice check (the same read-aloud passage) today and on at least 5 prior sols.'],
    priority: 52,
    reason: 'Flatter pitch, slower speech and more pausing are the speech changes most often reported with low mood and fatigue. Voice alone cannot diagnose anything, so this is a prompt to check in, not an escalation.',
    sourceRefs: ['speech-mental-health', 'speech-methods'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['voice-check-in'],
    testCases: ['Pitch movement 1.6 vs 2.6 semitones and pauses 27% vs 18% is flagged.', 'One marker alone is not flagged.', 'No finding without 5 prior voice checks.'],
  },
  'hrv-below-usual': {
    ruleId: 'hrv-below-usual',
    version: '1.0.0',
    metricIds: ['hrv_rmssd'],
    conditions: [`Flag RMSSD below ${Math.round(HRV_DROP_FRACTION * 100)}% of the personal median of at least ${MIN_BASELINE_READINGS} prior sols in the last ${BASELINE_LOOKBACK_SOLS}.`],
    contextRequirements: [`An HRV entry today and at least ${MIN_BASELINE_READINGS} prior HRV readings.`],
    priority: 50,
    reason: 'HRV norms differ widely between people, so only a clear drop against the person’s own usual is surfaced. It is a recovery cue, not a diagnosis.',
    sourceRefs: ['hrv-norms'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['recovery-day'],
    testCases: ['30 ms against a 50 ms usual is flagged; 45 ms is not.', 'No finding without 5 prior readings.'],
  },
  'energy-intake-low': {
    ruleId: 'energy-intake-low',
    version: '1.0.0',
    metricIds: ['calorie_intake'],
    conditions: [`Food energy below ${ENERGY_MIN_KCAL} kcal on at least ${MIN_TREND_READINGS} of the last ${TREND_LOOKBACK_SOLS} logged sols.`],
    contextRequirements: ['A food-energy entry on the current check-in.'],
    priority: 58,
    reason: 'Menu fatigue and low appetite make crew under-eat; with no resupply this speeds muscle and bone loss. Logged intake is self-reported.',
    sourceRefs: ['iss-body-mass'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['nutrition-plan'],
    testCases: ['1,700 kcal on 3 of 5 sols is a trend; one low day is not.'],
  },
  'body-mass-loss': {
    ruleId: 'body-mass-loss',
    version: '1.0.0',
    metricIds: ['body_mass'],
    conditions: [
      `Flag body mass ${BODY_MASS_DROP.flag * 100}% or more below the personal median of at least ${MIN_BASELINE_READINGS} prior sols.`,
      `${BODY_MASS_DROP.cmo * 100}% or more below the usual routes to the Crew Medical Officer.`,
    ],
    contextRequirements: [`A body-mass entry today and at least ${MIN_BASELINE_READINGS} prior readings.`],
    priority: 62,
    reason: 'Unplanned weight loss is the clearest sign that nutrition is falling behind in flight.',
    sourceRefs: ['iss-body-mass'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['nutrition-plan'],
    testCases: ['58.0 kg against a 61.0 kg usual (−4.9%) is flagged; 60.0 kg is not.', '57.5 kg (−5.7%) routes to the CMO.'],
  },
  'kidney-stone-screen': {
    ruleId: 'kidney-stone-screen',
    version: '1.0.0',
    metricIds: ['fluid_intake'],
    conditions: ['Side or lower-back pain, or blood in urine, is reported.', `Recent fluid intake below the demo minimum is added as context.`],
    contextRequirements: ['The symptom checkbox on the current check-in.'],
    priority: 92,
    reason: 'Bone calcium released in low gravity and low fluid intake raise kidney-stone risk; there is no evacuation, so it is checked onboard the same day.',
    sourceRefs: ['renal-stones-astronauts'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['kidney-stone-care'],
    testCases: ['Flank pain routes to the CMO.', 'Low fluid on recent sols is named in the summary.'],
  },
  'behavioral-crisis': {
    ruleId: 'behavioral-crisis',
    version: '1.0.0',
    metricIds: [],
    conditions: ['Feeling hopeless or unable to cope is reported.'],
    contextRequirements: ['The symptom checkbox on the current check-in.'],
    priority: 99,
    reason: 'With a 40-minute round trip to Earth, a behavioral crisis must be handled by the crew; the report goes straight to the Crew Medical Officer without waiting for a trend.',
    sourceRefs: ['nasa-bmed-risk'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['behavioral-support'],
    testCases: ['The checkbox alone routes to the CMO.'],
  },
  'bone-kidney-compound': {
    ruleId: 'bone-kidney-compound',
    version: '1.0.0',
    metricIds: ['exercise_minutes', 'fluid_intake', 'calorie_intake'],
    conditions: [
      `Exercise below ${EXERCISE_TARGET_MIN} min on at least ${MIN_TREND_READINGS} of the last ${TREND_LOOKBACK_SOLS} sols, AND`,
      `fluid below ${FLUID_TARGET_L} L or food below ${ENERGY_MIN_KCAL} kcal on at least 2 of those sols.`,
    ],
    contextRequirements: ['Exercise plus fluid or food logs over the last 5 sols.'],
    priority: 40,
    reason: 'The optional comparison shows where changes in exercise, food intake and fluid intake overlap in the same window.',
    sourceRefs: ['nasa-exercise', 'renal-stones-astronauts', 'iss-body-mass'],
    reviewStatus: 'demo_heuristic',
    actionCardIds: ['protect-bones-kidneys'],
    testCases: ['Short exercise plus two low-food sols adds a context finding; short exercise alone does not.'],
  },
} satisfies Record<string, RuleDefinition>;

export type RuleId = keyof typeof CORE_RULES | keyof typeof optionalRuleDefinitions;
export const RULES: Readonly<Record<string, RuleDefinition>> = { ...CORE_RULES, ...optionalRuleDefinitions };
