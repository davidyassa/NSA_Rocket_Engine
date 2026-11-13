import { useState } from 'react';
import { type DailyCheckin } from '../../contracts';
import { evaluateCheckin } from '../../engine';

interface WhatIfSimulatorProps {
  currentRecord: DailyCheckin;
  records: readonly DailyCheckin[];
}

export function WhatIfSimulator({ currentRecord, records }: WhatIfSimulatorProps) {
  const [hypotheticalSleep, setHypotheticalSleep] = useState<number>(7.5);
  const [hypotheticalMood, setHypotheticalMood] = useState<number>(4);

  // Construct hypothetical Sol (current + 1)
  const nextSol = currentRecord.sol + 1;
  const hypotheticalCheckin: DailyCheckin = {
    id: `what-if-sol-${nextSol}`,
    astronautId: currentRecord.astronautId,
    sol: nextSol,
    submittedAtUtc: new Date(Date.parse(currentRecord.submittedAtUtc) + 88_775_000).toISOString(),
    measurements: [
      {
        id: `what-if:sleep`,
        astronautId: currentRecord.astronautId,
        metric: 'sleep_duration',
        value: hypotheticalSleep,
        unit: 'h',
        observedAtUtc: new Date().toISOString(),
        provenance: 'derived',
      },
      {
        id: `what-if:mood`,
        astronautId: currentRecord.astronautId,
        metric: 'mood',
        value: hypotheticalMood,
        unit: 'score_1_5',
        observedAtUtc: new Date().toISOString(),
        provenance: 'derived',
      },
    ],
    symptoms: [],
    note: 'What-if deterministic projection',
  };

  const projectedAssessment = evaluateCheckin(hypotheticalCheckin, records);

  return (
    <div className="panel assessment-action what-if-panel" style={{ borderTop: '3px solid #2a9d8f' }}>
      <p className="eyebrow">D4 · Deterministic Scenario Comparison</p>
      <h3>What-If Projection (Sol {nextSol})</h3>
      <p style={{ fontSize: '0.82rem', lineHeight: 1.45, color: '#4a453e', margin: '0.3rem 0 0.6rem' }}>
        Explore how hypothetical future observations on Sol {nextSol} alter deterministic rule evaluation.
        Clearly exploratory — not a clinical forecast.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', margin: '0.6rem 0' }}>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
            Hypothetical Sleep: {hypotheticalSleep} h
          </label>
          <input
            type="range"
            min="3"
            max="10"
            step="0.5"
            value={hypotheticalSleep}
            onChange={(e) => setHypotheticalSleep(Number(e.target.value))}
            style={{ width: '100%' }}
            aria-label="Hypothetical sleep duration"
          />
        </div>

        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
            Hypothetical Mood: {hypotheticalMood} / 5
          </label>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={hypotheticalMood}
            onChange={(e) => setHypotheticalMood(Number(e.target.value))}
            style={{ width: '100%' }}
            aria-label="Hypothetical mood score"
          />
        </div>
      </div>

      <div style={{ background: '#f8f9fa', padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.82rem', marginTop: '0.5rem' }}>
        <p style={{ margin: 0 }}>
          <strong>Projected Route:</strong>{' '}
          <span
            className="badge"
            style={{
              background: projectedAssessment.recommendedTier === 'crew_medical_officer' ? '#fdf2e9' : '#eafaf1',
              color: projectedAssessment.recommendedTier === 'crew_medical_officer' ? '#d35400' : '#27ae60',
              fontWeight: 600,
            }}
          >
            {projectedAssessment.recommendedTier === 'crew_medical_officer' ? 'Crew Medical Officer' : 'Self-care'}
          </span>
        </p>
        <p style={{ margin: '0.25rem 0 0', color: '#555', fontSize: '0.78rem' }}>
          {projectedAssessment.recommendedTier === 'crew_medical_officer'
            ? 'Sustained lower trend rule would remain active across the 5-sol rolling lookback window.'
            : 'Sustained lower trend rule clears. Indicator returns within personal baseline bounds.'}
        </p>
      </div>
    </div>
  );
}
