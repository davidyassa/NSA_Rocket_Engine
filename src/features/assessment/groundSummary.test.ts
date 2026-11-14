import { describe, expect, it } from 'vitest';
import type { DailyCheckin } from '../../contracts';
import { formatGroundSummary } from './groundSummary';

const submittedAtUtc = '2035-03-14T12:00:00Z';
const checkin: DailyCheckin = {
  id: 'checkin-43',
  astronautId: 'crew',
  sol: 43,
  submittedAtUtc,
  measurements: [
    { id: 'sleep', astronautId: 'crew', metric: 'sleep_duration', unit: 'h', value: 4.5, observedAtUtc: submittedAtUtc, provenance: 'synthetic_demo' },
    { id: 'mood', astronautId: 'crew', metric: 'mood', unit: 'score_1_5', value: 2, observedAtUtc: submittedAtUtc, provenance: 'user_entered' },
  ],
  symptoms: [
    { id: 'fatigue', label: 'Fatigue', present: true },
    { id: 'headache', label: 'Headache', present: false },
  ],
  note: 'Private observation',
};

describe('ground communication draft', () => {
  it('quotes the recorded check-in with units and origin, leaving out absent metrics and the private note', () => {
    const draft = formatGroundSummary(checkin, false);
    expect(draft).toContain(`Sol 43 · Recorded check-in · ${submittedAtUtc}`);
    expect(draft).toContain('Sleep duration — 4.5 h (Synthetic)');
    expect(draft).toContain('Mood — 2 of 5 (User-entered)');
    expect(draft).toContain('Reported symptoms — Fatigue');
    expect(draft).not.toMatch(/Headache|Heart rate|Private observation/);
  });

  it('includes the note only when requested and leaves unrecorded sections out', () => {
    const draft = formatGroundSummary({ ...checkin, measurements: [], symptoms: [] }, true);
    expect(draft).toContain('Recorded note\nPrivate observation');
    expect(draft).not.toMatch(/measurements|symptoms/i);
  });
});
