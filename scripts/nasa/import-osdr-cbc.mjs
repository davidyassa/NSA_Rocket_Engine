#!/usr/bin/env node
/**
 * Import the SpaceX Inspiration4 complete blood count (CBC) from NASA OSDR
 * (study OSD-569, file LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv).
 *
 *   node scripts/nasa/import-osdr-cbc.mjs            # download from OSDR
 *   node scripts/nasa/import-osdr-cbc.mjs --from x.csv
 *   node scripts/nasa/import-osdr-cbc.mjs --verify   # check the bundled files match
 *
 * Writes the untouched source CSV and a compact JSON fixture with provenance.
 * Values are kept exactly as published, including obvious entry errors, so the
 * app's data-quality gate can be shown working on real data.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'src', 'data', 'nasa');
const CSV_PATH = join(outDir, 'osd-569-cbc.csv');
const JSON_PATH = join(outDir, 'inspiration4-cbc.json');
const FILE = 'LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv';
const DOWNLOAD_URL = `https://osdr.nasa.gov/geode-py/ws/studies/OSD-569/download?source=datamanager&file=${FILE}`;

/** Analytes used by Sol Check, mapped to one id (female-specific rows merge into the same id). */
const ANALYTES = {
  'WHITE BLOOD CELL COUNT': 'wbc',
  'ABSOLUTE LYMPHOCYTES': 'lymphocytes',
  'ABSOLUTE NEUTROPHILS': 'neutrophils',
  HEMOGLOBIN: 'hemoglobin',
  'HEMOGLOBIN (FEMALE)': 'hemoglobin',
  'PLATELET COUNT': 'platelets',
};

function parseCsv(text) {
  const [header, ...lines] = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const keys = header.split(',');
  return lines.map((line) => Object.fromEntries(line.split(',').map((value, i) => [keys[i], value])));
}

function day(label) {
  const sign = label.startsWith('L') ? -1 : 1;
  return sign * Number(label.slice(2));
}

function build(csvText, retrievedOn) {
  const rows = parseCsv(csvText);
  const kept = rows
    .filter((row) => ANALYTES[row.ANALYTE])
    .map((row) => ({
      subject: row.SUBJECT_ID,
      sex: row.SEX,
      analyte: ANALYTES[row.ANALYTE],
      sourceAnalyte: row.ANALYTE,
      timepoint: row.TEST_DATE,
      day: day(row.TEST_DATE),
      value: Number(row.VALUE),
      rangeMin: Number(row.RANGE_MIN),
      rangeMax: Number(row.RANGE_MAX),
      unit: row.UNITS,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject) || a.analyte.localeCompare(b.analyte) || a.day - b.day);
  return {
    manifest: {
      study: 'OSD-569',
      title: 'Whole Blood Measurements from the SpaceX Inspiration4 Mission',
      file: FILE,
      studyUrl: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569',
      downloadUrl: DOWNLOAD_URL,
      retrievedOn,
      sha256: createHash('sha256').update(csvText).digest('hex'),
      sourceRowCount: rows.length,
      keptRowCount: kept.length,
      subjects: [...new Set(kept.map((r) => r.subject))],
      timepoints: [...new Set(kept.map((r) => r.timepoint))].sort((a, b) => day(a) - day(b)),
    },
    rows: kept,
  };
}

const args = process.argv.slice(2);
if (args.includes('--verify')) {
  const csv = readFileSync(CSV_PATH, 'utf8');
  const fixture = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  const rebuilt = build(csv, fixture.manifest.retrievedOn);
  const same = JSON.stringify(rebuilt) === JSON.stringify(fixture);
  console.log(same ? `OK: ${fixture.manifest.keptRowCount} rows, sha256 ${fixture.manifest.sha256.slice(0, 12)}…` : 'MISMATCH: fixture differs from CSV');
  process.exit(same ? 0 : 1);
}
const fromIndex = args.indexOf('--from');
const csvText = fromIndex >= 0
  ? readFileSync(args[fromIndex + 1], 'utf8')
  : await (await fetch(DOWNLOAD_URL)).text();
if (!csvText.startsWith('ANALYTE') && !csvText.startsWith('﻿ANALYTE')) throw new Error('Unexpected file contents from OSDR');
const fixture = build(csvText, new Date().toISOString().slice(0, 10));
writeFileSync(CSV_PATH, csvText);
writeFileSync(JSON_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Wrote ${fixture.manifest.keptRowCount} of ${fixture.manifest.sourceRowCount} rows → ${JSON_PATH}`);
