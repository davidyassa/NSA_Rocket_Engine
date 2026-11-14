import { create } from 'zustand';
import { calculateCrewDose, evaluateVehicleRadiationStatus, type VehicleStatusAssessment } from './radiationEngine';
import {
  DEFAULT_CREW_ROSTER,
  ENVIRONMENT_SCENARIOS,
  ENVIRONMENT_SCENARIO_MAP,
  SPACECRAFT_COMPARTMENTS,
  TELEMETRY_PRESETS,
  telemetryFromFrame,
  type EnvironmentScenario,
} from './radiationData';

export const DEFAULT_RADIATION_SCENARIO = 'GREEN';

/**
 * Single source of truth for the simulated transit condition chosen in the
 * Radiation Monitor. The dashboard reads the same state, so both views always
 * show the same condition. This is session state for a synthetic simulation;
 * it is never stored or presented as an observed measurement.
 */
type RadiationSimState = {
  scenarioKey: string;
  frameIndex: number;
  selectScenario(key: string): void;
  setFrameIndex(next: number | ((current: number) => number)): void;
  reset(): void;
};

function lastFrame(key: string) {
  const scenario = ENVIRONMENT_SCENARIO_MAP[key];
  return scenario ? scenario.frames.length - 1 : 0;
}

export const useRadiationSimStore = create<RadiationSimState>((set) => ({
  scenarioKey: DEFAULT_RADIATION_SCENARIO,
  frameIndex: lastFrame(DEFAULT_RADIATION_SCENARIO),
  selectScenario(key) {
    if (!ENVIRONMENT_SCENARIO_MAP[key]) return;
    // Selecting a condition jumps straight to its full-state sample.
    set({ scenarioKey: key, frameIndex: lastFrame(key) });
  },
  setFrameIndex(next) {
    set((state) => {
      const max = lastFrame(state.scenarioKey);
      const value = typeof next === 'function' ? next(state.frameIndex) : next;
      return { frameIndex: Math.max(0, Math.min(max, value)) };
    });
  },
  reset() {
    set({ scenarioKey: DEFAULT_RADIATION_SCENARIO, frameIndex: lastFrame(DEFAULT_RADIATION_SCENARIO) });
  },
}));

export interface RadiationSimCondition {
  scenario: EnvironmentScenario;
  frameIndex: number;
  frameCount: number;
  assessment: VehicleStatusAssessment;
  isDefault: boolean;
}

const rosterDoses = DEFAULT_CREW_ROSTER.map(calculateCrewDose);

/** Vehicle condition for a simulated scenario + sample, using the same rules as the Radiation Monitor. */
export function radiationSimCondition(scenarioKey: string, frameIndex: number): RadiationSimCondition {
  const scenario = ENVIRONMENT_SCENARIO_MAP[scenarioKey] ?? ENVIRONMENT_SCENARIOS[0];
  const index = Math.max(0, Math.min(frameIndex, scenario.frames.length - 1));
  const telemetry = telemetryFromFrame(scenario.frames[index]);
  const recoveryState = scenario.recoveryActive ? TELEMETRY_PRESETS.RECOVERY.recoveryState : undefined;
  return {
    scenario,
    frameIndex: index,
    frameCount: scenario.frames.length,
    assessment: evaluateVehicleRadiationStatus(SPACECRAFT_COMPARTMENTS, telemetry, rosterDoses, recoveryState),
    isDefault: scenario.key === DEFAULT_RADIATION_SCENARIO,
  };
}
