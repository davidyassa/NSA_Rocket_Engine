import { z } from 'zod';
import {
  assessmentStateSchema,
  METRICS,
  type DailyCheckin,
  type RiskAssessment,
} from '../../contracts';
import { ACTION_CARDS } from '../../content';
import { NASA_FIVE_HAZARDS } from '../hazards/hazardsData';
import { measurementOriginLabel } from './groundSummary';
import { sessionsForSol, vigilanceSessionSchema, VIGILANCE_MODES, type VigilanceSession } from '../cognitive/vigilance';

const nullableString = z.string().nullable();
const sourceSchema = z.enum([
  'manual', 'validated_hardware', 'camera_estimate',
  'self_report', 'research_import', 'synthetic',
]).nullable();
const statusSchema = z.enum(['accepted', 'rejected_low_quality', 'missing', 'corrected']).nullable();
const reviewStatusSchema = z.enum(['sourced', 'demo_heuristic', 'needs_clinical_review']);

export const medicalHandoffPackageSchema = z.object({
  schemaVersion: z.literal('1.1.0'),
  generatedAtUtc: z.iso.datetime(),
  astronautName: z.string().min(1),
  missionSol: z.number().int().positive(),
  communicationLatencyOneWayMin: z.number().nonnegative(),
  includesSyntheticData: z.boolean(),
  overallState: assessmentStateSchema,
  triageTier: z.enum(['self_care', 'crew_medical_officer', 'ground_flight_surgeon']),
  vitalObservations: z.array(z.object({
    indicator: z.string().min(1),
    value: z.number(),
    unit: z.string().min(1),
    observedAtUtc: z.iso.datetime(),
    capturedAtUtc: nullableString,
    provenance: z.string().min(1),
    origin: z.string().min(1),
    source: sourceSchema,
    status: statusSchema,
    signalQuality: z.number().min(0).max(1).nullable(),
    algorithm: nullableString,
    device: nullableString,
    synthetic: z.boolean(),
  }).strict()),
  reportedSymptoms: z.array(z.string()),
  findingsChain: z.array(z.object({
    ruleId: z.string().min(1),
    kind: z.string().min(1),
    summary: z.string().min(1),
    baselineUsed: nullableString,
    inputMeasurementIds: z.array(z.string()),
    sourceRefs: z.array(z.string()),
    reviewStatus: reviewStatusSchema,
  }).strict()),
  nasaHazardsState: z.array(z.object({
    hazard: z.string().min(1),
    hrpRiskId: z.string().min(1),
    state: z.string().min(1),
    summary: z.string().min(1),
  }).strict()),
  recommendedActions: z.array(z.object({
    title: z.string().min(1),
    steps: z.array(z.string()),
    sourceRefs: z.array(z.string()),
    reviewStatus: reviewStatusSchema,
  }).strict()),
  dataQualityWarnings: z.array(z.string()),
  vigilanceObservations: z.array(vigilanceSessionSchema).optional(),
  localDraft: z.object({
    preparedBy: z.string().min(1),
    clinicianReviewStatus: z.literal('not_reviewed'),
    transmissionStatus: z.literal('not_transmitted'),
    checksum: z.string().regex(/^FNV1A32-[0-9A-F]{8}$/),
    checksumAlgorithm: z.literal('FNV-1a-32'),
  }).strict(),
}).strict();

export type MedicalHandoffPackage = z.infer<typeof medicalHandoffPackageSchema>;
type HandoffContent = Omit<MedicalHandoffPackage, 'localDraft'>;

function checksumForContent(content: HandoffContent): string {
  const serialized = JSON.stringify(content);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `FNV1A32-${(hash >>> 0).toString(16).padStart(8, '0').toUpperCase()}`;
}

export function generateMedicalHandoffPackage(
  record: DailyCheckin,
  assessment: RiskAssessment | null,
  astronautName = 'Maya Chen',
  communicationLatencyOneWayMin = 20,
  generatedAtUtc = new Date().toISOString(),
  vigilance: readonly VigilanceSession[] = [],
): MedicalHandoffPackage {
  const sessions = sessionsForSol(vigilance, record.sol);
  const content: HandoffContent = {
    schemaVersion: '1.1.0',
    generatedAtUtc,
    astronautName,
    missionSol: record.sol,
    communicationLatencyOneWayMin,
    includesSyntheticData: record.measurements.some(measurement =>
      measurement.synthetic || measurement.provenance === 'synthetic_demo'),
    overallState: assessment?.overallState ?? 'insufficient_information',
    triageTier: assessment?.recommendedTier ?? 'self_care',
    vitalObservations: record.measurements.map(measurement => ({
      indicator: METRICS[measurement.metric].label,
      value: measurement.value,
      unit: METRICS[measurement.metric].unitLabel,
      observedAtUtc: measurement.observedAtUtc,
      capturedAtUtc: measurement.capturedAtUtc ?? null,
      provenance: measurement.provenance,
      origin: measurementOriginLabel(measurement),
      source: measurement.source ?? null,
      status: measurement.status ?? null,
      signalQuality: measurement.signalQuality ?? null,
      algorithm: measurement.algorithm ?? null,
      device: measurement.device ?? null,
      synthetic: Boolean(measurement.synthetic || measurement.provenance === 'synthetic_demo'),
    })),
    reportedSymptoms: record.symptoms.filter(symptom => symptom.present).map(symptom => symptom.label),
    findingsChain: (assessment?.findings ?? []).map(finding => ({
      ruleId: finding.ruleId,
      kind: finding.kind,
      summary: finding.summary,
      baselineUsed: finding.baselineUsed.length > 0
        ? finding.baselineUsed.map(baseline =>
          `${METRICS[baseline.metric].label} median: ${baseline.median} ${METRICS[baseline.metric].unitLabel} (${baseline.count} readings over ${baseline.lookbackSols} sols)`).join('; ')
        : null,
      inputMeasurementIds: finding.inputMeasurementIds,
      sourceRefs: finding.sourceRefs,
      reviewStatus: finding.reviewStatus,
    })),
    nasaHazardsState: NASA_FIVE_HAZARDS.map(hazard => ({
      hazard: hazard.name,
      hrpRiskId: hazard.hrpRiskId,
      state: hazard.sol43Status.state,
      summary: hazard.sol43Status.summary,
    })),
    recommendedActions: (assessment?.actionCardIds ?? []).flatMap(id => {
      const card = ACTION_CARDS[id];
      return card ? [{
        title: card.title,
        steps: card.steps,
        sourceRefs: card.sourceRefs,
        reviewStatus: card.reviewStatus,
      }] : [];
    }),
    dataQualityWarnings: assessment?.dataQualityWarnings ?? [],
    ...(sessions.length > 0 ? { vigilanceObservations: sessions.map((session) => vigilanceSessionSchema.parse(session)) } : {}),
  };

  return medicalHandoffPackageSchema.parse({
    ...content,
    localDraft: {
      preparedBy: 'Sol Check deterministic rules engine',
      clinicianReviewStatus: 'not_reviewed',
      transmissionStatus: 'not_transmitted',
      checksum: checksumForContent(content),
      checksumAlgorithm: 'FNV-1a-32',
    },
  });
}

export type HandoffVerification =
  | { valid: true; pkg: MedicalHandoffPackage; checksum: string }
  | { valid: false; message: string };

export function verifyMedicalHandoffPackage(input: unknown): HandoffVerification {
  const parsed = medicalHandoffPackageSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, message: 'The file does not match the Sol Check handoff schema v1.1.0.' };
  }
  const { localDraft, ...content } = parsed.data;
  const expectedChecksum = checksumForContent(content);
  if (expectedChecksum !== localDraft.checksum) {
    return { valid: false, message: 'The package content does not match its FNV-1a-32 change-detection value.' };
  }
  return { valid: true, pkg: parsed.data, checksum: expectedChecksum };
}

export function formatMedicalHandoffMarkdown(pkg: MedicalHandoffPackage): string {
  const lines: string[] = [
    '# SOL CHECK LOCAL MEDICAL HANDOFF DRAFT',
    `**Mission Sol:** ${pkg.missionSol} | **Generated:** ${pkg.generatedAtUtc} | **Scenario one-way delay:** ${pkg.communicationLatencyOneWayMin} min`,
    `**Crew Member:** ${pkg.astronautName} | **Assessment state:** ${pkg.overallState.replace(/_/g, ' ')} | **Suggested review route:** ${pkg.triageTier.replace(/_/g, ' ')}`,
    `**Synthetic data included:** ${pkg.includesSyntheticData ? 'Yes' : 'No'}`,
    `**Change detection:** \`${pkg.localDraft.checksum}\` (${pkg.localDraft.checksumAlgorithm}; non-cryptographic, not a signature)`,
    '',
    '> Local draft only. No clinician review or transmission has occurred. This rule-based summary is not a diagnosis.',
    '',
    '## 1. Recorded observations',
  ];

  for (const observation of pkg.vitalObservations) {
    const details = [
      `Origin: ${observation.origin}`,
      `Observed: ${observation.observedAtUtc}`,
      observation.capturedAtUtc ? `Captured: ${observation.capturedAtUtc}` : null,
      observation.signalQuality !== null ? `SQI: ${Math.round(observation.signalQuality * 100)}%` : null,
      observation.status ? `Status: ${observation.status}` : null,
      observation.algorithm ? `Algorithm: ${observation.algorithm}` : null,
      observation.device ? `Device: ${observation.device}` : null,
    ].filter((detail): detail is string => detail !== null);
    lines.push(`- **${observation.indicator}:** ${observation.value} ${observation.unit} (${details.join('; ')})`);
  }

  if (pkg.vigilanceObservations?.length) {
    lines.push('', '### Prototype vigilance results');
    for (const session of pkg.vigilanceObservations) {
      lines.push(`- ${VIGILANCE_MODES[session.mode].label} · Mean reaction time ${session.meanRtMs ?? 'unavailable'}${session.meanRtMs === null ? '' : ' ms'} · ${session.lapsesCount} lapses · ${session.validTrials}/${session.totalTrials} valid responses`);
    }
  }

  lines.push('', '## 2. Reported symptoms');
  lines.push(pkg.reportedSymptoms.length > 0
    ? `- ${pkg.reportedSymptoms.join(', ')}`
    : '- No symptoms were marked present in this check-in.');

  lines.push('', '## 3. Rule-based findings (not diagnoses)');
  if (pkg.findingsChain.length > 0) {
    for (const finding of pkg.findingsChain) {
      lines.push(`- **[${finding.ruleId}]** ${finding.summary}`);
      lines.push(`  *Review status:* ${finding.reviewStatus} | *Evidence refs:* ${finding.sourceRefs.join(', ') || 'none'}`);
      if (finding.baselineUsed) lines.push(`  *Baseline reference:* ${finding.baselineUsed}`);
    }
  } else {
    lines.push('- No findings were produced by the current rules. This does not rule out health concerns.');
  }

  lines.push('', '## 4. NASA five-hazard scenario context');
  lines.push('Scenario context only; these entries are not personal exposure estimates or clinical predictions.');
  for (const hazard of pkg.nasaHazardsState) {
    lines.push(`- **${hazard.hazard} (${hazard.hrpRiskId}):** [${hazard.state.toUpperCase()}] ${hazard.summary}`);
  }

  lines.push('', '## 5. Recommended follow-up');
  if (pkg.recommendedActions.length > 0) {
    for (const action of pkg.recommendedActions) {
      lines.push(`- **${action.title}** (${action.reviewStatus}; refs: ${action.sourceRefs.join(', ')})`);
      action.steps.forEach((step, index) => lines.push(`  ${index + 1}. ${step}`));
    }
  } else {
    lines.push('- No action card was selected by the current rules.');
  }

  lines.push('', '## 6. Data-quality warnings');
  if (pkg.dataQualityWarnings.length > 0) {
    for (const warning of pkg.dataQualityWarnings) lines.push(`- ${warning}`);
  } else {
    lines.push('- No additional data-quality warnings were recorded.');
  }

  lines.push(
    '',
    '## 7. Local draft status',
    `Prepared by ${pkg.localDraft.preparedBy}. Clinician review: ${pkg.localDraft.clinicianReviewStatus}. Transmission: ${pkg.localDraft.transmissionStatus}.`,
    'Downloaded JSON and Markdown files are not encrypted by Sol Check. Protect and share them only through an authorized process.',
  );

  return lines.join('\n');
}
