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
      expect(hazard.hrpRiskId).toMatch(/^HRP-/);
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
});
