import { z } from 'zod';

export const METRIC_IDS = [
  'heart_rate', 'bp_systolic', 'bp_diastolic', 'body_temp',
  'blood_glucose', 'sleep_duration', 'mood',
] as const;
export const HEALTH_DOMAINS = [
  'cardiovascular', 'metabolic', 'temperature', 'sleep', 'behavioral', 'symptoms',
] as const;

const metricIdSchema = z.enum(METRIC_IDS);
const healthDomainSchema = z.enum(HEALTH_DOMAINS);
const unitSchema = z.enum(['bpm', 'mmHg', 'degC', 'mg_dL', 'h', 'score_1_5', 'uGy_per_h']);
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

export const METRICS: Record<MetricId, { label: string; unit: Unit; unitLabel: string; domain: HealthDomain }> = {
  heart_rate: { label: 'Heart rate', unit: 'bpm', unitLabel: 'bpm', domain: 'cardiovascular' },
  bp_systolic: { label: 'Systolic pressure', unit: 'mmHg', unitLabel: 'mmHg', domain: 'cardiovascular' },
  bp_diastolic: { label: 'Diastolic pressure', unit: 'mmHg', unitLabel: 'mmHg', domain: 'cardiovascular' },
  body_temp: { label: 'Body temperature', unit: 'degC', unitLabel: '°C', domain: 'temperature' },
  blood_glucose: { label: 'Blood glucose', unit: 'mg_dL', unitLabel: 'mg/dL', domain: 'metabolic' },
  sleep_duration: { label: 'Sleep duration', unit: 'h', unitLabel: 'h', domain: 'sleep' },
  mood: { label: 'Mood', unit: 'score_1_5', unitLabel: 'of 5', domain: 'behavioral' },
};

export const SYMPTOM_OPTIONS = [
  { id: 'headache', label: 'Headache' },
  { id: 'dizziness', label: 'Dizziness' },
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'nausea', label: 'Nausea' },
  { id: 'shortness_of_breath', label: 'Shortness of breath' },
  { id: 'chest_discomfort', label: 'Chest discomfort' },
  { id: 'digestive_discomfort', label: 'Digestive discomfort' },
  { id: 'muscle_ache', label: 'Muscle ache' },
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
});
export const demoScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  profile: astronautProfileSchema,
  missionContext: missionContextSchema,
  history: z.array(dailyCheckinSchema),
  events: z.array(missionEventSchema),
  startSol: sol,
});
export const auditEventSchema = z.object({
  id: z.string().min(1),
  atUtc: utc,
  type: z.enum(['checkin_saved', 'demo_reset']),
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
export type AuditEvent = z.infer<typeof auditEventSchema>;

export type AssessmentContext = {
  events: readonly MissionEvent[];
  archiveEvent: { sol: number; date: string };
};

export type CheckinEntry = {
  values: Partial<Record<MetricId, number>>;
  symptomIds: string[];
  note: string;
  provenance: Partial<Record<MetricId, 'user_entered' | 'synthetic_demo'>>;
  capture: Partial<Record<MetricId, MeasurementCapture>>;
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
