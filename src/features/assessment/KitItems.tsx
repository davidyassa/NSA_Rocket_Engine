import { Check, Clock, PackageMinus, XCircle, type LucideIcon } from 'lucide-react';
import { KIT_STATUS_TEXT, MEDICAL_KIT, kitItemStatus, kitSummary, type KitStatus } from '../../content/medicalKit';

/** Three channels for every status: icon, words and colour. */
const STATUS_LOOK: Record<KitStatus, { Icon: LucideIcon; short: string; className: string }> = {
  expired: { Icon: XCircle, short: 'Expired', className: 'kit-status kit-expired' },
  low: { Icon: PackageMinus, short: 'Running low', className: 'kit-status kit-low' },
  expires_soon: { Icon: Clock, short: 'Expires soon', className: 'kit-status kit-soon' },
  ok: { Icon: Check, short: 'Available', className: 'kit-status kit-ok' },
};

function StatusBadge({ status }: { status: KitStatus }) {
  const { Icon, short, className } = STATUS_LOOK[status];
  return <span className={className} title={KIT_STATUS_TEXT[status]}><Icon size={13} aria-hidden="true" /> {short}</span>;
}

/** Non-drug supplies a suggestion mentions, with stock and expiry. */
export function KitItemsList({ ids, currentSol }: { ids: readonly string[]; currentSol: number }) {
  const items = ids.flatMap((id) => (MEDICAL_KIT[id] ? [MEDICAL_KIT[id]] : []));
  if (!items.length) return null;
  return (
    <div className="kit-items">
      <h4>Supplies on board</h4>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span className="kit-item-name">{item.name}</span>
            <span className="kit-item-meta">{item.quantity} {item.unit} left</span>
            <StatusBadge status={kitItemStatus(item, currentSol)} />
          </li>
        ))}
      </ul>
      <p className="kit-note">No resupply from Earth, so use supplies sparingly.</p>
    </div>
  );
}

/** Full list of non-drug supplies for the Crew Medical Officer. */
export function MedicalKitTable({ currentSol }: { currentSol: number }) {
  const summary = kitSummary(currentSol);
  const order: KitStatus[] = ['expired', 'low', 'expires_soon', 'ok'];
  const rows = [...summary.items].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <section className="panel kit-panel" aria-labelledby="kit-title">
      <h2 id="kit-title">Supplies on board · Sol {currentSol}</h2>
      <p className="muted">
        No resupply from Earth: {summary.expired} expired, {summary.low} running low, {summary.expiresSoon} expiring within 30 sols.
      </p>
      <ul className="kit-grid" aria-label="Supplies on board">
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
            </dl>
            {status !== 'ok' && <p className="kit-card-why">{KIT_STATUS_TEXT[status]}</p>}
          </li>
        ))}
      </ul>
      <p className="kit-note">
        Synthetic demo inventory of food, drinks and check-up equipment. Sol Check does not list, recommend or prescribe medicines;
        any treatment is decided by the Crew Medical Officer and the flight surgeon.
      </p>
    </section>
  );
}
