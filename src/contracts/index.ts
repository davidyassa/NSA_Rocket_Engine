import { z } from 'zod';

export const CORE_METRIC_IDS = [
  'heart_rate', 'bp_systolic', 'bp_diastolic', 'body_temp',
  'blood_glucose', 'sleep_duration', 'mood',
] as const;

export const METRIC_IDS = [
  ...CORE_METRIC_IDS,
  // Optional readings added from the crew-health gap review:
  'heart_rate_standing', 'bp_systolic_standing', 'bp_diastolic_standing', // stand-up (orthostatic) test
  'fluid_intake', 'exercise_minutes', // hydration and the muscle/bone countermeasure
  'respiratory_rate', 'hrv_rmssd', // camera-derived from the same face pulse signal (no extra hardware)
  'calorie_intake', 'body_mass', // food system: menu fatigue and weight loss far from resupply
] as const;
export const HEALTH_DOMAINS = [
  'cardiovascular', 'metabolic', 'temperature', 'sleep', 'behavioral', 'symptoms',
] as const;

const metricIdSchema = z.enum(METRIC_IDS);
const healthDomainSchema = z.enum(HEALTH_DOMAINS);
const unitSchema = z.enum(['bpm', 'mmHg', 'degC', 'mg_dL', 'h', 'score_1_5', 'uGy_per_h', 'L', 'min', 'breaths_min', 'ms', 'kcal', 'kg']);
const provenanceSchema = z.enum(['user_entered', 'synthetic_demo', 'nasa_archive', 'derived']);
const findingKindSchema = z.enum(['observation', 'trend', 'contextual_association', 'data_quality', 'data_unavailable']);
const domainStatusSchema = z.enum([
  'no_change_detected', 'change_from_baseline', 'sustained_trend',
  'baseline_not_established', 'check_entry', 'not_measured',
]);
const escalationTierSchema = z.enum(['self_care', 'crew_medical_officer', 'ground_flight_surgeon']);
const reviewStatusSchema = z.enum(['sourced', 'demo_heuristic', 'needs_clinical_review']);
const missionEventKindSchema = z.enum(['shelter_protocol', 'eva', 'schedule_shift', 'comm_blackout']);
const utc = z.iso.datetime();
const sol = z.number().int().positive();

export type MetricId = z.infer<typeof metricIdSchema>;
export type Unit = z.infer<typeof unitSchema>;
export type HealthDomain = z.infer<typeof healthDomainSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type FindingKind = z.infer<typeof findingKindSchema>;
export type DomainStatus = z.infer<typeof domainStatusSchema>;
export type EscalationTier = z.infer<typeof escalationTierSchema>;
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
export type MissionEventKind = z.infer<typeof missionEventKindSchema>;

export interface MetricInfo {
  label: string;
  unit: Unit;
  unitLabel: string;
  domain: HealthDomain;
  /** Optional readings: skipping them is normal and never produces a "not measured" finding. */
  optional?: boolean;
  /** Countermeasure logs (exercise, fluids) inform rules but never set a body-area status. */
  countermeasure?: boolean;
}

export const METRICS: Record<MetricId, MetricInfo> = {
  heart_rate: { label: 'Heart rate', unit: 'bpm', unitLabel: 'bpm', domain: 'cardiovascular' },
  bp_systolic: { label: 'Systolic pressure', unit: 'mmHg', unitLabel: 'mmHg', domain: 'cardiovascular' },
  bp_diastolic: { label: 'Diastolic pressure', unit: 'mmHg', unitLabel: 'mmHg', domain: 'cardiovascular' },
  body_temp: { label: 'Body temperature', unit: 'degC', unitLabel: '°C', domain: 'temperature' },
  blood_glucose: { label: 'Blood glucose', unit: 'mg_dL', unitLabel: 'mg/dL', domain: 'metabolic' },
  sleep_duration: { label: 'Sleep duration', unit: 'h', unitLabel: 'h', domain: 'sleep' },
  mood: { label: 'Mood', unit: 'score_1_5', unitLabel: 'of 5', domain: 'behavioral' },
  heart_rate_standing: { label: 'Standing heart rate', unit: 'bpm', unitLabel: 'bpm', domain: 'cardiovascular', optional: true },
  bp_systolic_standing: { label: 'Standing systolic pressure', unit: 'mmHg', unitLabel: 'mmHg', domain: 'cardiovascular', optional: true },
  bp_diastolic_standing: { label: 'Standing diastolic pressure', unit: 'mmHg', unitLabel: 'mmHg', domain: 'cardiovascular', optional: true },
  fluid_intake: { label: 'Fluid intake', unit: 'L', unitLabel: 'L', domain: 'metabolic', optional: true, countermeasure: true },
  exercise_minutes: { label: 'Exercise', unit: 'min', unitLabel: 'min', domain: 'metabolic', optional: true, countermeasure: true },
  respiratory_rate: { label: 'Breathing rate', unit: 'breaths_min', unitLabel: 'breaths/min', domain: 'cardiovascular', optional: true },
  hrv_rmssd: { label: 'Heart rate variability (RMSSD)', unit: 'ms', unitLabel: 'ms', domain: 'cardiovascular', optional: true },
  calorie_intake: { label: 'Food energy', unit: 'kcal', unitLabel: 'kcal', domain: 'metabolic', optional: true, countermeasure: true },
  body_mass: { label: 'Body mass', unit: 'kg', unitLabel: 'kg', domain: 'metabolic', optional: true },
};

export const CORE_SYMPTOM_OPTIONS = [
  { id: 'headache', label: 'Headache' },
  { id: 'dizziness', label: 'Dizziness' },
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'nausea', label: 'Nausea' },
  { id: 'shortness_of_breath', label: 'Shortness of breath' },
  { id: 'chest_discomfort', label: 'Chest discomfort' },
  { id: 'digestive_discomfort', label: 'Digestive discomfort' },
  { id: 'muscle_ache', label: 'Muscle ache' },
] as const;

export const SYMPTOM_OPTIONS = [
  ...CORE_SYMPTOM_OPTIONS,
  // Space motion sickness and balance
  { id: 'vertigo', label: 'Spinning or vertigo' },
  { id: 'vomiting', label: 'Vomiting' },
  { id: 'balance_problems', label: 'Balance problems' },
  // SANS (fluid shift and eye) screening
  { id: 'vision_changes', label: 'Blurred or changed vision' },
  { id: 'head_fullness', label: 'Puffy face or head fullness' },
  // Food system, kidneys and behavioral health far from Earth
  { id: 'poor_appetite', label: 'Poor appetite or food tastes bland' },
  { id: 'flank_pain', label: 'Pain in your side or lower back, or blood in urine' },
  { id: 'feeling_hopeless', label: 'Feeling hopeless or unable to cope' },
] as const;

export const SOL_LENGTH_SECONDS = 88_775;

export function measurementValueError(metric: MetricId, value: number): string | undefined {
  if (!Number.isFinite(value)) return 'Enter a finite number.';
  if (metric === 'mood') {
    if (!Number.isInteger(value) || value < 1 || value > 5) return 'Choose a whole number from 1 to 5.';
    return;
  }
  if (metric === 'sleep_duration') {
    if (value < 0 || value > 24.66) return 'Enter a duration from 0 to 24.66 hours.';
    return;
  }
  if (metric === 'body_temp') {
    if (value <= -273.15) return 'Enter a temperature above absolute zero.';
    return;
  }
  if (metric === 'fluid_intake') {
    if (value < 0 || value > 15) return 'Enter litres from 0 to 15.';
    return;
  }
  if (metric === 'exercise_minutes') {
    if (!Number.isInteger(value) || value < 0 || value > 600) return 'Enter whole minutes from 0 to 600.';
    return;
  }
  if (metric === 'respiratory_rate') {
    if (value < 4 || value > 60) return 'Enter breaths per minute from 4 to 60.';
    return;
  }
  if (metric === 'calorie_intake') {
    if (!Number.isInteger(value) || value < 0 || value > 8000) return 'Enter whole kilocalories from 0 to 8000.';
    return;
  }
  if (metric === 'body_mass') {
    if (value < 30 || value > 200) return 'Enter kilograms from 30 to 200.';
    return;
  }
  if (metric === 'hrv_rmssd') {
    if (value < 5 || value > 250) return 'Enter milliseconds from 5 to 250.';
    return;
  }
  if (value <= 0) return 'Enter a value greater than zero.';
}

export const astronautProfileSchema = z.object({
  id: z.string().min(1), displayName: z.string().min(1), role: z.string().min(1), isSynthetic: z.boolean(),
});
export const missionContextSchema = z.object({
  missionStartUtc: utc,
  solLengthSeconds: z.number().int().positive(),
  oneWayDelayMinutes: z.number().nonnegative(),
  habitat: z.string().min(1),
  archiveOffsetMs: z.number().int(),
});
export const healthMeasurementSchema = z.object({
  id: z.string().min(1),
  astronautId: z.string().min(1),
  metric: metricIdSchema,
  value: z.number(),
  unit: unitSchema,
  observedAtUtc: utc,
  capturedAtUtc: utc.optional(),
  provenance: provenanceSchema,
  source: z.enum(['manual', 'validated_hardware', 'camera_estimate', 'self_report', 'research_import', 'synthetic']).optional(),
  status: z.enum(['accepted', 'rejected_low_quality', 'missing', 'corrected']).optional(),
  signalQuality: z.number().min(0).max(1).nullable().optional(),
  algorithm: z.string().optional(),
  device: z.string().optional(),
  synthetic: z.boolean().optional(),
});
export const symptomSchema = z.object({
  id: z.string().min(1), label: z.string().min(1), present: z.boolean(),
});
export const dailyCheckinSchema = z.object({
  id: z.string().min(1),
  astronautId: z.string().min(1),
  sol,
  submittedAtUtc: utc,
  measurements: z.array(healthMeasurementSchema),
  symptoms: z.array(symptomSchema),
  assessmentScope: z.enum(['core', 'extended']).optional(),
  note: z.string().max(500),
});
export const environmentalSampleSchema = z.object({
  timestampArchive: z.string().min(1),
  instrumentId: z.string().min(1),
  absorbedDoseRate: z.number().nonnegative(),
  unit: z.literal('uGy_per_h'),
  sourceId: z.string().min(1),
});
export const missionEventSchema = z.object({
  id: z.string().min(1),
  kind: missionEventKindSchema,
  startSol: sol,
  endSol: sol,
  label: z.string().min(1),
  provenance: provenanceSchema,
});
export const sourceRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.url().nullable(),
  retrievedOn: z.iso.date(),
  supports: z.string().min(1),
  doesNotSupport: z.string().min(1),
});
export const ruleDefinitionSchema = z.object({
  ruleId: z.string().min(1),
  version: z.string().min(1),
  metricIds: z.array(metricIdSchema),
  conditions: z.array(z.string()),
  contextRequirements: z.array(z.string()),
  priority: z.number(),
  reason: z.string().min(1),
  sourceRefs: z.array(z.string()),
  reviewStatus: reviewStatusSchema,
  actionCardIds: z.array(z.string()),
  testCases: z.array(z.string()),
});
export const assessmentStateSchema = z.enum([
  'no_concern_identified',
  'insufficient_information',
  'remeasurement_recommended',
  'monitor',
  'attention_required',
  'escalation_recommended',
]);

export const baselineSchema = z.object({
  metric: metricIdSchema,
  median: z.number(),
  mad: z.number().optional(),
  count: z.number().int().positive(),
  lookbackSols: z.number().int().positive(),
  inputMeasurementIds: z.array(z.string()),
});
export const findingSchema = z.object({
  kind: findingKindSchema,
  ruleId: z.string().min(1),
  summary: z.string().min(1),
  inputMeasurementIds: z.array(z.string()),
  baselineUsed: z.array(baselineSchema),
  sourceRefs: z.array(z.string()),
  reviewStatus: reviewStatusSchema,
});
export const riskAssessmentSchema = z.object({
  checkinId: z.string().min(1),
  findings: z.array(findingSchema),
  domainStatuses: z.record(healthDomainSchema, domainStatusSchema),
  dataQualityWarnings: z.array(z.string()),
  recommendedTier: escalationTierSchema,
  actionCardIds: z.array(z.string()),
  engineVersion: z.string().min(1),
  overallState: assessmentStateSchema.optional(),
});
export const actionCardSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  steps: z.array(z.string()),
  tier: escalationTierSchema,
  sourceRefs: z.array(z.string()),
  reviewStatus: reviewStatusSchema,
  /** Medical-kit items this card relies on; their stock and expiry are shown with the card. */
  kitItemIds: z.array(z.string()).optional(),
});
/** Synthetic habitat environment reading for one sol (Environmental Control and Life Support). */
export const habitatSampleSchema = z.object({
  sol,
  /** Daily mean cabin CO2 partial pressure, mmHg. */
  co2Mmhg: z.number().nonnegative(),
  /** Daily mean cabin air temperature, °C. */
  cabinTempC: z.number(),
  provenance: provenanceSchema,
});
export const demoScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  profile: astronautProfileSchema,
  missionContext: missionContextSchema,
  history: z.array(dailyCheckinSchema),
  events: z.array(missionEventSchema),
  environment: z.array(habitatSampleSchema).optional(),
  startSol: sol,
});
export const auditEventSchema = z.object({
  id: z.string().min(1),
  atUtc: utc,
  type: z.enum(['checkin_saved', 'ground_draft_prepared', 'demo_reset']),
  refId: z.string().min(1),
});

export type AstronautProfile = z.infer<typeof astronautProfileSchema>;
export type MissionContext = z.infer<typeof missionContextSchema>;
export type HealthMeasurement = z.infer<typeof healthMeasurementSchema>;
export type MeasurementCapture = Pick<HealthMeasurement,
  'capturedAtUtc' | 'source' | 'status' | 'signalQuality' | 'algorithm' | 'device' | 'synthetic'
>;
export type Symptom = z.infer<typeof symptomSchema>;
export type DailyCheckin = z.infer<typeof dailyCheckinSchema>;
export type EnvironmentalSample = z.infer<typeof environmentalSampleSchema>;
export type MissionEvent = z.infer<typeof missionEventSchema>;
export type SourceRecord = z.infer<typeof sourceRecordSchema>;
export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>;
export type Baseline = z.infer<typeof baselineSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;
export type AssessmentState = z.infer<typeof assessmentStateSchema>;
export type ActionCard = z.infer<typeof actionCardSchema>;
export type DemoScenario = z.infer<typeof demoScenarioSchema>;
export type HabitatSample = z.infer<typeof habitatSampleSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;

export type AssessmentContext = {
  events: readonly MissionEvent[];
  archiveEvent: { sol: number; date: string };
  /** Simulated habitat environment by sol (CO2, cabin temperature). */
  environment?: readonly HabitatSample[];
};

export type CheckinEntry = {
  values: Partial<Record<MetricId, number>>;
  symptomIds: string[];
  note: string;
  provenance: Partial<Record<MetricId, 'user_entered' | 'synthetic_demo'>>;
  capture: Partial<Record<MetricId, MeasurementCapture>>;
  assessmentScope?: DailyCheckin['assessmentScope'];
};

export interface StorageRepository<T> {
  readonly schemaVersion: number;
  load(): T | null;
  save(value: T): void;
  reset(): void;
}

export function utcAtSol(mission: MissionContext, missionSol: number, elapsedSeconds = 0): string {
  const offsetSeconds = (missionSol - 1) * mission.solLengthSeconds + elapsedSeconds;
  return new Date(Date.parse(mission.missionStartUtc) + offsetSeconds * 1000).toISOString();
}

export function solAtUtc(mission: MissionContext, utcTime: string): number {
  const elapsedSeconds = (Date.parse(utcTime) - Date.parse(mission.missionStartUtc)) / 1000;
  return Math.floor(elapsedSeconds / mission.solLengthSeconds) + 1;
}
