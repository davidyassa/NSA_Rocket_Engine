import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { METRIC_IDS, METRICS } from '../../contracts';
import type { DailyCheckin, MetricId, Provenance } from '../../contracts';
import { BASELINE_LOOKBACK_SOLS, MIN_BASELINE_READINGS } from '../../engine/rules';
import { TOKENS } from '../../ui/tokens';
import { buildTrendSeries } from './series';
import type { TrendPoint } from './series';
import './trends.css';

const provenanceLabels: Record<Provenance, string> = {
  synthetic_demo: 'Synthetic',
  user_entered: 'User-entered',
  nasa_archive: 'NASA archive',
  derived: 'Derived',
};

const readingFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const readingColor = TOKENS.accent;
const baselineColor = TOKENS.textSecondary;

function readingLabel(point: TrendPoint, unit: string): string {
  if (point.value !== null) return `${readingFormat.format(point.value)} ${unit}`;
  return point.hasEntryError ? 'Check entry' : 'Not measured';
}

function baselineLabel(point: TrendPoint, unit: string): string {
  return point.baseline === null ? 'Baseline not established' : `${readingFormat.format(point.baseline)} ${unit}`;
}

function TrendDot({ cx, cy, payload }: { cx?: number | null; cy?: number | null; payload?: TrendPoint }) {
  if (cx == null || cy == null || payload?.value == null) return null;
  if (payload.provenance === 'user_entered') {
    return <rect x={cx - 3.5} y={cy - 3.5} width={7} height={7} fill={readingColor}
      stroke={TOKENS.bgSurface} transform={`rotate(45 ${cx} ${cy})`} />;
  }
  return <circle cx={cx} cy={cy} r={3.2} fill={TOKENS.bgSurface} stroke={readingColor} strokeWidth={1.6} />;
}

function TrendChart({ points, metric }: { points: TrendPoint[]; metric: MetricId }) {
  const { label, unitLabel } = METRICS[metric];
  const origins = new Set(points.flatMap((point) => point.provenance ? [point.provenance] : []));
  const hasBaseline = points.some((point) => point.baseline !== null);
  const mood = metric === 'mood';

  return (
    <figure className="trend-figure" aria-label={`${label} readings and personal baseline by mission sol`}>
      <figcaption className="trend-legend">
        {Array.from(origins).map((origin) => (
          <span key={origin}>
            <span aria-hidden="true" className={`trend-key ${origin === 'user_entered' ? 'trend-key-entered' : 'trend-key-reading'}`} />
            {provenanceLabels[origin]} reading
          </span>
        ))}
        {hasBaseline && <span><span aria-hidden="true" className="trend-key trend-key-baseline" /> Personal baseline</span>}
      </figcaption>
      <div className="chart-scroll" tabIndex={0} role="region" aria-label={`${label} chart, scroll sideways on small screens`}>
      <div className="trend-chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={points} margin={{ top: 9, right: 24, bottom: 5, left: 0 }}>
            <CartesianGrid vertical={false} stroke={TOKENS.borderSubtle} strokeDasharray="3 4" />
            <XAxis dataKey="sol" minTickGap={26} tickLine={false} axisLine={{ stroke: TOKENS.borderControl }}
              tickMargin={9} tick={{ fill: TOKENS.textSecondary, fontSize: 13 }} tickFormatter={(sol: number) => `Sol ${sol}`} />
            <YAxis width={45} axisLine={false} tickLine={false} tickMargin={7} tick={{ fill: TOKENS.textSecondary, fontSize: 13 }}
              domain={mood ? [1, 5] : ['auto', 'auto']} ticks={mood ? [1, 2, 3, 4, 5] : undefined}
              tickFormatter={(value: number) => readingFormat.format(value)} />
            <Tooltip filterNull={false} cursor={{ stroke: TOKENS.borderControl, strokeDasharray: '4 3' }}
              content={({ active, label: activeSol }) => {
                const point = active && points.find(({ sol }) => sol === Number(activeSol));
                if (!point) return null;
                return (
                  <div className="trend-tooltip">
                    <strong>Sol {point.sol}</strong>
                    <span>{readingLabel(point, unitLabel)}{point.provenance && ` · ${provenanceLabels[point.provenance]}`}</span>
                    <span>Personal baseline · {baselineLabel(point, unitLabel)}</span>
                  </div>
                );
              }} />
            <Line type="linear" dataKey="baseline" name="Personal baseline" stroke={baselineColor} strokeWidth={2}
              strokeDasharray="6 5" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="linear" dataKey="value" name={label} stroke={readingColor} strokeWidth={2.5}
              dot={<TrendDot />} activeDot={{ r: 5, fill: readingColor, stroke: TOKENS.bgSurface, strokeWidth: 2 }}
              connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      </div>
      <p className="trend-chart-caption">Mission sol · {unitLabel}</p>
    </figure>
  );
}

export function Trends({ records }: { records: readonly DailyCheckin[] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryMetric = searchParams.get('metric');
  const validMetric = (queryMetric && METRIC_IDS.includes(queryMetric as MetricId)) ? (queryMetric as MetricId) : null;
  const [metric, setMetric] = useState<MetricId>(validMetric ?? 'sleep_duration');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (validMetric && validMetric !== metric) {
      setMetric(validMetric);
    }
  }, [validMetric, metric]);

  const series = useMemo(() => buildTrendSeries(metric, records), [metric, records]);
  const points = showAll ? series : series.slice(-BASELINE_LOOKBACK_SOLS);
  const latest = series.at(-1);
  const { label, unitLabel } = METRICS[metric];

  function chooseMetric(id: MetricId) {
    setMetric(id);
    setSearchParams({ metric: id });
  }

  return (
    <div className="trends-page">
      <header className="page-intro">
        <h1>Trends</h1>
        <p>Compare your check-ins with your personal baseline by mission sol.</p>
      </header>

      <fieldset className="trend-selector">
        <legend>Indicator</legend>
        <div className="trend-metrics">
          {METRIC_IDS.map((id) => (
            <label className="trend-metric" key={id}>
              <input type="radio" name="trend-metric" value={id} checked={id === metric} onChange={() => chooseMetric(id)} />
              <span>{METRICS[id].label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="panel trend-panel" aria-labelledby="trend-indicator-title">
        <div className="trend-panel-heading">
          <h2 id="trend-indicator-title">{label}</h2>
          {series.length > BASELINE_LOOKBACK_SOLS && (
            <label className="trend-range">
              <span>Range</span>
              <select value={showAll ? 'all' : 'recent'} onChange={(event) => setShowAll(event.target.value === 'all')}>
                <option value="recent">Last {BASELINE_LOOKBACK_SOLS} sols</option>
                <option value="all">All recorded sols</option>
              </select>
            </label>
          )}
        </div>

        {latest ? (
          <>
            <dl className="trend-summary" aria-live="polite">
              <div>
                <dt>Latest check-in · Sol {latest.sol}</dt>
                <dd>
                  <strong>{readingLabel(latest, unitLabel)}</strong>
                  {latest.provenance && <span className="badge">{provenanceLabels[latest.provenance]}</span>}
                </dd>
              </div>
              <div>
                <dt>Personal baseline</dt>
                <dd>
                  <strong>{baselineLabel(latest, unitLabel)}</strong>
                  {latest.baselineCount !== null && <span className="muted">{latest.baselineCount} measured sols</span>}
                </dd>
              </div>
            </dl>
            {points.some((point) => point.value !== null || point.baseline !== null) ? (
              <TrendChart points={points} metric={metric} />
            ) : <p className="trend-empty">No usable {label.toLowerCase()} readings in this range.</p>}
          </>
        ) : <p className="trend-empty">Save a check-in to start viewing trends.</p>}
      </section>

      <p className="trend-method muted">
        Each baseline is the median of at least {MIN_BASELINE_READINGS} measured sols within the previous {BASELINE_LOOKBACK_SOLS} sols.
        {' '}Missing readings appear as gaps. The baseline is a personal reference for this demo.
      </p>

      {points.length > 0 && (
        <details className="panel trend-records">
          <summary>View readings by sol <span className="muted">{points.length} sols</span></summary>
          <div className="trend-table-wrap" tabIndex={0} role="region" aria-label={`${label} readings by sol`}>
            <table className="trend-table data-table">
              <caption className="sr-only">{label} readings and personal baseline</caption>
              <thead><tr><th scope="col">Sol</th><th scope="col">Reading</th><th scope="col">Baseline</th><th scope="col">Origin</th></tr></thead>
              <tbody>
                {[...points].reverse().map((point) => (
                  <tr key={point.sol}>
                    <th scope="row">{point.sol}</th>
                    <td>{readingLabel(point, unitLabel)}</td>
                    <td>{baselineLabel(point, unitLabel)}</td>
                    <td>{point.provenance ? provenanceLabels[point.provenance] : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
