import { useMemo, useState } from 'react';
import {
  ArrowRight, Box, HeartPulse, PersonStanding, Moon, Smile, Stethoscope, Thermometer, Waves,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { HEALTH_DOMAINS, type DailyCheckin, type HealthDomain, type RiskAssessment } from '../../contracts';
import { STATUS_META } from '../../ui/tokens';
import { PLAIN_DOMAIN, PLAIN_STATUS } from '../../content/plainLanguage';
import { CrewBody3D, type DomainSummary } from './CrewBody3D';

export const DOMAIN_TARGETS: Record<HealthDomain, { path: string; label: string; region: string; shortcut: string }> = {
  behavioral: { path: '/trends?metric=mood', label: PLAIN_DOMAIN.behavioral, region: 'Head (mind & mood)', shortcut: 'Head' },
  sleep: { path: '/trends?metric=sleep_duration', label: PLAIN_DOMAIN.sleep, region: 'Head (rest & sleep)', shortcut: 'Visor' },
  cardiovascular: { path: '/trends?metric=heart_rate', label: PLAIN_DOMAIN.cardiovascular, region: 'Chest (heart & pressure)', shortcut: 'Chest' },
  temperature: { path: '/trends?metric=body_temp', label: PLAIN_DOMAIN.temperature, region: 'Torso (core temp)', shortcut: 'Torso' },
  metabolic: { path: '/trends?metric=blood_glucose', label: PLAIN_DOMAIN.metabolic, region: 'Abdomen (blood glucose)', shortcut: 'Abdomen' },
  symptoms: { path: '/assessment', label: PLAIN_DOMAIN.symptoms, region: 'Systemic (reported symptoms)', shortcut: 'Limbs' },
};

const domainIcons = {
  behavioral: Smile,
  sleep: Moon,
  cardiovascular: HeartPulse,
  temperature: Thermometer,
  metabolic: Waves,
  symptoms: Stethoscope,
};

const statusLabels = STATUS_META;

export function CrewBodyFigure({
  latest,
  assessment,
  domainReading,
}: {
  latest: DailyCheckin | null;
  assessment: RiskAssessment | null;
  domainReading: (domain: HealthDomain, latest: DailyCheckin | null) => string;
}) {
  const navigate = useNavigate();
  const [activeDomain, setActiveDomain] = useState<HealthDomain | null>(null);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [fallbackReason, setFallbackReason] = useState('');

  const summaries = useMemo(() => Object.fromEntries(HEALTH_DOMAINS.map((domain) => [domain, {
    label: DOMAIN_TARGETS[domain].label,
    value: domainReading(domain, latest),
    status: assessment?.domainStatuses[domain] ?? 'not_measured',
  }])) as Record<HealthDomain, DomainSummary>, [latest, assessment, domainReading]);
  const heartRate = latest?.measurements.find((m) => m.metric === 'heart_rate')?.value ?? null;

  const domainOrder: HealthDomain[] = [
    'behavioral',
    'sleep',
    'cardiovascular',
    'temperature',
    'metabolic',
    'symptoms',
  ];

  return (
    <section className="panel crew-figure-card" aria-labelledby="crew-figure-heading">
      <div className="crew-figure-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 id="crew-figure-heading" className="crew-figure-title">
            {viewMode === '3d' ? 'Crew digital twin' : 'Crew body map'}
          </h2>
          <p className="crew-figure-subtitle">
            {viewMode === '3d'
              ? 'Rotate the suit and select a region to open its readings. Marker colour, icon and label show status.'
              : 'Select a body region or a row to open its readings.'}
          </p>
        </div>

        <div className="segmented figure-mode-toggle" role="group" aria-label="Figure view">
          <button type="button" onClick={() => setViewMode('3d')} aria-pressed={viewMode === '3d'} disabled={Boolean(fallbackReason)}>
            <Box size={15} aria-hidden="true" /> 3D model
          </button>
          <button type="button" onClick={() => setViewMode('2d')} aria-pressed={viewMode === '2d'}>
            <PersonStanding size={15} aria-hidden="true" /> 2D view
          </button>
        </div>
      </div>
      {fallbackReason && (
        <p className="crew-figure-fallback" role="status">3D view unavailable: {fallbackReason} Showing the 2D body map.</p>
      )}

      <div className="crew-figure-layout">
        <div className={`crew-figure-visual-wrap is-${viewMode}`} role="group" aria-label="Crew figure with 6 selectable health regions">
          {viewMode === '3d' ? (
            <CrewBody3D
              activeDomain={activeDomain}
              summaries={summaries}
              heartRate={heartRate}
              onHoverDomain={setActiveDomain}
              onSelectDomain={(domain) => navigate(DOMAIN_TARGETS[domain].path)}
              onUnavailable={(reason) => {
                setFallbackReason(reason);
                setViewMode('2d');
              }}
            />
          ) : (
            <svg
              className="crew-figure-svg"
              viewBox="0 0 200 320"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="false"
              role="presentation"
            >
            {/* Background body silhouette */}
            <g className="crew-figure-silhouette">
              {/* Head / Helmet */}
              <ellipse cx="100" cy="38" rx="24" ry="28" className="silhouette-base" />
              {/* Neck */}
              <path d="M92 64 H108 V74 H92 Z" className="silhouette-base" />
              {/* Torso & Shoulders */}
              <path
                d="M62 78 C70 73, 90 72, 100 72 C110 72, 130 73, 138 78 L142 120 C140 145, 128 165, 122 170 H78 C72 165, 60 145, 58 120 Z"
                className="silhouette-base"
              />
              {/* Arms */}
              <path
                d="M58 82 L38 140 C35 155, 33 175, 35 195 C37 200, 43 200, 45 195 L56 150 L60 110"
                className="silhouette-limb"
              />
              <path
                d="M142 82 L162 140 C165 155, 167 175, 165 195 C163 200, 157 200, 155 195 L144 150 L140 110"
                className="silhouette-limb"
              />
              {/* Legs */}
              <path
                d="M80 170 L74 240 L70 295 C69 303, 81 306, 85 298 L92 240 L97 185"
                className="silhouette-limb"
              />
              <path
                d="M120 170 L126 240 L130 295 C131 303, 119 306, 115 298 L108 240 L103 185"
                className="silhouette-limb"
              />
            </g>

            {/* Interactive Regions as focusable SVG links/buttons */}
            {/* 1. Behavioral (Mind/Forehead) */}
            <g
              role="button"
              tabIndex={0}
              className={`figure-region-target ${activeDomain === 'behavioral' ? 'is-active' : ''}`}
              aria-label={`Behavioral health region: Head. Status: ${statusLabels[assessment?.domainStatuses.behavioral ?? 'not_measured'].label}. Value: ${domainReading('behavioral', latest)}`}
              onClick={() => navigate(DOMAIN_TARGETS.behavioral.path)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(DOMAIN_TARGETS.behavioral.path); } }}
              onMouseEnter={() => setActiveDomain('behavioral')}
              onMouseLeave={() => setActiveDomain(null)}
              onFocus={() => setActiveDomain('behavioral')}
              onBlur={() => setActiveDomain(null)}
            >
              <ellipse cx="100" cy="27" rx="16" ry="11" className="region-shape region-behavioral" />
              <circle cx="100" cy="27" r="3.5" className="region-pin" />
            </g>

            {/* 2. Sleep (Visor / Eyes) */}
            <g
              role="button"
              tabIndex={0}
              className={`figure-region-target ${activeDomain === 'sleep' ? 'is-active' : ''}`}
              aria-label={`Sleep region: Visor. Status: ${statusLabels[assessment?.domainStatuses.sleep ?? 'not_measured'].label}. Value: ${domainReading('sleep', latest)}`}
              onClick={() => navigate(DOMAIN_TARGETS.sleep.path)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(DOMAIN_TARGETS.sleep.path); } }}
              onMouseEnter={() => setActiveDomain('sleep')}
              onMouseLeave={() => setActiveDomain(null)}
              onFocus={() => setActiveDomain('sleep')}
              onBlur={() => setActiveDomain(null)}
            >
              <rect x="85" y="42" width="30" height="12" rx="6" className="region-shape region-sleep" />
              <circle cx="100" cy="48" r="3.5" className="region-pin" />
            </g>

            {/* 3. Cardiovascular (Chest / Heart) */}
            <g
              role="button"
              tabIndex={0}
              className={`figure-region-target ${activeDomain === 'cardiovascular' ? 'is-active' : ''}`}
              aria-label={`Cardiovascular region: Chest. Status: ${statusLabels[assessment?.domainStatuses.cardiovascular ?? 'not_measured'].label}. Value: ${domainReading('cardiovascular', latest)}`}
              onClick={() => navigate(DOMAIN_TARGETS.cardiovascular.path)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(DOMAIN_TARGETS.cardiovascular.path); } }}
              onMouseEnter={() => setActiveDomain('cardiovascular')}
              onMouseLeave={() => setActiveDomain(null)}
              onFocus={() => setActiveDomain('cardiovascular')}
              onBlur={() => setActiveDomain(null)}
            >
              <circle cx="92" cy="94" r="14" className="region-shape region-cardio" />
              <circle cx="92" cy="94" r="4" className="region-pin" />
            </g>

            {/* 4. Temperature (Upper Torso Core) */}
            <g
              role="button"
              tabIndex={0}
              className={`figure-region-target ${activeDomain === 'temperature' ? 'is-active' : ''}`}
              aria-label={`Temperature region: Torso core. Status: ${statusLabels[assessment?.domainStatuses.temperature ?? 'not_measured'].label}. Value: ${domainReading('temperature', latest)}`}
              onClick={() => navigate(DOMAIN_TARGETS.temperature.path)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(DOMAIN_TARGETS.temperature.path); } }}
              onMouseEnter={() => setActiveDomain('temperature')}
              onMouseLeave={() => setActiveDomain(null)}
              onFocus={() => setActiveDomain('temperature')}
              onBlur={() => setActiveDomain(null)}
            >
              <rect x="110" y="86" width="16" height="22" rx="4" className="region-shape region-temperature" />
              <circle cx="118" cy="97" r="3.5" className="region-pin" />
            </g>

            {/* 5. Metabolic (Abdomen) */}
            <g
              role="button"
              tabIndex={0}
              className={`figure-region-target ${activeDomain === 'metabolic' ? 'is-active' : ''}`}
              aria-label={`Metabolic region: Abdomen. Status: ${statusLabels[assessment?.domainStatuses.metabolic ?? 'not_measured'].label}. Value: ${domainReading('metabolic', latest)}`}
              onClick={() => navigate(DOMAIN_TARGETS.metabolic.path)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(DOMAIN_TARGETS.metabolic.path); } }}
              onMouseEnter={() => setActiveDomain('metabolic')}
              onMouseLeave={() => setActiveDomain(null)}
              onFocus={() => setActiveDomain('metabolic')}
              onBlur={() => setActiveDomain(null)}
            >
              <ellipse cx="100" cy="138" rx="20" ry="14" className="region-shape region-metabolic" />
              <circle cx="100" cy="138" r="3.5" className="region-pin" />
            </g>

            {/* 6. Symptoms (Systemic / Wrists & Limbs) */}
            <g
              role="button"
              tabIndex={0}
              className={`figure-region-target ${activeDomain === 'symptoms' ? 'is-active' : ''}`}
              aria-label={`Symptoms region: Systemic & limbs. Status: ${statusLabels[assessment?.domainStatuses.symptoms ?? 'not_measured'].label}. Value: ${domainReading('symptoms', latest)}`}
              onClick={() => navigate(DOMAIN_TARGETS.symptoms.path)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(DOMAIN_TARGETS.symptoms.path); } }}
              onMouseEnter={() => setActiveDomain('symptoms')}
              onMouseLeave={() => setActiveDomain(null)}
              onFocus={() => setActiveDomain('symptoms')}
              onBlur={() => setActiveDomain(null)}
            >
              <circle cx="38" cy="190" r="8" className="region-shape region-symptoms" />
              <circle cx="162" cy="190" r="8" className="region-shape region-symptoms" />
              <circle cx="38" cy="190" r="3" className="region-pin" />
              <circle cx="162" cy="190" r="3" className="region-pin" />
            </g>
          </svg>
        )}
      </div>

        {/* Keyboard-accessible list of domain controls with visible focus and non-color status labels */}
        <div className="crew-figure-controls" role="navigation" aria-label="Health domains by body region">
          <ul className="crew-figure-list">
            {domainOrder.map((domain) => {
              const { path, label, region } = DOMAIN_TARGETS[domain];
              const Icon = domainIcons[domain];
              const status = statusLabels[assessment?.domainStatuses[domain] ?? 'not_measured'];
              const value = domainReading(domain, latest);
              const isHovered = activeDomain === domain;

              return (
                <li key={domain} className="crew-figure-item">
                  <Link
                    to={path}
                    className={`crew-figure-link ${isHovered ? 'is-active' : ''}`}
                    onMouseEnter={() => setActiveDomain(domain)}
                    onMouseLeave={() => setActiveDomain(null)}
                    onFocus={() => setActiveDomain(domain)}
                    onBlur={() => setActiveDomain(null)}
                    aria-label={`${label} (${region}): ${value}. Status: ${status.label}. Select to view details.`}
                  >
                    <div className="crew-figure-link-main">
                      <span className="domain-icon" aria-hidden="true">
                        <Icon size={16} strokeWidth={1.8} />
                      </span>
                      <div className="crew-figure-link-text">
                        <div className="crew-figure-link-title">
                          <strong>{label}</strong>
                          <span className="crew-figure-region-tag">{region}</span>
                        </div>
                        <p className="crew-figure-reading-val">{value}</p>
                        <p className="crew-figure-plain">{PLAIN_STATUS[assessment?.domainStatuses[domain] ?? 'not_measured']}</p>
                      </div>
                    </div>

                    <div className="crew-figure-link-aside">
                      {/* Explicit text status label that works without color */}
                      <span className={`domain-status status-${status.tone} crew-figure-status`}>
                        <status.Icon size={13} aria-hidden="true" />
                        <span>{status.label}</span>
                      </span>
                      <ArrowRight size={15} className="crew-figure-arrow" aria-hidden="true" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
