import { ArrowUpRight, BarChart3 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { METRICS, type DailyCheckin, type MetricId } from '../../contracts';
import { ORIGIN_META } from '../../ui/tokens';
import { buildTrendSeries } from '../trends/series';

const readings = [
  { id: 'sleep_duration', label: 'Sleep' },
  { id: 'heart_rate', label: 'Resting pulse' },
  { id: 'blood_glucose', label: 'Blood sugar' },
  { id: 'mood', label: 'Mood' },
] as const satisfies readonly { id: MetricId; label: string }[];

type ChartMetric = (typeof readings)[number]['id'];
const format = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

export function RecentReadings({ records }: { records: readonly DailyCheckin[] }) {
  const [metric, setMetric] = useState<ChartMetric>('sleep_duration');
  const headingId = useId();
  const points = useMemo(() => buildTrendSeries(metric, records).slice(-5), [metric, records]);
  const latest = points.at(-1);
  const { unitLabel } = METRICS[metric];
  const hasReadings = points.some(({ value }) => value !== null);
  const maximum = metric === 'mood' ? 5 : Math.max(1, ...points.map(({ value }) => value ?? 0));

  return (
    <section className="panel recent-readings" aria-labelledby={headingId}>
      <div className="recent-readings-header">
        <div>
          <div className="chart-heading"><BarChart3 size={17} aria-hidden="true" /><h2 id={headingId}>Recent readings</h2></div>
          <p>Last {points.length || 5} sols · {metric === 'mood' ? '1–5 scale' : unitLabel}</p>
        </div>
        <div className="recent-readings-controls">
          <select aria-label="Reading to chart" value={metric} onChange={(event) => setMetric(event.target.value as ChartMetric)}>
            {readings.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
          <Link to={`/trends?metric=${metric}`} className="round-link" aria-label={`View ${METRICS[metric].label.toLowerCase()} trends`}>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
      {hasReadings ? (
        <>
          <ol className="reading-chart" aria-label={`${METRICS[metric].label} by mission sol`}>
            {points.map((point) => {
              const { value, sol, provenance, hasEntryError } = point;
              return (
                <li key={sol}>
                  <div className="reading-track" data-latest={sol === latest?.sol}>
                    {value === null
                      ? <span className="reading-missing">{hasEntryError ? 'Check entry' : 'No reading'}</span>
                      : <div className="reading-bar" style={{ height: `${(value / maximum) * 100}%` }}>
                          <strong className="reading-bar-value">{format.format(value)}<span className="sr-only"> {unitLabel}</span></strong>
                          {provenance && <span className="sr-only"> · {ORIGIN_META[provenance].label}</span>}
                        </div>}
                  </div>
                  <span className="reading-sol">Sol {sol}</span>
                </li>
              );
            })}
          </ol>
          <p className="reading-chart-source">
            {latest?.value != null && latest.provenance ? <span className={ORIGIN_META[latest.provenance].className}>{ORIGIN_META[latest.provenance].label}</span> : null}
            {latest?.value != null && <span>Latest · {format.format(latest.value)} {unitLabel} on Sol {latest.sol}</span>}
          </p>
        </>
      ) : <p className="reading-chart-empty">No usable {METRICS[metric].label.toLowerCase()} readings in this range.</p>}
    </section>
  );
}
