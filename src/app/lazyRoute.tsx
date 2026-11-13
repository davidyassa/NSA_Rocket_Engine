import { Component, lazy, type ComponentType, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

const RELOAD_KEY = 'sol-check:chunk-reload';

function readFlag(): boolean {
  try { return sessionStorage.getItem(RELOAD_KEY) === '1'; } catch { return false; }
}
function writeFlag(on: boolean) {
  try { if (on) sessionStorage.setItem(RELOAD_KEY, '1'); else sessionStorage.removeItem(RELOAD_KEY); } catch { /* storage blocked */ }
}

/**
 * React.lazy that survives a new deployment. After a rebuild, a tab that was
 * already open still asks for the old, fingerprinted chunk file (for example
 * Trends-OLDHASH.js), which no longer exists, so the page would sit on
 * "Loading…" forever. On that failure we reload once to pick up the current
 * build; if it fails again, the error boundary below shows a Reload button.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const module = await factory();
      writeFlag(false);
      return module;
    } catch (error) {
      if (!readFlag()) {
        writeFlag(true);
        window.location.reload();
        return new Promise<{ default: T }>(() => {}); // keep showing the fallback while reloading
      }
      throw error;
    }
  });
}

export class RouteErrorBoundary extends Component<{ children: ReactNode; name: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="panel route-error" role="alert">
        <h2>{this.props.name} could not open</h2>
        <p>The app was probably updated while this tab was open. Reloading fixes it; your saved check-ins are kept.</p>
        <button type="button" className="button button-primary" onClick={() => { writeFlag(false); window.location.reload(); }}>
          <RotateCcw size={16} aria-hidden="true" /> Reload
        </button>
      </section>
    );
  }
}
