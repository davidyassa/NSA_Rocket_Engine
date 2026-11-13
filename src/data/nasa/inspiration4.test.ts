import { describe, expect, it } from 'vitest';
import { analyzeInspiration4, INSPIRATION4_MANIFEST, referenceChangePercent } from './inspiration4';

describe('real Inspiration4 crew blood counts (NASA OSDR OSD-569)', () => {
  const { series, summary } = analyzeInspiration4();
  const find = (subject: string, analyte: string) => series.find((s) => s.subject === subject && s.analyte === analyte)!;

  it('bundles the published file with provenance', () => {
    expect(INSPIRATION4_MANIFEST.study).toBe('OSD-569');
    expect(INSPIRATION4_MANIFEST.subjects).toEqual(['C001', 'C002', 'C003', 'C004']);
    expect(INSPIRATION4_MANIFEST.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('computes reference change values from published biological variation', () => {
    expect(referenceChangePercent(10.13)).toBeCloseTo(26.4, 1); // lymphocytes
    expect(referenceChangePercent(2.71)).toBeCloseTo(7.1, 1); // haemoglobin
  });

  it('catches the entry errors in the published file instead of using them', () => {
    expect(find('C003', 'neutrophils').points.find((p) => p.timepoint === 'L-92')?.gated).toBe(true); // 10.1 cells/µL
    expect(find('C003', 'platelets').points.find((p) => p.timepoint === 'L-92')?.gated).toBe(true); // 12.9 ×10³/µL
    expect(summary.gatedEntries).toBe(2);
  });

  it('finds post-flight changes that every population range misses', () => {
    expect(summary.populationFlags).toBe(0);
    expect(summary.personalChanges).toBe(4);
    expect(summary.hiddenInsideRange).toBe(4);
    const lymph = find('C002', 'lymphocytes');
    expect(lymph.baseline).toBe(2119);
    expect(lymph.returnPoint?.changePercent).toBeCloseTo(-27.3, 1);
    expect(lymph.returnPoint?.outsidePopulationRange).toBe(false);
  });

  it('shows recovery at the next visit for the flagged changes', () => {
    expect(summary.recovered).toBe(summary.personalChanges);
  });
});
