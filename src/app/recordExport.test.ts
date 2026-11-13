import { describe, expect, it } from 'vitest';
import { HERO_SCENARIO } from '../scenarios';
import { buildRecordExport, parseAndValidateExport, EXPORT_SCHEMA_VERSION } from './recordExport';
import type { DailyCheckin } from '../contracts';

describe('record export', () => {
  it('builds a valid JSON export with schema version, scenario ID, and counts', () => {
    const exportData = buildRecordExport(HERO_SCENARIO, HERO_SCENARIO.history);
    expect(exportData.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(exportData.scenarioId).toBe(HERO_SCENARIO.id);
    expect(exportData.scenarioTitle).toBe(HERO_SCENARIO.title);
    expect(exportData.recordCount).toBe(HERO_SCENARIO.history.length);
    expect(exportData.syntheticCount).toBe(HERO_SCENARIO.history.length);
    expect(exportData.userEnteredCount).toBe(0);
    expect(exportData.includesSeededSynthetic).toBe(true);
    expect(exportData.includesNotes).toBe(true);
    expect(exportData.solRange.startSol).toBe(1);
    expect(exportData.solRange.endSol).toBe(42);
  });

  it('correctly tracks user-entered records alongside synthetic records', () => {
    const userRecord: DailyCheckin = {
      id: 'maya-chen:sol-43',
      astronautId: 'maya-chen',
      sol: 43,
      submittedAtUtc: '2039-07-14T08:00:00.000Z',
      measurements: [
        {
          id: 'maya-chen:sol-43:heart_rate',
          astronautId: 'maya-chen',
          metric: 'heart_rate',
          value: 70,
          unit: 'bpm',
          observedAtUtc: '2039-07-14T08:00:00.000Z',
          provenance: 'user_entered',
        },
      ],
      symptoms: [{ id: 'fatigue', label: 'Fatigue', present: true }],
      note: 'Morning resting vitals verified',
    };

    const combined = [...HERO_SCENARIO.history, userRecord];
    const exportData = buildRecordExport(HERO_SCENARIO, combined);

    expect(exportData.recordCount).toBe(43);
    expect(exportData.syntheticCount).toBe(42);
    expect(exportData.userEnteredCount).toBe(1);
    expect(exportData.solRange.endSol).toBe(43);

    // Verify round-trip parsing
    const serialized = JSON.stringify(exportData);
    const parsed = parseAndValidateExport(serialized);
    expect(parsed).toEqual(exportData);
    expect(parsed.records[42].note).toBe('Morning resting vitals verified');
    expect(parsed.records[42].measurements[0].provenance).toBe('user_entered');
    expect(parsed.records[42].measurements[0].unit).toBe('bpm');
  });
});
