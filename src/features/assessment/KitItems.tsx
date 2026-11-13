import { Check, Clock, PackageMinus, Radiation, XCircle, type LucideIcon } from 'lucide-react';
import { KIT_STATUS_TEXT, MEDICAL_KIT, kitItemStatus, kitSummary, type KitStatus } from '../../content/medicalKit';

/** Three channels for every status: icon, words and colour. */
const STATUS_LOOK: Record<KitStatus, { Icon: LucideIcon; short: string; className: string }> = {
  expired: { Icon: XCircle, short: 'Expired', className: 'kit-status kit-expired' },
  check_potency: { Icon: Radiation, short: 'Check potency', className: 'kit-status kit-potency' },
  low: { Icon: PackageMinus, short: 'Running low', className: 'kit-status kit-low' },
  expires_soon: { Icon: Clock, short: 'Expires soon', className: 'kit-status kit-soon' },
  ok: { Icon: Check, short: 'Available', className: 'kit-status kit-ok' },
};

function StatusBadge({ status }: { status: KitStatus }) {
  const { Icon, short, className } = STATUS_LOOK[status];
  return <span className={className} title={KIT_STATUS_TEXT[status]}><Icon size={13} aria-hidden="true" /> {short}</span>;
}

/** Medical-kit items an action card relies on, with stock and expiry (no doses). */
export function KitItemsList({ ids, currentSol, radiationSols }: { ids: readonly string[]; currentSol: number; radiationSols: readonly number[] }) {
  const items = ids.flatMap((id) => (MEDICAL_KIT[id] ? [MEDICAL_KIT[id]] : []));
  if (!items.length) return null;
  return (
    <div className="kit-items">
      <h4>In the medical kit</h4>
      <ul>
        {items.map((item) => {
          const status = kitItemStatus(item, currentSol, radiationSols);
          return (
            <li key={item.id}>
              <span className="kit-item-name">{item.name}{item.cmoOnly ? ' · medical officer only' : ''}</span>
              <span className="kit-item-meta">{item.quantity} {item.unit} left</span>
              <StatusBadge status={status} />
            </li>
          );
        })}
      </ul>
      <p className="kit-note">No resupply from Earth. Take medicine only as your crew medical officer advises.</p>
    </div>
  );
}

/** Full onboard inventory for the Crew Medical Officer. */
export function MedicalKitTable({ currentSol, radiationSols }: { currentSol: number; radiationSols: readonly number[] }) {
  const summary = kitSummary(currentSol, radiationSols);
  const order: KitStatus[] = ['expired', 'check_potency', 'low', 'expires_soon', 'ok'];
  const rows = [...summary.items].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <section className="panel kit-panel" aria-labelledby="kit-title">
      <h2 id="kit-title">Medical kit · Sol {currentSol}</h2>
      <p className="muted">
        No resupply and no evacuation: advice is only useful if the kit can support it. {summary.expired} expired, {summary.checkPotency} to
        check after the solar storm, {summary.low} running low, {summary.expiresSoon} expiring within 30 sols.
      </p>
      <ul className="kit-grid" aria-label="Medical kit inventory">
        {rows.map(({ item, status }) => (
          <li key={item.id} className="kit-card">
            <div className="kit-card-head">
              <strong>{item.name}</strong>
              <StatusBadge status={status} />
            </div>
            <p className="kit-card-use">{item.use}</p>
            <dl className="kit-card-facts">
              <div><dt>Left</dt><dd className="tabular">{item.quantity} {item.unit}</dd></div>
              <div><dt>Good until</dt><dd className="tabular">{item.expiresSol === null ? 'No expiry' : `Sol ${item.expiresSol}`}</dd></div>
              {item.cmoOnly && <div><dt>Given by</dt><dd>Medical officer only</dd></div>}
            </dl>
            {status !== 'ok' && <p className="kit-card-why">{KIT_STATUS_TEXT[status]}</p>}
          </li>
        ))}
      </ul>
      <p className="kit-note">
        Synthetic demo inventory. Medicines lose strength faster in space, partly from radiation, so radiation-sensitive items are flagged
        for a check after a solar particle event. Sol Check never suggests doses or substitutes; the medical officer and flight surgeon decide.
      </p>
    </section>
  );
}
