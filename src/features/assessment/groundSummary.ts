import { METRICS, type DailyCheckin, type Provenance } from '../../contracts';

export const provenanceLabels: Record<Provenance, string> = {
  user_entered: 'User-entered',
  synthetic_demo: 'Synthetic',
  nasa_archive: 'NASA archive',
  derived: 'Derived',
};

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
      lines.push(`${metric.label} — ${measurement.value} ${unit} (${provenanceLabels[measurement.provenance]})`);
    }
  }

  if (record.symptoms.length > 0) {
    const present = record.symptoms.filter(symptom => symptom.present).map(symptom => symptom.label);
    lines.push('', present.length ? `Reported symptoms — ${present.join(', ')}` : 'No symptoms selected in this check-in.');
  }

  if (includeNote && record.note.trim()) lines.push('', 'Recorded note', record.note);
  return lines.join('\n');
}
