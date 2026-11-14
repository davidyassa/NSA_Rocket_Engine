/**
 * Real astronaut data: SpaceX Inspiration4 complete blood counts (NASA OSDR, OSD-569).
 *
 * Sol Check's core idea is "compare each crew member with their own usual, not
 * with population ranges". This module tests that idea on real crew data:
 *  1. a data-quality gate excludes entries outside the prototype plausibility ranges;
 *  2. each crew member's baseline is the median of their pre-flight samples;
 *  3. a post-flight change counts only if it exceeds the analyte's reference
 *     change value (RCV), computed from published within-person biological
 *     variation (Coskun et al., Clin Chem Lab Med 2019);
 *  4. the same values are also checked against the lab's population range.
 * Pure and deterministic, so the headline numbers are unit-tested.
 */
import type { SourceRecord } from '../../contracts';
import rawCsvUrl from './osd-569-cbc.csv?url';
import fixture from './inspiration4-cbc.json';

export type CbcAnalyte = 'wbc' | 'lymphocytes' | 'neutrophils' | 'hemoglobin' | 'platelets';

export interface CbcRow {
  subject: string;
  sex: string;
  analyte: CbcAnalyte;
  sourceAnalyte: string;
  timepoint: string;
  /** days from launch: negative before (L-), positive after return (R+) */
  day: number;
  value: number;
  rangeMin: number;
  rangeMax: number;
  unit: string;
}

export const INSPIRATION4_MANIFEST = fixture.manifest;
export const INSPIRATION4_ROWS = fixture.rows as CbcRow[];
export const INSPIRATION4_CSV_URL = rawCsvUrl;

export const INSPIRATION4_SOURCE: SourceRecord = {
  id: 'osdr-osd-569-cbc',
  title: 'Whole Blood Measurements from the SpaceX Inspiration4 Mission (OSD-569), complete blood count',
  publisher: 'NASA Open Science Data Repository (OSDR)',
  url: fixture.manifest.studyUrl,
  retrievedOn: fixture.manifest.retrievedOn,
  supports: 'Clinical blood counts for the four Inspiration4 crew at three pre-flight and four post-flight time points, with the lab’s reference ranges.',
  doesNotSupport: 'Causes of any change, or health conclusions about individual crew members. Four people on a 3-day flight is a small sample.',
};

export const BIOLOGICAL_VARIATION_SOURCE: SourceRecord = {
  id: 'coskun-2019-haematology-bv',
  title: 'Systematic review and meta-analysis of within-subject and between-subject biological variation estimates of 20 haematological parameters (Coskun et al., 2019)',
  publisher: 'Clinical Chemistry and Laboratory Medicine (EFLM)',
  url: 'https://www.eflm.eu/upload/docs/2019-ClinChemLabMed-Coskun-et-al.pdf',
  retrievedOn: '2026-11-13',
  supports: 'Within-person biological variation (CVI): haemoglobin 2.71%, leukocytes 10.01%, lymphocytes 10.13%, neutrophils 13.61%, platelets 7.1%.',
  doesNotSupport: 'Spaceflight-specific variation; these are healthy-adult estimates on Earth.',
};

/** Two-sided 90% confidence (Z = 1.65) for a change in either direction. */
export const RCV_Z = 1.65;

export const CBC_ANALYTES: Record<CbcAnalyte, { label: string; plain: string; cvi: number; plausible: readonly [number, number] }> = {
  wbc: { label: 'White blood cells', plain: 'all infection-fighting cells', cvi: 10.01, plausible: [0.5, 60] },
  lymphocytes: { label: 'Lymphocytes', plain: 'immune cells that remember infections', cvi: 10.13, plausible: [100, 30_000] },
  neutrophils: { label: 'Neutrophils', plain: 'first-responder infection fighters', cvi: 13.61, plausible: [200, 50_000] },
  hemoglobin: { label: 'Haemoglobin', plain: 'oxygen carrier in red blood cells', cvi: 2.71, plausible: [4, 25] },
  platelets: { label: 'Platelets', plain: 'cells that help blood clot', cvi: 7.1, plausible: [20, 2000] },
};

/**
 * Reference change value (%): the smallest change unlikely to be normal day-to-day
 * noise. RCV = Z·√2·√(CVA² + CVI²), with analytical imprecision CVA set to the
 * desirable 0.5 × CVI.
 */
export function referenceChangePercent(cvi: number, z: number = RCV_Z): number {
  const cva = 0.5 * cvi;
  return z * Math.SQRT2 * Math.sqrt(cva * cva + cvi * cvi);
}

export interface CbcPoint {
  timepoint: string;
  day: number;
  value: number;
  /** failed the plausibility gate: shown, never used */
  gated: boolean;
  changePercent: number | null;
  outsidePopulationRange: boolean;
  personalChange: boolean;
}

export interface CbcSeries {
  subject: string;
  sex: string;
  analyte: CbcAnalyte;
  unit: string;
  rangeMin: number;
  rangeMax: number;
  baseline: number | null;
  baselineSamples: number;
  rcvPercent: number;
  points: CbcPoint[];
  /** day-1-after-return comparison, if measured */
  returnPoint: CbcPoint | null;
  /** first later time point back within the RCV, after a flagged return change */
  recoveredBy: string | null;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function analyzeSeries(rows: readonly CbcRow[]): CbcSeries {
  const first = rows[0];
  const meta = CBC_ANALYTES[first.analyte];
  const rcvPercent = referenceChangePercent(meta.cvi);
  const isGated = (row: CbcRow) => row.value < meta.plausible[0] || row.value > meta.plausible[1];
  const preflight = rows.filter((row) => row.day < 0 && !isGated(row)).map((row) => row.value);
  const baseline = preflight.length >= 2 ? median(preflight) : null;
  const points = [...rows].sort((a, b) => a.day - b.day).map((row): CbcPoint => {
    const gated = isGated(row);
    const changePercent = baseline !== null && !gated ? ((row.value - baseline) / baseline) * 100 : null;
    return {
      timepoint: row.timepoint,
      day: row.day,
      value: row.value,
      gated,
      changePercent,
      outsidePopulationRange: !gated && (row.value < row.rangeMin || row.value > row.rangeMax),
      personalChange: row.day > 0 && changePercent !== null && Math.abs(changePercent) > rcvPercent,
    };
  });
  const returnPoint = points.find((point) => point.timepoint === 'R+1') ?? null;
  const recoveredBy = returnPoint?.personalChange
    ? points.find((point) => point.day > 1 && !point.gated && !point.personalChange)?.timepoint ?? null
    : null;
  return {
    subject: first.subject, sex: first.sex, analyte: first.analyte, unit: first.unit,
    rangeMin: first.rangeMin, rangeMax: first.rangeMax, baseline, baselineSamples: preflight.length,
    rcvPercent, points, returnPoint, recoveredBy,
  };
}

export function analyzeInspiration4(rows: readonly CbcRow[] = INSPIRATION4_ROWS) {
  const groups = new Map<string, CbcRow[]>();
  for (const row of rows) {
    const key = `${row.subject}:${row.analyte}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const series = [...groups.values()].map(analyzeSeries);
  const withReturn = series.filter((s) => s.returnPoint && !s.returnPoint.gated && s.baseline !== null);
  return {
    series,
    summary: {
      crew: new Set(series.map((s) => s.subject)).size,
      returnComparisons: withReturn.length,
      personalChanges: withReturn.filter((s) => s.returnPoint!.personalChange).length,
      populationFlags: withReturn.filter((s) => s.returnPoint!.outsidePopulationRange).length,
      hiddenInsideRange: withReturn.filter((s) => s.returnPoint!.personalChange && !s.returnPoint!.outsidePopulationRange).length,
      gatedEntries: series.flatMap((s) => s.points.filter((p) => p.gated)).length,
      recovered: withReturn.filter((s) => s.returnPoint!.personalChange && s.recoveredBy).length,
    },
  };
}
