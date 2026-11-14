import { ShieldCheck, Siren } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { EmergencyAlert } from './dialogue';
import './emergencyMode.css';

/** The buffering dots after "Contacting Medical Officer", in this order. */
export const CONTACT_DOTS = ['...', '.', '..'] as const;

/**
 * Emergency Mode: a red-framed island over every tab while the crew medical officer is
 * being called. Sol's bubble stays above it, so voice keeps working. When the crew says
 * they are safe it turns green (safe mode): only "All good", which closes Sol's islands.
 */
export function EmergencyMode({ alert, onSafe, onAllGood }: { alert: EmergencyAlert & { safe?: boolean }; onSafe: () => void; onAllGood: () => void }) {
  const [dot, setDot] = useState(0);
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setDot((i) => (i + 1) % CONTACT_DOTS.length), 450);
    return () => window.clearInterval(timer);
  }, []);
  const allGood = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
    document.documentElement.classList.add('emergency-active');
    return () => document.documentElement.classList.remove('emergency-active');
  }, []);
  useEffect(() => { if (alert.safe) allGood.current?.focus({ preventScroll: true }); }, [alert.safe]);

  if (alert.safe) {
    return (
      <>
        <div className="emergency-backdrop is-safe" aria-hidden="true" />
        <section ref={box} className="emergency-mode is-safe" role="dialog" aria-labelledby="emergency-title" tabIndex={-1}>
          <header className="emergency-head">
            <ShieldCheck size={22} aria-hidden="true" />
            <h2 id="emergency-title">Safe Mode</h2>
          </header>
          <div className="emergency-core">
            <button ref={allGood} type="button" className="emergency-all-good" onClick={onAllGood}>All good</button>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="emergency-backdrop" aria-hidden="true" />
      <section ref={box} className="emergency-mode" role="alertdialog" aria-labelledby="emergency-title" aria-describedby="emergency-status" tabIndex={-1}>
        <header className="emergency-head">
          <Siren size={22} aria-hidden="true" />
          <h2 id="emergency-title">Emergency Mode</h2>
        </header>

        <div className="emergency-core">
          <p id="emergency-status" className="emergency-contacting">
            Contacting Medical Officer<span className="emergency-dots" aria-hidden="true">{CONTACT_DOTS[dot]}</span>
          </p>
          {alert.room && <p className="emergency-muster" role="status">All crewmates to {alert.room}</p>}
        </div>

        <div className="emergency-steps">
          <p className="emergency-label">{alert.label}</p>
          <ol start={alert.stepStart}>
            {alert.steps.map((step, i) => <li key={`${alert.stepStart + i}`}>{step}</li>)}
          </ol>
        </div>

        <footer className="emergency-foot">
          <button type="button" className="emergency-end" onClick={onSafe}>We’re safe</button>
          <span>Or say “Hey Sol, we’re safe”.</span>
        </footer>
      </section>
    </>
  );
}
