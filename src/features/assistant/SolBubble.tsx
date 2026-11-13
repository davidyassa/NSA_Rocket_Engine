import type { ReactNode } from 'react';
import './solBubble.css';

export function SolBubble({ speaking = false, children }: { speaking?: boolean; children?: ReactNode }) {
  return (
    <span className={speaking ? 'sol-bubble is-speaking' : 'sol-bubble'} aria-hidden="true">
      <span className="sol-bubble-gradient" />
      {children}
    </span>
  );
}
