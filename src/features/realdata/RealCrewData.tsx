import { Check, Equal, PencilLine, TrendingDown, TrendingUp, Users } from 'lucide-react';
import {
  BIOLOGICAL_VARIATION_SOURCE, CBC_ANALYTES, INSPIRATION4_CSV_URL, INSPIRATION4_MANIFEST, INSPIRATION4_SOURCE,
  analyzeInspiration4, type CbcSeries,
} from '../../data/nasa/inspiration4';
import './realCrewData.css';

const number = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
const crewName = (subject: string) => `Crew ${subject.replace('C00', '')}`;

function ChangeCell({ series }: { series: CbcSeries }) {
  const point = series.returnPoint;
  if (!point || point.changePercent === null) return <span className="muted">Not measured</span>;
  const pct = point.changePercent;
  const Icon = !point.personalChange ? Equal : pct < 0 ? TrendingDown : TrendingUp;
  return (
    <span className={point.personalChange ? 'real-change is-flagged' : 'real-change'}>
      <Icon size={14} aria-hidden="true" /> {pct > 0 ? '+' : ''}{number.format(pct)}%
      {point.personalChange ? ' · exceeds threshold' : ' · within threshold'}
    </span>
  );
}

/** Sol Check's personal-baseline method tested on real Inspiration4 crew blood counts. */
export function RealCrewData() {
  const { series, summary } = analyzeInspiration4();
  const compared = series.filter((s) => s.returnPoint && s.baseline !== null && !s.returnPoint.gated);
  const flagged = compared.filter((s) => s.returnPoint!.personalChange);
  const gated = series.flatMap((s) => s.points.filter((p) => p.gated).map((p) => ({ s, p })));

  return (
    <section className="panel real-crew" aria-labelledby="real-crew-heading">
      <div className="demo-data-heading">
        <span className="demo-data-icon"><Users size={20} aria-hidden="true" /></span>
        <h2 id="real-crew-heading">Tested on real astronaut data</h2>
        <span className="badge origin-archive">NASA OSDR</span>
      </div>
      <p className="real-crew-lead">
        This analysis compares each crew member’s published blood counts on the day after return with the median of their usable preflight
        samples and the study lab’s reference ranges. It uses NASA OSDR study {INSPIRATION4_MANIFEST.study} for the four SpaceX Inspiration4 crew members.
      </p>
      <dl className="real-crew-stats">
        <div><dt>Outside the lab’s normal range</dt><dd>{summary.populationFlags} of {summary.returnComparisons}</dd></div>
        <div><dt>Above the personal-change threshold</dt><dd>{summary.personalChanges} of {summary.returnComparisons}</dd></div>
        <div><dt>Within the threshold at a later visit</dt><dd>{summary.recovered} of {summary.personalChanges}</dd></div>
        <div><dt>Values excluded by the plausibility check</dt><dd>{summary.gatedEntries}</dd></div>
      </dl>
      <p className="real-crew-takeaway">
        All {summary.returnComparisons} day-after-return values were inside the lab’s reference ranges. The personal comparisons flagged
        {' '}{summary.personalChanges} drops in immune-cell counts. The table shows when each flagged count was first back within its threshold.
      </p>

      <div className="real-crew-table" tabIndex={0} role="region" aria-label="Changes found against personal baselines">
        <table className="data-table">
          <caption>Day after return (R+1) compared with each person’s pre-flight median</caption>
          <thead>
            <tr><th scope="col">Crew</th><th scope="col">Measure</th><th scope="col">Usual</th><th scope="col">R+1</th><th scope="col">Change</th><th scope="col">Lab range</th><th scope="col">Back within threshold</th></tr>
          </thead>
          <tbody>
            {flagged.map((s) => (
              <tr key={`${s.subject}-${s.analyte}`}>
                <th scope="row">{crewName(s.subject)}</th>
                <td>{CBC_ANALYTES[s.analyte].label}</td>
                <td className="tabular">{number.format(s.baseline!)}</td>
                <td className="tabular">{number.format(s.returnPoint!.value)}</td>
                <td><ChangeCell series={s} /></td>
                <td><span className="real-range"><Check size={14} aria-hidden="true" /> Inside {number.format(s.rangeMin)}–{number.format(s.rangeMax)}</span></td>
                <td>{s.recoveredBy ?? 'Not observed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="real-crew-details">
        <summary>All {compared.length} comparisons, excluded values and method</summary>
        <div className="real-crew-table" tabIndex={0} role="region" aria-label="All comparisons">
          <table className="data-table">
            <thead><tr><th scope="col">Crew</th><th scope="col">Measure</th><th scope="col">Usual</th><th scope="col">R+1</th><th scope="col">Change</th><th scope="col">Allowed variation</th></tr></thead>
            <tbody>
              {compared.map((s) => (
                <tr key={`${s.subject}-${s.analyte}-all`}>
                  <th scope="row">{crewName(s.subject)}</th>
                  <td>{CBC_ANALYTES[s.analyte].label}</td>
                  <td className="tabular">{number.format(s.baseline!)} {s.unit}</td>
                  <td className="tabular">{number.format(s.returnPoint!.value)}</td>
                  <td><ChangeCell series={s} /></td>
                  <td className="tabular">±{number.format(s.rcvPercent)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Values excluded by the plausibility check</h3>
        <ul>
          {gated.map(({ s, p }) => (
            <li key={`${s.subject}-${s.analyte}-${p.timepoint}`}>
              <PencilLine size={14} aria-hidden="true" /> {crewName(s.subject)} · {CBC_ANALYTES[s.analyte].label} at {p.timepoint}: {p.value} {s.unit} fell
              outside the app’s plausibility range and was excluded from the analysis.
            </li>
          ))}
        </ul>
        <h3>Method</h3>
        <p>
          The analysis flags changes larger than the reference change value (RCV = 1.65 × √2 × √(CVA² + CVI²)). It uses published
          within-person variation CVI and models analytical imprecision as CVA = 0.5 × CVI. This is an exploratory comparison of four crew members
          on a three-day flight.
        </p>
        <ul className="real-crew-sources">
          <li><a href={INSPIRATION4_SOURCE.url ?? undefined} target="_blank" rel="noreferrer">{INSPIRATION4_SOURCE.title}</a> · retrieved {INSPIRATION4_SOURCE.retrievedOn}</li>
          <li><a href={BIOLOGICAL_VARIATION_SOURCE.url ?? undefined} target="_blank" rel="noreferrer">{BIOLOGICAL_VARIATION_SOURCE.title}</a></li>
          <li><a href={INSPIRATION4_CSV_URL} download="osd-569-inspiration4-cbc.csv">Download the original OSDR file</a> · SHA-256 {INSPIRATION4_MANIFEST.sha256.slice(0, 16)}…</li>
        </ul>
      </details>
    </section>
  );
}
