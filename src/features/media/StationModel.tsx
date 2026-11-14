import { ArrowUpRight, Minus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import earthBackdrop from '../../ui/assets/nasa/earth-from-space.webp';
import type { StationAnchor, StationIncident, StationProjection, StationViewport } from './stationViewport';
import './station-model.css';

const STUDIO_PAGE = 'https://sketchfab.com/3d-models/international-space-station-iss-b7d40d89fcbd4c998462380545f391b6';
const NASA_SOURCE = 'https://science.nasa.gov/resource/international-space-station-3d-model/';

export function InteractiveStation({
  describedBy,
  anchors,
  incident,
  focusCommand,
  renderOverlay,
}: {
  describedBy: string;
  anchors?: readonly StationAnchor[];
  incident?: StationIncident | null;
  /** External "focus this anchor" signal (e.g. from Sol's voice control). */
  focusCommand?: { id: string; n: number };
  renderOverlay?: (points: StationProjection[], focusAnchor: (id: string) => void) => ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<StationViewport>(null);
  const latestIncident = useRef(incident);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [points, setPoints] = useState<StationProjection[]>([]);

  useEffect(() => {
    latestIncident.current = incident;
    viewport.current?.setIncident(incident ?? null);
  }, [incident]);

  useEffect(() => {
    if (focusCommand && status === 'ready') viewport.current?.focusAnchor(focusCommand.id);
  }, [focusCommand, status]);

  useEffect(() => {
    const element = canvas.current;
    let active = true;

    async function load() {
      try {
        const { mountStationViewport } = await import('./stationViewport');
        if (active && element) {
          viewport.current = mountStationViewport(
            element,
            setStatus,
            anchors && { anchors, onProject: setPoints },
          );
          viewport.current.setIncident(latestIncident.current ?? null);
        }
      } catch {
        if (active) setStatus('error');
      }
    }

    void load();
    return () => {
      active = false;
      viewport.current?.dispose();
      viewport.current = null;
    };
  }, [anchors]);

  const ready = status === 'ready';

  return (
    <>
      <img className="iss-backdrop" src={earthBackdrop} alt="" />
      <canvas
        className="iss-canvas"
        ref={canvas}
        data-ready={ready}
        aria-hidden={!ready}
        tabIndex={ready ? 0 : -1}
        aria-label="NASA International Space Station 3D model"
        aria-describedby={describedBy}
      />
      {ready ? (
        <div className="iss-controls" role="group" aria-label="ISS view controls">
          <button type="button" className="button button-secondary" aria-label="Zoom in" onClick={() => viewport.current?.zoom('in')}>
            <Plus size={18} aria-hidden="true" />
          </button>
          <button type="button" className="button button-secondary" aria-label="Zoom out" onClick={() => viewport.current?.zoom('out')}>
            <Minus size={18} aria-hidden="true" />
          </button>
          <button type="button" className="button button-secondary" aria-label="Reset view" onClick={() => viewport.current?.reset()}>
            <RotateCcw size={17} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <p className="iss-status" role="status">
          {status === 'error' ? 'Interactive 3D is unavailable on this device.' : 'Loading NASA’s 3D model…'}
        </p>
      )}
      {ready && renderOverlay?.(points, (id) => viewport.current?.focusAnchor(id))}
    </>
  );
}

export function StationModel() {
  const controlsHintId = useId();

  return (
    <section className="panel iss-model" id="iss-model" tabIndex={-1} aria-labelledby="iss-model-title">
      <header className="iss-heading">
        <h3 id="iss-model-title">International Space Station</h3>
      </header>
      <div className="iss-stage" id="iss-stage">
        <InteractiveStation describedBy={controlsHintId} />
      </div>
      <footer className="iss-footer">
        <p id={controlsHintId} className="muted">
          Drag or focus the model and use the arrow keys to rotate.
        </p>
        <div className="iss-sources">
          <a className="text-link" href={NASA_SOURCE} target="_blank" rel="noreferrer">
            NASA / VTAD model source <ArrowUpRight size={14} aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <a className="text-link" href={STUDIO_PAGE} target="_blank" rel="noreferrer">
            Studio Lab reference <ArrowUpRight size={14} aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </footer>
    </section>
  );
}
