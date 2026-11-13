import { describe, expect, it } from 'vitest';
import { HERO_SCENARIO } from '../../scenarios';
import { evaluateCheckin } from '../../engine';
import { summarizeVigilance } from '../cognitive/pvtEngine';
import {
  generateMedicalHandoffPackage,
  formatMedicalHandoffMarkdown,
  verifyMedicalHandoffPackage,
} from './medicalHandoff';

describe('Exploration Medical Handoff Package & Clinical Evidence Passport', () => {
  it('includes only matching-sol vigilance results in the verified local handoff', () => {
    const record = HERO_SCENARIO.history.at(-1)!;
    const current = summarizeVigilance([250, 510, 'missed'], 'quick', record.sol)!;
    const previous = { ...current, sol: record.sol - 1 };
    const pkg = generateMedicalHandoffPackage(record, null, undefined, undefined, undefined, [previous, current]);

    expect(pkg.vigilanceObservations).toEqual([current]);
    expect(formatMedicalHandoffMarkdown(pkg)).toContain('Mean reaction time 380 ms · 2 lapses');
    expect(verifyMedicalHandoffPackage(JSON.parse(JSON.stringify(pkg)))).toMatchObject({ valid: true });
    expect(verifyMedicalHandoffPackage({ ...pkg, vigilanceObservations: [previous] })).toMatchObject({ valid: false });
  });
  it('generates a complete, structured medical handoff package for Sol 43 check-in', () => {
    const history = HERO_SCENARIO.history;
    const latest = history[history.length - 1];
    const assessment = evaluateCheckin(latest, history, {
      events: HERO_SCENARIO.events,
      archiveEvent: { sol: 41, date: '2017-09-11' },
    });

    const pkg = generateMedicalHandoffPackage(latest, assessment, 'Dr. Maya Chen');

    expect(pkg.schemaVersion).toBe('1.1.0');
    expect(pkg.astronautName).toBe('Dr. Maya Chen');
    expect(pkg.missionSol).toBe(42);
    expect(pkg.communicationLatencyOneWayMin).toBe(20);
    expect(pkg.vitalObservations.length).toBeGreaterThan(0);
    expect(pkg.findingsChain.length).toBeGreaterThan(0);
    expect(pkg.nasaHazardsState).toHaveLength(5);
    expect(pkg.localDraft.checksum).toMatch(/^FNV1A32-/);

    const md = formatMedicalHandoffMarkdown(pkg);
    expect(md).toContain('SOL CHECK LOCAL MEDICAL HANDOFF DRAFT');
    expect(md).toContain('Dr. Maya Chen');
    expect(md).toContain('SC-RAD-01');
    expect(md).toContain('SC-BHP-01');
    expect(md).toContain('No clinician review or transmission has occurred');
    expect(md).not.toContain('Evidence-Grounded Diagnostic Findings');
    expect(md).not.toContain('local encrypted memory');
    expect(md).not.toContain('Prepared for transmission');
    expect(pkg.localDraft).toMatchObject({
      clinicianReviewStatus: 'not_reviewed',
      transmissionStatus: 'not_transmitted',
      checksumAlgorithm: 'FNV-1a-32',
    });
  });

  it('recomputes change detection and rejects altered or unknown content', () => {
    const history = HERO_SCENARIO.history;
    const latest = history[history.length - 1];
    const assessment = evaluateCheckin(latest, history);
    const pkg = generateMedicalHandoffPackage(latest, assessment, 'Maya Chen', 20, '2039-07-14T08:10:00.000Z');

    expect(verifyMedicalHandoffPackage(pkg)).toMatchObject({
      valid: true,
      checksum: pkg.localDraft.checksum,
    });

    const altered = structuredClone(pkg);
    altered.vitalObservations[0].value += 1;
    expect(verifyMedicalHandoffPackage(altered)).toMatchObject({ valid: false });
    expect(verifyMedicalHandoffPackage({ ...pkg, unlistedField: true })).toMatchObject({ valid: false });
  });

  it('preserves accepted camera provenance and signal quality', () => {
    const latest = HERO_SCENARIO.history[HERO_SCENARIO.history.length - 1];
    const heartRate = latest.measurements.find(measurement => measurement.metric === 'heart_rate');
    if (!heartRate) throw new Error('Expected a heart-rate fixture.');
    const algorithm = 'vitalcamera-sdk · PSD + SQI TFLite models (local inference)';
    const record = {
      ...latest,
      measurements: latest.measurements.map(measurement => measurement.id === heartRate.id ? {
        ...measurement,
        provenance: 'user_entered' as const,
        capturedAtUtc: '2039-07-14T08:04:11.000Z',
        source: 'camera_estimate' as const,
        status: 'accepted' as const,
        signalQuality: 0.812,
        algorithm,
        device: 'browser webcam · on-device WebAssembly',
        synthetic: false,
      } : measurement),
    };

    const pkg = generateMedicalHandoffPackage(record, null);
    const observation = pkg.vitalObservations.find(item => item.indicator === 'Heart rate');
    expect(observation).toMatchObject({
      origin: 'Camera estimate',
      source: 'camera_estimate',
      capturedAtUtc: '2039-07-14T08:04:11.000Z',
      signalQuality: 0.812,
      algorithm,
      synthetic: false,
    });
  });
});
