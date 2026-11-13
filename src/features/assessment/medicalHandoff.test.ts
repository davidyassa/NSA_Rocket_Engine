import { describe, expect, it } from 'vitest';
import { HERO_SCENARIO } from '../../scenarios';
import { evaluateCheckin } from '../../engine';
import { generateMedicalHandoffPackage, formatMedicalHandoffMarkdown } from './medicalHandoff';

describe('Exploration Medical Handoff Package & Clinical Evidence Passport', () => {
  it('generates a complete, structured medical handoff package for Sol 43 check-in', () => {
    const history = HERO_SCENARIO.history;
    const latest = history[history.length - 1];
    const assessment = evaluateCheckin(latest, history, {
      events: HERO_SCENARIO.events,
      archiveEvent: { sol: 41, date: '2017-09-11' },
    });

    const pkg = generateMedicalHandoffPackage(latest, assessment, 'Dr. Maya Chen');

    expect(pkg.schemaVersion).toBe('1.0.0');
    expect(pkg.astronautName).toBe('Dr. Maya Chen');
    expect(pkg.missionSol).toBe(42);
    expect(pkg.communicationLatencyOneWayMin).toBe(20);
    expect(pkg.vitalObservations.length).toBeGreaterThan(0);
    expect(pkg.findingsChain.length).toBeGreaterThan(0);
    expect(pkg.nasaHazardsState).toHaveLength(5);
    expect(pkg.clinicalSignOff.checksum).toMatch(/^SHA-/);

    const md = formatMedicalHandoffMarkdown(pkg);
    expect(md).toContain('# NASA EXPLORATION MEDICAL HANDOFF PACKAGE');
    expect(md).toContain('Dr. Maya Chen');
    expect(md).toContain('HRP-RAD-01');
    expect(md).toContain('HRP-BHP-01');
  });
});
