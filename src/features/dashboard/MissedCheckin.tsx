import { CircleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { DailyCheckin } from '../../contracts';

const dismissedWarnings = new Set<string>();

export function missedPreviousSol(sol: number, records: readonly Pick<DailyCheckin, 'sol'>[]) {
  const previous = sol - 1;
  return previous > 0 && !records.some((record) => record.sol === previous) ? previous : null;
}

export function MissedCheckin({ scenarioId, missedSol }: { scenarioId: string; missedSol: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const warningKey = `${scenarioId}:${missedSol}`;

  useEffect(() => {
    if (!dismissedWarnings.has(warningKey) && !dialog.current?.open) dialog.current?.showModal();
  }, [warningKey]);

  return (
    <dialog
      ref={dialog}
      className="reset-dialog"
      aria-labelledby="missed-checkin-heading"
      aria-describedby="missed-checkin-description"
      onClose={() => dismissedWarnings.add(warningKey)}
    >
      <h2 id="missed-checkin-heading"><CircleAlert className="inline-icon status-change" size={20} aria-hidden="true" /> Missed check-in</h2>
      <p id="missed-checkin-description">No check-in was recorded for Sol {missedSol}.</p>
      <form method="dialog" className="dialog-actions">
        <button className="button button-primary" type="submit" autoFocus>Dismiss</button>
      </form>
    </dialog>
  );
}
