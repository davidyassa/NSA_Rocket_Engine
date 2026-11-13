import { z } from 'zod';
import { METRIC_IDS, type DailyCheckin, type DemoScenario } from '../contracts';

export const EXPORT_SCHEMA_VERSION = 1;

const exportMeasurementSchema = z.object({
  id: z.string(),
  metric: z.enum(METRIC_IDS),
  value: z.number(),
  unit: z.string(),
  observedAtUtc: z.string(),
  capturedAtUtc: z.string().optional(),
  provenance: z.enum(['user_entered', 'synthetic_demo', 'nasa_archive', 'derived']),
  source: z.enum(['manual', 'validated_hardware', 'camera_estimate', 'self_report', 'research_import', 'synthetic']).optional(),
  status: z.enum(['accepted', 'rejected_low_quality', 'missing', 'corrected']).optional(),
  signalQuality: z.number().min(0).max(1).nullable().optional(),
  algorithm: z.string().optional(),
  device: z.string().optional(),
  synthetic: z.boolean().optional(),
});

const exportCheckinSchema = z.object({
  sol: z.number().int(),
  id: z.string(),
  submittedAtUtc: z.string(),
  note: z.string(),
  measurements: z.array(exportMeasurementSchema),
  symptoms: z.array(z.object({
    id: z.string(),
    label: z.string(),
    present: z.boolean(),
  })),
});

export const recordExportSchema = z.object({
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
  scenarioId: z.string().min(1),
  scenarioTitle: z.string().min(1),
  exportedAtUtc: z.string().min(1),
  astronaut: z.object({
    id: z.string(),
    displayName: z.string(),
    role: z.string(),
    isSynthetic: z.boolean(),
  }),
  includesNotes: z.boolean(),
  includesSeededSynthetic: z.boolean(),
  recordCount: z.number().int().nonnegative(),
  syntheticCount: z.number().int().nonnegative(),
  userEnteredCount: z.number().int().nonnegative(),
  solRange: z.object({
    startSol: z.number().int(),
    endSol: z.number().int(),
  }),
  records: z.array(exportCheckinSchema),
});

export type RecordExport = z.infer<typeof recordExportSchema>;

export function buildRecordExport(
  scenario: DemoScenario,
  records: readonly DailyCheckin[],
  nowUtc: string = new Date().toISOString(),
): RecordExport {
  const sortedRecords = [...records].sort((a, b) => a.sol - b.sol);
  const sols = sortedRecords.map(r => r.sol);
  const startSol = sols.length > 0 ? Math.min(...sols) : scenario.startSol;
  const endSol = sols.length > 0 ? Math.max(...sols) : scenario.startSol;

  let syntheticCount = 0;
  let userEnteredCount = 0;

  const exportRecords = sortedRecords.map((record) => {
    const hasUserEntered = record.measurements.some(m => m.provenance === 'user_entered');
    if (hasUserEntered) {
      userEnteredCount += 1;
    } else {
      syntheticCount += 1;
    }

    return {
      sol: record.sol,
      id: record.id,
      submittedAtUtc: record.submittedAtUtc,
      note: record.note,
      measurements: record.measurements.map((m) => ({
        id: m.id,
        metric: m.metric,
        value: m.value,
        unit: m.unit,
        observedAtUtc: m.observedAtUtc,
        capturedAtUtc: m.capturedAtUtc,
        provenance: m.provenance,
        source: m.source,
        status: m.status,
        signalQuality: m.signalQuality,
        algorithm: m.algorithm,
        device: m.device,
        synthetic: m.synthetic,
      })),
      symptoms: record.symptoms.map((s) => ({
        id: s.id,
        label: s.label,
        present: s.present,
      })),
    };
  });

  const hasNotes = sortedRecords.some(r => r.note.trim().length > 0);

  const payload: RecordExport = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    exportedAtUtc: nowUtc,
    astronaut: {
      id: scenario.profile.id,
      displayName: scenario.profile.displayName,
      role: scenario.profile.role,
      isSynthetic: scenario.profile.isSynthetic,
    },
    includesNotes: hasNotes,
    includesSeededSynthetic: syntheticCount > 0,
    recordCount: exportRecords.length,
    syntheticCount,
    userEnteredCount,
    solRange: {
      startSol,
      endSol,
    },
    records: exportRecords,
  };

  return recordExportSchema.parse(payload);
}

export function parseAndValidateExport(jsonText: string): RecordExport {
  const parsed = JSON.parse(jsonText);
  return recordExportSchema.parse(parsed);
}
