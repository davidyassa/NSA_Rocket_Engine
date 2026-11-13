import { METRICS, type DailyCheckin, type HealthMeasurement, type Provenance } from '../../contracts';

export const provenanceLabels: Record<Provenance, string> = {
  user_entered: 'User-entered',
  synthetic_demo: 'Synthetic',
  nasa_archive: 'NASA archive',
  derived: 'Derived',
};

export const measurementSourceLabels: Record<NonNullable<HealthMeasurement['source']>, string> = {
  manual: 'Manual entry',
  validated_hardware: 'Validated hardware',
  camera_estimate: 'Camera estimate',
  self_report: 'Self-report',
  research_import: 'Research import',
  synthetic: 'Synthetic',
};

export function measurementOriginLabel(measurement: HealthMeasurement): string {
  if (measurement.synthetic || measurement.provenance === 'synthetic_demo') return 'Synthetic';
  return measurement.source ? measurementSourceLabels[measurement.source] : provenanceLabels[measurement.provenance];
}

export function formatGroundSummary(record: DailyCheckin, includeNote: boolean): string {
  const lines = [
    'Sol Check · Simulated draft for the Ground Flight Surgeon',
    `Sol ${record.sol} · Recorded check-in · ${record.submittedAtUtc}`,
  ];

  if (record.measurements.length > 0) {
    lines.push('', 'Recorded measurements');
    for (const measurement of record.measurements) {
      const metric = METRICS[measurement.metric];
      const unit = measurement.unit === metric.unit ? metric.unitLabel : measurement.unit;
      const quality = measurement.signalQuality == null ? '' : `, SQI ${Math.round(measurement.signalQuality * 100)}%`;
      lines.push(`${metric.label} — ${measurement.value} ${unit} (${measurementOriginLabel(measurement)}${quality})`);
    }
  }

  if (record.symptoms.length > 0) {
    const present = record.symptoms.filter(symptom => symptom.present).map(symptom => symptom.label);
    lines.push('', present.length ? `Reported symptoms — ${present.join(', ')}` : 'No symptoms selected in this check-in.');
  }

  if (includeNote && record.note.trim()) lines.push('', 'Recorded note', record.note);
  return lines.join('\n');
}
