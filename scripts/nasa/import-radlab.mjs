import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const instrumentId = 'MSL-RAD-Surface';
const windowStart = '2017-09-04';
const windowEndExclusive = '2017-09-18';
const eventTimestamp = '2017-09-11T08:01:51';
const hourMs = 3_600_000;
const queryUrl = 'https://visualization.osdr.nasa.gov/radlab/api/?instrument=MSL-RAD-Surface&timestamp%3E=2017-09-04&timestamp%3C2017-09-18&absorbed_dose_rate&format=csv';
const targetDir = new URL('../../src/data/nasa/', import.meta.url);
const csvPath = new URL('msl-rad-surface-2017-09.csv', targetDir);
const fixturePath = new URL('radlab-fixture.json', targetDir);

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildFixture(csv, retrievedOn) {
  const [header, ...lines] = csv.toString('utf8').trimEnd().split(/\r?\n/);
  if (header !== 'timestamp,instrument_id,absorbed_dose_rate,instrument') {
    throw new Error('Unexpected RadLab CSV columns.');
  }

  const windowStartMs = Date.parse(windowStart);
  const windowEndMs = Date.parse(windowEndExclusive);
  const readings = [];
  const timestamps = new Set();
  for (const [index, line] of lines.entries()) {
    const match = /^"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})","MSL-RAD-Surface",([0-9]+(?:\.[0-9]+)?(?:[eE][+-]?\d+)?),"MSL-RAD"$/.exec(line);
    if (!match) throw new Error(`Unexpected data on CSV line ${index + 2}.`);
    const [, timestampArchive, rate] = match;
    const time = Date.parse(`${timestampArchive}Z`);
    const absorbedDoseRate = Number(rate);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== timestampArchive
      || time < windowStartMs || time >= windowEndMs || timestamps.has(time)
      || !Number.isFinite(absorbedDoseRate) || absorbedDoseRate < 0) {
      throw new Error(`Invalid or duplicate reading on CSV line ${index + 2}.`);
    }
    timestamps.add(time);
    readings.push({ timestampArchive, absorbedDoseRate, time });
  }

  readings.sort((left, right) => left.time - right.time);
  const event = readings.find(({ timestampArchive }) => timestampArchive === eventTimestamp);
  if (!event) throw new Error('The verified September 11 reading is missing from the RadLab response.');

  const buckets = new Map();
  const intervals = [];
  let longestGap = { fromTimestampArchive: '', toTimestampArchive: '', seconds: 0 };
  let peak = readings[0];

  for (const [index, reading] of readings.entries()) {
    const hour = Math.floor(reading.time / hourMs) * hourMs;
    const bucket = buckets.get(hour) ?? [];
    bucket.push(reading);
    buckets.set(hour, bucket);
    if (reading.absorbedDoseRate > peak.absorbedDoseRate) peak = reading;
    if (index === 0) continue;
    const previous = readings[index - 1];
    const seconds = (reading.time - previous.time) / 1000;
    intervals.push(seconds);
    if (seconds > longestGap.seconds) {
      longestGap = { fromTimestampArchive: previous.timestampArchive, toTimestampArchive: reading.timestampArchive, seconds };
    }
  }

  const hours = [];
  for (let time = windowStartMs; time < windowEndMs; time += hourMs) {
    const bucket = buckets.get(time);
    hours.push({
      hourStartUtc: new Date(time).toISOString(),
      timestampArchive: bucket?.[0].timestampArchive ?? null,
      endTimestampArchive: bucket?.at(-1).timestampArchive ?? null,
      absorbedDoseRate: bucket ? Number(median(bucket.map((reading) => reading.absorbedDoseRate)).toFixed(7)) : null,
      sampleCount: bucket?.length ?? 0,
    });
  }

  return {
    manifest: {
      instrumentId,
      queryUrl,
      retrievedOn,
      windowStart,
      windowEndExclusive,
      firstTimestampArchive: readings[0].timestampArchive,
      lastTimestampArchive: readings.at(-1).timestampArchive,
      rawReadingCount: readings.length,
      populatedHourCount: buckets.size,
      missingHourCount: hours.length - buckets.size,
      medianCadenceSeconds: median(intervals),
      longestGap,
      peakReading: { timestampArchive: peak.timestampArchive, absorbedDoseRate: peak.absorbedDoseRate },
      verifiedEventReading: { timestampArchive: event.timestampArchive, absorbedDoseRate: event.absorbedDoseRate },
      csvSha256: createHash('sha256').update(csv).digest('hex'),
    },
    hours,
  };
}

function fixtureJson({ manifest, hours }) {
  const rows = hours.map((row) => `    ${JSON.stringify(row)}`).join(',\n');
  return `{\n  "manifest": ${JSON.stringify(manifest, null, 2).replaceAll('\n', '\n  ')},\n  "hours": [\n${rows}\n  ]\n}\n`;
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--verify')) {
  throw new Error('Usage: node scripts/nasa/import-radlab.mjs [--verify]');
}

let fixture;
if (args[0] === '--verify') {
  const existing = await readFile(fixturePath, 'utf8');
  const { manifest } = JSON.parse(existing);
  fixture = buildFixture(await readFile(csvPath), manifest.retrievedOn);
  if (fixtureJson(fixture) !== existing) throw new Error('The bundled RadLab fixture does not match its raw CSV.');
} else {
  const response = await fetch(queryUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`RadLab download failed with HTTP ${response.status}.`);
  const csv = Buffer.from(await response.arrayBuffer());
  const retrievedOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  fixture = buildFixture(csv, retrievedOn);
  await mkdir(targetDir, { recursive: true });
  await writeFile(csvPath, csv);
  await writeFile(fixturePath, fixtureJson(fixture));
}

const { rawReadingCount, populatedHourCount, missingHourCount } = fixture.manifest;
console.log(`RadLab fixture verified: ${rawReadingCount} raw readings, ${populatedHourCount} hourly medians, ${missingHourCount} empty hours.`);
