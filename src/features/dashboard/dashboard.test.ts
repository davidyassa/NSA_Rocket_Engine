import { describe, expect, it } from 'vitest';
import { HEALTH_DOMAINS } from '../../contracts';
import { DOMAIN_TARGETS } from './CrewBodyFigure';
import { missedPreviousSol } from './MissedCheckin';


describe('dashboard domain navigation', () => {
  it('defines an accessible navigation target for every health domain', () => {
    for (const domain of HEALTH_DOMAINS) {
      const target = DOMAIN_TARGETS[domain];
      expect(target).toBeDefined();
      expect(target.path.startsWith('/trends') || target.path.startsWith('/assessment')).toBe(true);
      expect(target.label.length).toBeGreaterThan(0);
      expect(target.region.length).toBeGreaterThan(0);
    }
  });

  it('routes vital sign domains to their specific trend indicators and symptoms to assessment', () => {
    expect(DOMAIN_TARGETS.cardiovascular.path).toBe('/trends?metric=heart_rate');
    expect(DOMAIN_TARGETS.metabolic.path).toBe('/trends?metric=blood_glucose');
    expect(DOMAIN_TARGETS.temperature.path).toBe('/trends?metric=body_temp');
    expect(DOMAIN_TARGETS.sleep.path).toBe('/trends?metric=sleep_duration');
    expect(DOMAIN_TARGETS.behavioral.path).toBe('/trends?metric=mood');
    expect(DOMAIN_TARGETS.symptoms.path).toBe('/assessment');
  });
});

describe('missed check-in warning', () => {
  it('warns for a missing previous sol without treating the current sol as missed', () => {
    expect(missedPreviousSol(1, [])).toBeNull();
    expect(missedPreviousSol(43, [{ sol: 42 }])).toBeNull();
    expect(missedPreviousSol(44, [{ sol: 42 }, { sol: 44 }])).toBe(43);
  });
});
