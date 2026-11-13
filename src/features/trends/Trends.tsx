import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { METRIC_IDS, METRICS } from '../../contracts';
import type { DailyCheckin, MetricId, Provenance } from '../../contracts';
import { BASELINE_LOOKBACK_SOLS, MIN_BASELINE_READINGS } from '../../engine/rules';
import { TOKENS } from '../../ui/tokens';
import { buildTrendSeries } from './series';
import type { TrendPoint } from './series';
import { VigilanceReadings } from '../cognitive/VigilanceReadings';
import type { VigilanceSession } from '../cognitive/vigilance';
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

type ChartIndicator = MetricId | 'symptoms';

function chartLabels(metric: ChartIndicator) {
  return metric === 'symptoms' ? { label: 'Reported symptoms', unitLabel: 'reported' } : METRICS[metric];
}

function TrendChart({ points, metric }: { points: TrendPoint[]; metric: ChartIndicator }) {
  const { label, unitLabel } = chartLabels(metric);
  const origins = new Set(points.flatMap((point) => point.provenance ? [point.provenance] : []));
  const hasBaseline = points.some((point) => point.baseline !== null);
  const mood = metric === 'mood';

  return (
    <figure className="trend-figure" aria-label={`${label} by mission sol`}>
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
                    {metric !== 'symptoms' && <span>Personal baseline · {baselineLabel(point, unitLabel)}</span>}
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

const indicators = [...METRIC_IDS, 'symptoms', 'vigilance'] as const;
type Indicator = (typeof indicators)[number];

/** Categories group the existing indicators by their health domain; no new charts. */
export const TREND_CATEGORIES = [
  { id: 'cardiovascular', label: 'Cardiovascular' },
  { id: 'metabolic', label: 'Metabolic & physical' },
  { id: 'wellbeing', label: 'Sleep & wellbeing' },
] as const;
export type TrendCategory = (typeof TREND_CATEGORIES)[number]['id'];

export function trendCategoryOf(indicator: Indicator): TrendCategory {
  if (indicator === 'symptoms' || indicator === 'vigilance') return 'wellbeing';
  switch (METRICS[indicator].domain) {
    case 'cardiovascular': return 'cardiovascular';
    case 'metabolic':
    case 'temperature': return 'metabolic';
    default: return 'wellbeing';
  }
}

export function indicatorsInCategory(category: TrendCategory): Indicator[] {
  return indicators.filter((id) => trendCategoryOf(id) === category);
}

/** Arrow / Home / End index for a horizontal tab list (wraps around). */
function nextTabIndex(key: string, index: number, count: number): number | undefined {
  const last = count - 1;
  return new Map([
    ['ArrowLeft', index === 0 ? last : index - 1],
    ['ArrowRight', index === last ? 0 : index + 1],
    ['Home', 0],
    ['End', last],
  ]).get(key);
}

function IndicatorTrend({ metric, records, showAll, setShowAll }: {
  metric: ChartIndicator;
  records: readonly DailyCheckin[];
  showAll: boolean;
  setShowAll: (value: boolean) => void;
}) {
  const series = useMemo(() => buildTrendSeries(metric, records), [metric, records]);
  const points = showAll ? series : series.slice(-BASELINE_LOOKBACK_SOLS);
  const latest = series.at(-1);
  const { label, unitLabel } = chartLabels(metric);

  return (
    <>
      <section className="panel trend-panel" aria-label={label}>
        <div className="trend-panel-heading">
          <h2>{label}</h2>
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
              {metric !== 'symptoms' && <div>
                <dt>Personal baseline</dt>
                <dd>
                  <strong>{baselineLabel(latest, unitLabel)}</strong>
                  {latest.baselineCount !== null && <span className="muted">{latest.baselineCount} measured sols</span>}
                </dd>
              </div>}
            </dl>
            {points.some((point) => point.value !== null || point.baseline !== null) ? (
              <TrendChart points={points} metric={metric} />
            ) : <p className="trend-empty">No usable {label.toLowerCase()} readings in this range.</p>}
          </>
        ) : <p className="trend-empty">Save a check-in to start viewing trends.</p>}
      </section>

      {metric === 'symptoms' ? (
        <p className="trend-method muted">Counts come from the symptom review in each check-in. Missing reviews appear as gaps.</p>
      ) : <p className="trend-method muted">
        Each baseline is the median of at least {MIN_BASELINE_READINGS} measured sols within the previous {BASELINE_LOOKBACK_SOLS} sols.
        {' '}Missing readings appear as gaps. The baseline is a personal reference for this demo.
      </p>}
    </>
  );
}

export function Trends({ records, vigilance, sol }: {
  records: readonly DailyCheckin[];
  vigilance: readonly VigilanceSession[];
  sol: number;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryMetric = searchParams.get('metric');
  const metric = indicators.find((id) => id === queryMetric) ?? 'sleep_duration';
  const [showAll, setShowAll] = useState(false);
  const tabs = useRef<HTMLDivElement>(null);
  const categoryTabs = useRef<HTMLDivElement>(null);
  // The selected indicator (URL) decides the category, so deep links like ?metric=mood still work.
  const category = trendCategoryOf(metric);
  const categoryIndicators = useMemo(() => indicatorsInCategory(category), [category]);

  useEffect(() => {
    const list = tabs.current;
    const selected = list?.querySelector('[aria-selected="true"]');
    if (!list || !selected) return;
    const tab = selected.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    if (tab.left < viewport.left) list.scrollLeft += tab.left - viewport.left;
    if (tab.right > viewport.right) list.scrollLeft += tab.right - viewport.right;
  }, [metric]);

  function chooseMetric(id: Indicator) {
    if (id !== metric) setSearchParams({ metric: id });
  }

  function chooseCategory(id: TrendCategory) {
    if (id !== category) chooseMetric(indicatorsInCategory(id)[0]);
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = nextTabIndex(event.key, index, categoryIndicators.length);
    if (nextIndex === undefined) return;
    event.preventDefault();
    tabs.current?.querySelectorAll('button')[nextIndex]?.focus({ preventScroll: true });
    chooseMetric(categoryIndicators[nextIndex]);
  }

  function handleCategoryKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = nextTabIndex(event.key, index, TREND_CATEGORIES.length);
    if (nextIndex === undefined) return;
    event.preventDefault();
    categoryTabs.current?.querySelectorAll('button')[nextIndex]?.focus({ preventScroll: true });
    chooseCategory(TREND_CATEGORIES[nextIndex].id);
  }

  return (
    <div className="trends-page">
      <header className="page-intro">
        <h1>Trends</h1>
        <p>Compare your check-ins with your personal baseline by mission sol.</p>
      </header>

      <div className="trend-categories" role="tablist" aria-label="Trend categories" ref={categoryTabs}>
        {TREND_CATEGORIES.map(({ id, label }, index) => (
          <button
            type="button"
            className="trend-category"
            id={`trend-category-${id}`}
            key={id}
            role="tab"
            aria-selected={id === category}
            aria-controls="trend-category-panel"
            tabIndex={id === category ? 0 : -1}
            onClick={() => chooseCategory(id)}
            onKeyDown={(event) => handleCategoryKey(event, index)}
          >
            {label}
          </button>
        ))}
      </div>

      <div id="trend-category-panel" role="tabpanel" aria-labelledby={`trend-category-${category}`}>
      <div className="trend-tabs" role="tablist" aria-label="Health indicators" ref={tabs}>
        {categoryIndicators.map((id, index) => (
          <button
            type="button"
            className="trend-tab"
            id={`trend-tab-${id}`}
            key={id}
            role="tab"
            aria-selected={id === metric}
            aria-controls="trend-panel"
            tabIndex={id === metric ? 0 : -1}
            onClick={() => chooseMetric(id)}
            onKeyDown={(event) => handleTabKey(event, index)}
          >
            {id === 'vigilance' ? 'Vigilance' : chartLabels(id).label}
          </button>
        ))}
      </div>

      <div id="trend-panel" role="tabpanel" aria-labelledby={`trend-tab-${metric}`} tabIndex={0}>
        {metric === 'vigilance'
          ? <VigilanceReadings sol={sol} history={vigilance} showHistory />
          : <IndicatorTrend metric={metric} records={records} showAll={showAll} setShowAll={setShowAll} />}
      </div>
      </div>
    </div>
  );
}
