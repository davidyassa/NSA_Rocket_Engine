#!/usr/bin/env node
/**
 * Camera heart rate vs a reference device (pulse oximeter or ECG): agreement report.
 *
 *   node scripts/validate-camera.mjs docs/validation/camera-vs-oximeter.csv
 *   node scripts/validate-camera.mjs sol-check-camera-scan-log.json [more.json …]
 *
 * CSV columns: participant,camera_bpm,reference_bpm[,device,notes]
 * Scan-log JSON: the file downloaded from the camera check, with referenceBpm filled in.
 *
 * Prints mean absolute error (MAE), bias, Bland–Altman 95% limits of agreement,
 * and the share of readings within ±3 and ±5 bpm. A commonly cited accuracy bar
 * for heart-rate meters is ANSI/AAMI EC13: within ±10% or ±5 bpm, whichever is greater.
 */
import { readFileSync } from 'node:fs';

function pairsFrom(path) {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.json')) {
    const log = JSON.parse(text);
    return (log.scans ?? []).filter((s) => Number.isFinite(s.referenceBpm)).map((s, i) => ({ id: s.id ?? `scan-${i + 1}`, camera: s.estimatedBpm, reference: s.referenceBpm }));
  }
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const keys = header.split(',').map((k) => k.trim());
  return lines.filter((l) => l.trim() && !l.startsWith('#')).map((line) => {
    const row = Object.fromEntries(line.split(',').map((v, i) => [keys[i], v.trim()]));
    return { id: row.participant, camera: Number(row.camera_bpm), reference: Number(row.reference_bpm) };
  }).filter((p) => Number.isFinite(p.camera) && Number.isFinite(p.reference));
}

const files = process.argv.slice(2);
if (!files.length) { console.error('Usage: node scripts/validate-camera.mjs <pairs.csv | scan-log.json …>'); process.exit(1); }
const pairs = files.flatMap(pairsFrom);
if (pairs.length < 2) { console.error(`Need at least 2 paired readings, found ${pairs.length}.`); process.exit(1); }
const diffs = pairs.map((p) => p.camera - p.reference);
const n = diffs.length;
const bias = diffs.reduce((s, d) => s + d, 0) / n;
const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - bias) ** 2, 0) / (n - 1));
const mae = diffs.reduce((s, d) => s + Math.abs(d), 0) / n;
const mape = pairs.reduce((s, p) => s + Math.abs(p.camera - p.reference) / p.reference, 0) / n * 100;
const within = (bpm) => (diffs.filter((d) => Math.abs(d) <= bpm).length / n) * 100;
const f = (x) => x.toFixed(1);
console.log(`Camera heart rate vs reference · ${n} paired readings`);
console.log(`  Mean absolute error      ${f(mae)} bpm  (${f(mape)}%)`);
console.log(`  Bias (camera − ref)      ${bias >= 0 ? '+' : ''}${f(bias)} bpm`);
console.log(`  95% limits of agreement  ${f(bias - 1.96 * sd)} to ${f(bias + 1.96 * sd)} bpm`);
console.log(`  Within ±3 bpm            ${f(within(3))}%`);
console.log(`  Within ±5 bpm            ${f(within(5))}%`);
console.log('');
for (const p of pairs) console.log(`  ${String(p.id).padEnd(10)} camera ${String(p.camera).padStart(4)}  ref ${String(p.reference).padStart(4)}  diff ${p.camera - p.reference >= 0 ? '+' : ''}${p.camera - p.reference}`);
