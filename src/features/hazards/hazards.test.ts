import { describe, expect, it } from 'vitest';
import { NASA_FIVE_HAZARDS } from './hazardsData';

describe('NASA Human Research Program Five Hazards Matrix', () => {
  it('contains all 5 canonical spaceflight hazards with HRP Risk IDs', () => {
    expect(NASA_FIVE_HAZARDS).toHaveLength(5);
    const ids = NASA_FIVE_HAZARDS.map(h => h.id);
    expect(ids).toContain('radiation');
    expect(ids).toContain('isolation');
    expect(ids).toContain('distance');
    expect(ids).toContain('gravity');
    expect(ids).toContain('environment');

    for (const hazard of NASA_FIVE_HAZARDS) {
      expect(hazard.hrpRiskId).toMatch(/^SC-/);
      expect(hazard.hrpElement.length).toBeGreaterThan(0);
      expect(hazard.measuredBy.length).toBeGreaterThan(0);
      expect(hazard.needsHardware.length).toBeGreaterThan(0);
      expect(hazard.solCheckMetrics.length).toBeGreaterThan(0);
      expect(hazard.clinicalImpacts.length).toBeGreaterThan(0);
      expect(hazard.operationalCountermeasures.length).toBeGreaterThan(0);
      expect(hazard.officialReferences.length).toBeGreaterThan(0);
    }
  });

  it('links radiation hazard to Curiosity MSL RAD surface readings and archive event', () => {
    const rad = NASA_FIVE_HAZARDS.find(h => h.id === 'radiation');
    expect(rad).toBeDefined();
    expect(rad?.solCheckMetrics).toContain('msl_rad_curiosity');
    expect(rad?.sol43Status.summary).toContain('15.38 µGy/h');
  });

  it('links isolation hazard to sleep duration, mood, and PVT reaction times', () => {
    const isolation = NASA_FIVE_HAZARDS.find(h => h.id === 'isolation');
    expect(isolation).toBeDefined();
    expect(isolation?.solCheckMetrics).toContain('sleep_duration');
    expect(isolation?.solCheckMetrics).toContain('mood');
    expect(isolation?.solCheckMetrics).toContain('pvt_reaction_time');
  });

  it('verifies Distance from Earth hazard adheres to Frozen Design Contract v1', () => {
    const distance = NASA_FIVE_HAZARDS.find(h => h.id === 'distance');
    expect(distance).toBeDefined();
    expect(distance?.hrpRiskId).toBe('SC-EXMC-01');
    expect(distance?.hrpElement).toBe('Exploration Medical Capability (ExMC)');

    // Verify 7 frozen core metrics are tracked
    const coreMetrics = [
      'heart_rate', 'bp_systolic', 'bp_diastolic', 'body_temp',
      'blood_glucose', 'sleep_duration', 'mood',
    ];
    for (const metric of coreMetrics) {
      expect(distance?.solCheckMetrics).toContain(metric);
    }

    // Verify simulated latency and handoff telemetry metrics
    expect(distance?.solCheckMetrics).toContain('simulated_delay_sec');
    expect(distance?.solCheckMetrics).toContain('autonomous_assessment_tier');
    expect(distance?.solCheckMetrics).toContain('handoff_package');

    // Verify all 5 official references cited in Contract v1 are cataloged
    const refTitles = distance?.officialReferences.map(r => r.title) ?? [];
    expect(refTitles.some(t => t.includes('Distance from Earth'))).toBe(true);
    expect(refTitles.some(t => t.includes('NASA-STD-3001'))).toBe(true);
    expect(refTitles.some(t => t.includes('Human System Risks'))).toBe(true);
    expect(refTitles.some(t => t.includes('Earth-Independent Medical Operations'))).toBe(true);
    expect(refTitles.some(t => t.includes('MSL-RAD'))).toBe(true);

    // Verify 3-tier escalation and non-physician autonomy in operational countermeasures
    const countermeasures = distance?.operationalCountermeasures.join(' ') ?? '';
    expect(countermeasures).toContain('3-tier escalation');
    expect(countermeasures).toContain('Offline-first');
    expect(countermeasures).toContain('FNV-1a-32');
  });

  it('verifies Space Radiation hazard incorporates CARN sensor telemetry and NASA-STD-3001 career limits', () => {
    const rad = NASA_FIVE_HAZARDS.find(h => h.id === 'radiation');
    expect(rad).toBeDefined();
    expect(rad?.hrpRiskId).toBe('SC-RAD-01');
    expect(rad?.hrpElement).toBe('Space Radiation (SR)');

    // Verify CARN sensor and dose metrics
    expect(rad?.solCheckMetrics).toContain('carn_sensor_mSv_h');
    expect(rad?.solCheckMetrics).toContain('rolling_30day_mSv');
    expect(rad?.solCheckMetrics).toContain('career_effective_dose_mSv');

    // Verify references include NASA-STD-3001 600 mSv limit
    const refTitles = rad?.officialReferences.map(r => r.title) ?? [];
    expect(refTitles.some(t => t.includes('NASA-STD-3001') && t.includes('600 mSv'))).toBe(true);

    // Verify operational countermeasures include dynamic lockdown, routing, and hysteresis
    const countermeasures = rad?.operationalCountermeasures.join(' ') ?? '';
    expect(countermeasures).toContain('Dynamic compartment lockdown matrix');
    expect(countermeasures).toContain('turn-by-turn lowest-dose crew evacuation routing');
    expect(countermeasures).toContain('6-hour hysteresis');
    expect(countermeasures).toContain('lymphocyte biometric assays');
  });
});
