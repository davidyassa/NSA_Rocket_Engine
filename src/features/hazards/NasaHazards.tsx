import { useState } from 'react';
import { NASA_FIVE_HAZARDS, type NasaHazard } from './hazardsData';
import './hazards.css';

export function NasaHazards() {
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);

  const selectedHazard = selectedHazardId
    ? NASA_FIVE_HAZARDS.find(h => h.id === selectedHazardId) ?? null
    : null;

  return (
    <div className="hazards-container">
      <header className="page-intro">
        <div>
          <p className="eyebrow">NASA Human Research Program (HRP)</p>
          <h1>The Five Hazards of Human Spaceflight</h1>
          <p className="muted">
            Deep-space exploration to Mars subjects the human organism to five interconnected
            environmental and operational stressors. Sol Check grounds every clinical indicator,
            baseline rule, and follow-up recommendation in verified NASA HRP evidence.
          </p>
        </div>
      </header>

      {/* Selected Hazard Deep Dive Banner */}
      {selectedHazard && (
        <aside
          className="hazard-card"
          style={{
            borderColor: 'var(--accent)',
            backgroundColor: 'rgba(217, 83, 79, 0.04)',
            marginBottom: '1rem',
          }}
          aria-live="polite"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="hazard-id-badge">{selectedHazard.hrpRiskId}</span>
              <h3 style={{ margin: '0.25rem 0' }}>Focus: {selectedHazard.name}</h3>
            </div>
            <button
              type="button"
              className="button button-ghost"
              style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
              onClick={() => setSelectedHazardId(null)}
            >
              Clear Focus ✕
            </button>
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
            <strong>Immediate Operational Countermeasure:</strong>{' '}
            {selectedHazard.operationalCountermeasures[0]}
          </p>
        </aside>
      )}

      {/* Five Hazards Cards Grid */}
      <div className="hazards-grid">
        {NASA_FIVE_HAZARDS.map((hazard: NasaHazard) => {
          const isSelected = selectedHazardId === hazard.id;
          return (
            <article
              key={hazard.id}
              className={`hazard-card ${isSelected ? 'selected' : ''}`}
              style={{
                borderColor: isSelected ? 'var(--accent)' : 'var(--line)',
                cursor: 'pointer',
                boxShadow: isSelected ? '0 0 0 2px var(--accent)' : undefined,
              }}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedHazardId(prev => (prev === hazard.id ? null : hazard.id))}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedHazardId(prev => (prev === hazard.id ? null : hazard.id));
                }
              }}
            >
            <div className="hazard-card-header">
              <div className="hazard-icon-title">
                <span className="hazard-icon" aria-hidden="true">
                  {hazard.symbol}
                </span>
                <div>
                  <h2 className="hazard-name">{hazard.name}</h2>
                  <span className="hazard-id-badge">{hazard.hrpRiskId}</span>
                </div>
              </div>
              <span className={`hazard-status-badge ${hazard.sol43Status.state}`}>
                {hazard.sol43Status.state.replace('_', ' ')}
              </span>
            </div>

            <p className="hazard-tagline">{hazard.tagline}</p>

            <div className="hazard-sol43-box">
              <strong>Sol 43 Mission Status</strong>
              <p>{hazard.sol43Status.summary}</p>
            </div>

            <div>
              <span className="hazard-section-title">Sol Check Indicators:</span>
              <div className="hazard-metrics-chips">
                {hazard.solCheckMetrics.map(m => (
                  <span key={m} className="hazard-metric-chip">
                    {m.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <span className="hazard-section-title">Clinical Spaceflight Impacts:</span>
              <ul className="hazard-list">
                {hazard.clinicalImpacts.map((ci, i) => (
                  <li key={i}>{ci}</li>
                ))}
              </ul>
            </div>

            <div>
              <span className="hazard-section-title">NASA Countermeasures:</span>
              <ul className="hazard-list">
                {hazard.operationalCountermeasures.map((cm, i) => (
                  <li key={i}>{cm}</li>
                ))}
              </ul>
            </div>

            <div className="hazard-ref-list">
              <span style={{ fontWeight: 600 }}>Evidence Sources:</span>
              <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1rem' }}>
                {hazard.officialReferences.map((ref, idx) => (
                  <li key={idx}>
                    {ref.link ? (
                      <a href={ref.link} target="_blank" rel="noreferrer">
                        {ref.title} ↗
                      </a>
                    ) : (
                      <span>{ref.title}</span>
                    )}{' '}
                    <span style={{ opacity: 0.75 }}>({ref.publisher})</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        );
      })}
    </div>

      {/* NASA Research-to-Action Integration Summary */}
      <section className="hazard-card" style={{ marginTop: '0.5rem' }}>
        <h3>Evidence-to-Action Architecture</h3>
        <p style={{ fontSize: '0.88rem', lineHeight: 1.5, color: '#4a453e' }}>
          Rather than functioning as a generic dashboard with arbitrary danger scores, Sol Check
          implements a deterministic pipeline:
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0' }}>
          <span className="hazard-metric-chip">1. Direct / Sensor Observation</span>
          <span>→</span>
          <span className="hazard-metric-chip">2. Signal Quality Validation</span>
          <span>→</span>
          <span className="hazard-metric-chip">3. Personal Baseline Comparison</span>
          <span>→</span>
          <span className="hazard-metric-chip">4. NASA HRP Decision Rule</span>
          <span>→</span>
          <span className="hazard-metric-chip">5. Transparent Clinical Rationale</span>
          <span>→</span>
          <span className="hazard-metric-chip">6. Handoff Package to Earth Flight Surgeon</span>
        </div>
      </section>
    </div>
  );
}
