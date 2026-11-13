import { z } from 'zod';
import { auditEventSchema, dailyCheckinSchema } from '../contracts';
import type { StorageRepository } from '../contracts';
import { DEFAULT_SCENARIO_ID, SCENARIO_IDS } from '../scenarios';
import { vigilanceSessionSchema } from '../features/cognitive/vigilance';
import { isolationPlanSchema } from '../features/hazards/isolationPlan';

const storageKey = 'sol-check:demo';
const schemaVersion = 3;
const scenarioIdSchema = z.enum(SCENARIO_IDS);
const localCheckins = z.array(dailyCheckinSchema.refine((entry) => entry.measurements.every((reading) =>
  reading.provenance === 'user_entered' || reading.provenance === 'synthetic_demo',
)));

const checklistSchema = z.record(z.string(), z.record(z.string(), z.array(z.string())));

const stateSchemaV3 = z.object({
  schemaVersion: z.literal(schemaVersion),
  scenarioId: scenarioIdSchema,
  entries: z.partialRecord(scenarioIdSchema, localCheckins),
  checklist: checklistSchema.optional().default({}),
  activeSols: z.partialRecord(scenarioIdSchema, z.number().int().positive()).optional(),
  vigilance: z.partialRecord(scenarioIdSchema, z.array(vigilanceSessionSchema)).optional(),
  isolationPlans: z.partialRecord(scenarioIdSchema, z.record(z.string(), isolationPlanSchema)).optional(),
  audit: z.array(auditEventSchema),
});

const stateSchemaV2 = z.object({
  schemaVersion: z.literal(2),
  scenarioId: scenarioIdSchema,
  entries: z.partialRecord(scenarioIdSchema, localCheckins),
  audit: z.array(auditEventSchema),
});

const firstSliceSchema = z.object({
  schemaVersion: z.literal(1),
  entries: localCheckins,
  audit: z.array(auditEventSchema),
});

const loadSchema = z.discriminatedUnion('schemaVersion', [firstSliceSchema, stateSchemaV2, stateSchemaV3]);

export type StoredMission = z.infer<typeof stateSchemaV3>;

export const emptyMission: StoredMission = {
  schemaVersion,
  scenarioId: DEFAULT_SCENARIO_ID,
  entries: {},
  checklist: {},
  audit: [],
};

export function createStorageRepository(storage: Storage): StorageRepository<StoredMission> {
  return {
    schemaVersion,
    load() {
      const raw = storage.getItem(storageKey);
      if (raw === null) return null;
      const parsed = loadSchema.parse(JSON.parse(raw));
      if (parsed.schemaVersion === schemaVersion) return parsed;
      if (parsed.schemaVersion === 2) {
        return {
          schemaVersion,
          scenarioId: parsed.scenarioId,
          entries: parsed.entries,
          checklist: {},
          audit: parsed.audit,
        };
      }
      return {
        ...emptyMission,
        entries: { [DEFAULT_SCENARIO_ID]: parsed.entries },
        audit: parsed.audit,
      };
    },
    save(value) {
      const valid = stateSchemaV3.parse(value);
      storage.setItem(storageKey, JSON.stringify(valid));
    },
    reset() {
      storage.removeItem(storageKey);
    },
  };
}
