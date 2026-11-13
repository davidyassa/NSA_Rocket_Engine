import { Equal, Triangle, Wind } from 'lucide-react';
import type { HabitatSample } from '../../contracts';
import { CO2_LIMIT_MMHG } from '../../engine/rules';
import { ORIGIN_META } from '../../ui/tokens';

/** NASA links a 7-day average under 2.5 mmHg with headache risk below 1% (OCHMO-TB-004). */
const CO2_COMFORT_MMHG = 2.5;

function co2State(value: number) {
  if (value >= CO2_LIMIT_MMHG) return { label: 'Above NASA limit', tone: 'change', Icon: Triangle };
  if (value >= CO2_COMFORT_MMHG) return { label: 'Elevated', tone: 'change', Icon: Triangle };
  return { label: 'Within limit', tone: 'steady', Icon: Equal };
}

/**
 * Habitat air card: simulated life-support (ECLSS) readings for the last few sols,
 * so headaches can be read against cabin CO2 (NASA-STD-3001: 1-hour average ≤ 3 mmHg).
 */
export function HabitatAir({ environment, sol }: { environment?: readonly HabitatSample[]; sol: number }) {
  const recent = (environment ?? []).filter((s) => s.sol <= sol && s.sol > sol - 5).sort((a, b) => b.sol - a.sol);
  const today = recent[0];
  if (!today) return null;
  const state = co2State(today.co2Mmhg);
  const origin = ORIGIN_META[today.provenance];
  return (
    <article className="panel dashboard-intel-card habitat-air" aria-labelledby="habitat-air-title">
      <div className="section-title">
        <div className="flags-title">
          <span className="domain-icon"><Wind size={18} aria-hidden="true" /></span>
          <h2 id="habitat-air-title">Habitat air</h2>
        </div>
        <span className={origin.className}>{origin.label}</span>
      </div>
      <p className="habitat-air-now">
        <span className="habitat-air-value">CO2 {today.co2Mmhg.toFixed(1)} <small>mmHg</small></span>
        <span className={`domain-status status-${state.tone}`}><state.Icon size={14} aria-hidden="true" /> {state.label}</span>
      </p>
      <p className="muted habitat-air-note">
        NASA limit {CO2_LIMIT_MMHG} mmHg. Cabin {today.cabinTempC.toFixed(1)} °C. High CO2 can cause headaches and tiredness.
      </p>
      <table className="data-table habitat-air-table">
        <caption className="sr-only">Habitat CO2 and cabin temperature, last {recent.length} sols</caption>
        <thead><tr><th scope="col">Sol</th><th scope="col">CO2</th><th scope="col">Cabin</th></tr></thead>
        <tbody>
          {recent.map((sample) => (
            <tr key={sample.sol}>
              <th scope="row" className="num">{sample.sol}</th>
              <td className={`num${sample.co2Mmhg >= CO2_LIMIT_MMHG ? ' status-change' : ''}`}>{sample.co2Mmhg.toFixed(1)} mmHg</td>
              <td className="num">{sample.cabinTempC.toFixed(1)} °C</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
