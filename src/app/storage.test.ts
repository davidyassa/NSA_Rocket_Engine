import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO_ID, HERO_SCENARIO } from '../scenarios';
import { createStorageRepository, emptyMission } from './storage';
import { summarizeVigilance } from '../features/cognitive/pvtEngine';
import { emptyIsolationPlan } from '../features/hazards/isolationPlan';

const key = 'sol-check:demo';

function fixtureStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    key(index) { return [...items.keys()][index] ?? null; },
    getItem(name) { return items.get(name) ?? null; },
    setItem(name, value) { items.set(name, value); },
    removeItem(name) { items.delete(name); },
    clear() { items.clear(); },
  };
}

describe('demo storage', () => {
  const checkin = HERO_SCENARIO.history[0];

  it('preserves sol progress, vigilance, and plans by scenario when reloaded', () => {
    const storage = fixtureStorage();
    const repository = createStorageRepository(storage);
    const session = summarizeVigilance([225, 250, 500], 'quick', 43)!;
    const mission = {
      ...emptyMission,
      activeSols: { [DEFAULT_SCENARIO_ID]: 44 },
      vigilance: { [DEFAULT_SCENARIO_ID]: [session] },
      isolationPlans: { [DEFAULT_SCENARIO_ID]: { 43: { ...emptyIsolationPlan, sleepAt: '22:00', wakeAt: '06:00' } } },
    };
    repository.save(mission);
    expect(createStorageRepository(storage).load()).toEqual(mission);
    repository.reset();
    expect(createStorageRepository(storage).load()).toBeNull();
  });

  it('migrates the original saved check-ins into the hero scenario', () => {
    const storage = fixtureStorage();
    storage.setItem(key, JSON.stringify({ schemaVersion: 1, entries: [checkin], audit: [] }));
    const repository = createStorageRepository(storage);

    expect(repository.load()).toEqual({
      ...emptyMission,
      entries: { [DEFAULT_SCENARIO_ID]: [checkin] },
    });
  });

  it('migrates schema version 2 data preserving scenario and entries while initializing empty checklist', () => {
    const storage = fixtureStorage();
    storage.setItem(key, JSON.stringify({
      schemaVersion: 2,
      scenarioId: 'routine-sol',
      entries: { [DEFAULT_SCENARIO_ID]: [checkin] },
      audit: [],
    }));
    const repository = createStorageRepository(storage);

    expect(repository.load()).toEqual({
      schemaVersion: 3,
      scenarioId: 'routine-sol',
      entries: { [DEFAULT_SCENARIO_ID]: [checkin] },
      checklist: {},
      audit: [],
    });
  });

  it('persists and scopes checklist items by scenario and sol, and clears them on reset', () => {
    const repository = createStorageRepository(fixtureStorage());
    const mission = {
      ...emptyMission,
      checklist: {
        [DEFAULT_SCENARIO_ID]: {
          '43': ['bp', 'heart_rate'],
        },
      },
    };
    repository.save(mission);
    expect(repository.load()?.checklist?.[DEFAULT_SCENARIO_ID]?.['43']).toEqual(['bp', 'heart_rate']);
    repository.reset();
    expect(repository.load()).toBeNull();
  });

  it('preserves entries in other scenarios and resets the active scenario and entries together', () => {
    const repository = createStorageRepository(fixtureStorage());
    const mission = {
      ...emptyMission,
      scenarioId: 'routine-sol' as const,
      entries: { [DEFAULT_SCENARIO_ID]: [checkin] },
    };
    repository.save(mission);
    expect(repository.load()).toEqual(mission);
    repository.reset();
    expect(repository.load()).toBeNull();
  });
});
