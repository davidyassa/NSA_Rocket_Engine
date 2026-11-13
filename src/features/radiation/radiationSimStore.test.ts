import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RADIATION_SCENARIO, radiationSimCondition, useRadiationSimStore } from './radiationSimStore';
import { ENVIRONMENT_SCENARIO_MAP } from './radiationData';

const state = () => useRadiationSimStore.getState();
const dashboardCondition = () => radiationSimCondition(state().scenarioKey, state().frameIndex);

describe('shared radiation transit simulation state', () => {
  beforeEach(() => state().reset());

  it('defaults to the green safe baseline', () => {
    expect(state().scenarioKey).toBe(DEFAULT_RADIATION_SCENARIO);
    const condition = dashboardCondition();
    expect(condition.assessment.status).toBe('GREEN');
    expect(condition.isDefault).toBe(true);
  });

  it('a condition chosen in the Radiation Monitor is what the dashboard reads', () => {
    state().selectScenario('ORANGE');
    expect(dashboardCondition().assessment.status).toBe('ORANGE');
    expect(dashboardCondition().scenario.name).toBe(ENVIRONMENT_SCENARIO_MAP.ORANGE.name);
    state().selectScenario('RED');
    expect(dashboardCondition().assessment.status).toBe('RED');
  });

  it('selecting a condition jumps to its full-state sample', () => {
    state().selectScenario('ORANGE');
    expect(state().frameIndex).toBe(ENVIRONMENT_SCENARIO_MAP.ORANGE.frames.length - 1);
  });

  it('replay reset to the first sample shows the pre-event baseline on the dashboard too', () => {
    state().selectScenario('RED');
    state().setFrameIndex(0);
    expect(dashboardCondition().assessment.status).toBe('GREEN');
    state().setFrameIndex((index) => index + 99);
    expect(state().frameIndex).toBe(ENVIRONMENT_SCENARIO_MAP.RED.frames.length - 1); // clamped
  });

  it('reset clears a stale transit warning', () => {
    state().selectScenario('RED');
    state().reset();
    expect(dashboardCondition().assessment.status).toBe('GREEN');
    expect(dashboardCondition().isDefault).toBe(true);
  });

  it('ignores unknown scenario keys', () => {
    state().selectScenario('NOT_A_SCENARIO');
    expect(state().scenarioKey).toBe(DEFAULT_RADIATION_SCENARIO);
  });
});
