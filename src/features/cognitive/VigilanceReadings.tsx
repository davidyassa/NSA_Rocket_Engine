import { Link } from 'react-router-dom';
import {
  MIN_VIGILANCE_BASELINE_SOLS, VIGILANCE_MODES, sessionsForSol, vigilanceBaseline, type VigilanceSession,
} from './vigilance';
import { BASELINE_LOOKBACK_SOLS } from '../../engine/rules';

const format = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

export function VigilanceReadings({ sol, history, showHistory = false }: {
  sol: number;
  history: readonly VigilanceSession[];
  showHistory?: boolean;
}) {
  const current = sessionsForSol(history, sol);
  const prior = history.filter((session) => session.sol < sol)
    .sort((a, b) => b.sol - a.sol || b.completedAt.localeCompare(a.completedAt));
  return (
    <section className="panel cognitive-arena-card vigilance-readings" aria-label={`Vigilance results for Sol ${sol}`}>
      <h2>Vigilance results · Sol {sol}</h2>
      {current.length === 0 && <p className="muted">No vigilance result saved for this sol.</p>}
      {current.map((session) => {
        const baseline = vigilanceBaseline(history, session);
        const reactionDelta = baseline && session.meanRtMs !== null ? session.meanRtMs - baseline.meanRtMs : null;
        const lapseDelta = baseline ? session.lapsesCount - baseline.lapsesCount : null;
        return (
          <article className="vigilance-result" key={session.mode}>
            <h3>{VIGILANCE_MODES[session.mode].label}</h3>
            <dl className="vigilance-metrics">
              <div><dt>Mean reaction time</dt><dd>{session.meanRtMs === null ? 'Unavailable' : `${session.meanRtMs} ms`}</dd></div>
              <div><dt>Lapses</dt><dd>{session.lapsesCount}</dd></div>
              <div><dt>Early responses</dt><dd>{session.falseStartsCount}</dd></div>
              <div><dt>Missed responses</dt><dd>{session.missedCount}</dd></div>
            </dl>
            <p className="muted">{baseline
              ? `Personal baseline from ${baseline.count} prior sols · ${format.format(baseline.meanRtMs)} ms · ${format.format(baseline.lapsesCount)} lapses`
              : `A baseline needs usable results on ${MIN_VIGILANCE_BASELINE_SOLS} of the prior ${BASELINE_LOOKBACK_SOLS} sols in this mode.`}</p>
            {reactionDelta !== null && lapseDelta !== null && <p className="muted">
              Change from baseline · {reactionDelta > 0 ? '+' : ''}{format.format(reactionDelta)} ms · {lapseDelta > 0 ? '+' : ''}{format.format(lapseDelta)} lapses
            </p>}
          </article>
        );
      })}
      {showHistory && prior.length > 0 && (
        <details>
          <summary>Earlier vigilance results ({prior.length})</summary>
          <ul className="vigilance-history">
            {prior.map((session) => (
              <li key={`${session.sol}-${session.mode}`}>
                <strong>Sol {session.sol} · {VIGILANCE_MODES[session.mode].label}</strong>
                <span>{session.meanRtMs === null ? 'No usable reaction time' : `${session.meanRtMs} ms`} · {session.lapsesCount} lapses</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!showHistory && <Link className="text-link" to="/cognitive">Open Cognitive Lab</Link>}
    </section>
  );
}
