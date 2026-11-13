import { useMemo, useState } from 'react';
import {
  ArrowRight, HeartPulse, Moon, Smile, Stethoscope, Thermometer, Waves,
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
      <div className="crew-figure-header">
        <h2 id="crew-figure-heading" className="crew-figure-title">Crew digital twin</h2>
        <p className="crew-figure-subtitle">Rotate the suit and select a marker to open its readings.</p>
      </div>

      <div className="crew-figure-layout">
        <div className="crew-figure-visual-wrap" role="group" aria-label="Crew figure with six selectable health regions">
          {fallbackReason ? (
            <p className="crew-figure-unavailable" role="status">3D view unavailable. {fallbackReason}</p>
          ) : (
            <CrewBody3D
              activeDomain={activeDomain}
              summaries={summaries}
              heartRate={heartRate}
              onHoverDomain={setActiveDomain}
              onSelectDomain={(domain) => navigate(DOMAIN_TARGETS[domain].path)}
              onUnavailable={setFallbackReason}
            />
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
