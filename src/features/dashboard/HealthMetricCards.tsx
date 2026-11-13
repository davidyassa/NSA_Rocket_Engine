import { HeartPulse, Info, Moon, Smile, Stethoscope, Thermometer, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';
import { METRICS } from '../../contracts';
import type { DailyCheckin, HealthDomain, MetricId, RiskAssessment } from '../../contracts';
import { ORIGIN_META, STATUS_META } from '../../ui/tokens';
import { PLAIN_DOMAIN, PLAIN_STATUS } from '../../content/plainLanguage';

export const DOMAIN_INFO = {
  cardiovascular: { label: PLAIN_DOMAIN.cardiovascular, Icon: HeartPulse },
  metabolic: { label: PLAIN_DOMAIN.metabolic, Icon: Waves },
  temperature: { label: PLAIN_DOMAIN.temperature, Icon: Thermometer },
  sleep: { label: PLAIN_DOMAIN.sleep, Icon: Moon },
  behavioral: { label: PLAIN_DOMAIN.behavioral, Icon: Smile },
  symptoms: { label: PLAIN_DOMAIN.symptoms, Icon: Stethoscope },
} satisfies Record<HealthDomain, { label: string; Icon: typeof HeartPulse }>;

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

export function domainReading(domain: HealthDomain, latest: DailyCheckin | null) {
  const readings = new Map(latest?.measurements.map((measurement) => [measurement.metric, measurement]));
  const value = (metric: MetricId) => {
    const reading = readings.get(metric);
    return reading ? numberFormat.format(reading.value) : null;
  };
  const withUnit = (metric: MetricId, unit: string) => {
    const reading = value(metric);
    return reading === null ? '—' : `${reading} ${unit}`;
  };

  switch (domain) {
    case 'cardiovascular': {
      const systolic = value('bp_systolic');
      const diastolic = value('bp_diastolic');
      const heartRate = value('heart_rate');
      const pressure = systolic && diastolic ? `${systolic}/${diastolic} mmHg` : null;
      return [heartRate && `${heartRate} bpm`, pressure].filter(Boolean).join(' · ') || '—';
    }
    case 'metabolic': return withUnit('blood_glucose', 'mg/dL');
    case 'temperature': return withUnit('body_temp', '°C');
    case 'sleep': return withUnit('sleep_duration', 'h');
    case 'behavioral': return withUnit('mood', '/ 5');
    case 'symptoms': {
      if (!latest || latest.symptoms.length === 0) return '—';
      const count = latest.symptoms.filter(({ present }) => present).length;
      return count > 0 ? `${count} reported` : 'None reported';
    }
  }
}

/**
 * The Health Metrics cards (one per health domain). Rendered beside the crew
 * digital twin; hovering or focusing a card highlights its body region.
 */
export function HealthMetricCards({
  latest, assessment, order, targets, activeDomain, onHoverDomain,
}: {
  latest: DailyCheckin | null;
  assessment: RiskAssessment | null;
  order: readonly HealthDomain[];
  targets: Record<HealthDomain, { path: string; region: string }>;
  activeDomain?: HealthDomain | null;
  onHoverDomain?: (domain: HealthDomain | null) => void;
}) {
  const readings = latest?.measurements ?? [];

  return (
    <div className="domain-grid crew-figure-metrics">
      {order.map((domain) => {
        const { label, Icon } = DOMAIN_INFO[domain];
        const statusId = assessment?.domainStatuses[domain] ?? 'not_measured';
        const status = STATUS_META[statusId];
        const domainReadings = readings.filter((reading) => METRICS[reading.metric].domain === domain);
        const origins = new Set(domainReadings.map((reading) => reading.provenance));
        const { path, region } = targets[domain];
        const value = domainReading(domain, latest);
        return (
          <article
            className={`panel domain-card${activeDomain === domain ? ' is-active' : ''}`}
            key={domain}
            data-tone={status.tone}
            onMouseEnter={() => onHoverDomain?.(domain)}
            onMouseLeave={() => onHoverDomain?.(null)}
            onFocus={() => onHoverDomain?.(domain)}
            onBlur={() => onHoverDomain?.(null)}
          >
            <div className="domain-title">
              <span className="domain-icon"><Icon size={18} strokeWidth={1.75} aria-hidden="true" /></span>
              <h3>{label}</h3>
            </div>
            <p className="domain-region">{region}</p>
            <p className="domain-value">{value}</p>
            <span className={`domain-status status-${status.tone}`}><status.Icon size={14} aria-hidden="true" />{status.label}</span>
            <p className="domain-plain">{PLAIN_STATUS[statusId]}</p>
            {origins.size === 1 && (
              <span className={`${ORIGIN_META[[...origins][0]].className} domain-origin-badge`}>{ORIGIN_META[[...origins][0]].label}</span>
            )}
            {origins.size > 1 && (
              <ul className="domain-origin">
                {domainReadings.map((reading) => (
                  <li key={reading.id}>{METRICS[reading.metric].label} · <span className={ORIGIN_META[reading.provenance].className}>{ORIGIN_META[reading.provenance].label}</span></li>
                ))}
              </ul>
            )}
            <Link
              to={path}
              className="domain-info-link"
              aria-label={`${label} (${region}): ${value}. Status: ${status.label}. View details.`}
            >
              <Info size={19} aria-hidden="true" />
            </Link>
          </article>
        );
      })}
    </div>
  );
}
