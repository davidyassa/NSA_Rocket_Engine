import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HEALTH_DOMAINS, type DailyCheckin, type HealthDomain, type RiskAssessment } from '../../contracts';
import { ORIGIN_META } from '../../ui/tokens';
import { PLAIN_DOMAIN } from '../../content/plainLanguage';
import { CrewBody3D, type DomainSummary } from './CrewBody3D';
import { HealthMetricCards, domainReading } from './HealthMetricCards';

export const DOMAIN_TARGETS: Record<HealthDomain, { path: string; label: string; region: string; shortcut: string }> = {
  behavioral: { path: '/trends?metric=mood', label: PLAIN_DOMAIN.behavioral, region: 'Head (mind & mood)', shortcut: 'Head' },
  sleep: { path: '/trends?metric=sleep_duration', label: PLAIN_DOMAIN.sleep, region: 'Head (rest & sleep)', shortcut: 'Visor' },
  cardiovascular: { path: '/trends?metric=heart_rate', label: PLAIN_DOMAIN.cardiovascular, region: 'Chest (heart & pressure)', shortcut: 'Chest' },
  temperature: { path: '/trends?metric=body_temp', label: PLAIN_DOMAIN.temperature, region: 'Torso (core temp)', shortcut: 'Torso' },
  metabolic: { path: '/trends?metric=blood_glucose', label: PLAIN_DOMAIN.metabolic, region: 'Abdomen (blood glucose)', shortcut: 'Abdomen' },
  symptoms: { path: '/assessment', label: PLAIN_DOMAIN.symptoms, region: 'Systemic (reported symptoms)', shortcut: 'Limbs' },
};

/** Health Metrics card links keep their original targets (symptoms open the symptom trend). */
const CARD_TARGETS = Object.fromEntries(HEALTH_DOMAINS.map((domain) => [domain, {
  region: DOMAIN_TARGETS[domain].region,
  path: domain === 'symptoms' ? '/trends?metric=symptoms' : DOMAIN_TARGETS[domain].path,
}])) as Record<HealthDomain, { path: string; region: string }>;

export function CrewBodyFigure({
  latest,
  assessment,
}: {
  latest: DailyCheckin | null;
  assessment: RiskAssessment | null;
}) {
  const readings = latest?.measurements ?? [];
  const hasSynthetic = readings.some((reading) => reading.provenance === 'synthetic_demo');
  const hasEntered = readings.some((reading) => reading.provenance === 'user_entered');
  const navigate = useNavigate();
  const [activeDomain, setActiveDomain] = useState<HealthDomain | null>(null);
  const [fallbackReason, setFallbackReason] = useState('');

  const summaries = useMemo(() => Object.fromEntries(HEALTH_DOMAINS.map((domain) => [domain, {
    label: DOMAIN_TARGETS[domain].label,
    value: domainReading(domain, latest),
    status: assessment?.domainStatuses[domain] ?? 'not_measured',
  }])) as Record<HealthDomain, DomainSummary>, [latest, assessment]);
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
        <p className="crew-figure-subtitle">Drag to rotate the suit and select a marker or card to open its readings.</p>
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

        {/* Health Metrics cards beside the model; hover/focus highlights the matching body region. */}
        <section className="crew-figure-controls" aria-labelledby="health-metrics-heading">
          <div className="crew-figure-metrics-head">
            <h3 id="health-metrics-heading">Health metrics</h3>
            {latest && <p>From the Sol {latest.sol} check-in</p>}
            <div className="status-provenance">
              {hasSynthetic && <span className={ORIGIN_META.synthetic_demo.className}>{ORIGIN_META.synthetic_demo.label}</span>}
              {hasEntered && <span className={ORIGIN_META.user_entered.className}>{ORIGIN_META.user_entered.label}</span>}
            </div>
          </div>
          <HealthMetricCards
            latest={latest}
            assessment={assessment}
            order={domainOrder}
            targets={CARD_TARGETS}
            activeDomain={activeDomain}
            onHoverDomain={setActiveDomain}
          />
        </section>
      </div>
    </section>
  );
}
