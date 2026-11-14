import type { EnvironmentalSample, SourceRecord } from '../../contracts';
import rawCsvUrl from './msl-rad-surface-2017-09.csv?url';
import fixture from './radlab-fixture.json';

export const RADLAB_MANIFEST = fixture.manifest;
export const RADLAB_UNIT = 'µGy/hour';

export const RADLAB_SOURCE: SourceRecord = {
  id: 'nasa-radlab-msl-rad-surface',
  title: 'RadLab · Curiosity RAD Mars surface archive',
  publisher: 'NASA Open Science Data Repository (OSDR)',
  url: 'https://visualization.osdr.nasa.gov/radlab/gui/knowledgebase/MSL-RAD-Surface',
  retrievedOn: RADLAB_MANIFEST.retrievedOn,
  supports: 'The absorbed dose rate recorded by Curiosity’s Radiation Assessment Detector at the Mars surface in September 2017.',
  doesNotSupport: 'Crew dose, habitat shielding, individual health effects or causal attribution.',
};

export const RADLAB_EVENT_SOURCE =
  'https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/';
export const RADLAB_CSV_URL = rawCsvUrl;

type HourMetadata = {
  hourStartUtc: string;
  endTimestampArchive: string;
  sampleCount: number;
};

export type RadLabHour = (EnvironmentalSample & HourMetadata) | {
  hourStartUtc: string;
  timestampArchive: null;
  endTimestampArchive: null;
  absorbedDoseRate: null;
  sampleCount: 0;
};

export const RADLAB_HOURLY: readonly RadLabHour[] = fixture.hours.map((hour) => {
  const { absorbedDoseRate, timestampArchive, endTimestampArchive, hourStartUtc, sampleCount } = hour;
  if (absorbedDoseRate === null || timestampArchive === null || endTimestampArchive === null) {
    return { hourStartUtc, absorbedDoseRate: null, timestampArchive: null, endTimestampArchive: null, sampleCount: 0 };
  }
  return {
    hourStartUtc, timestampArchive, endTimestampArchive, absorbedDoseRate, sampleCount,
    instrumentId: RADLAB_MANIFEST.instrumentId,
    sourceId: RADLAB_SOURCE.id,
    unit: 'uGy_per_h',
  };
});
