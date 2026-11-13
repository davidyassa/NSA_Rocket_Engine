import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Pause, Play, RotateCcw, RotateCw, Rotate3d, ZoomIn, ZoomOut } from 'lucide-react';
import { HEALTH_DOMAINS, type DomainStatus, type HealthDomain } from '../../contracts';
import { STATUS_META } from '../../ui/tokens';
import { HOTSPOT_LABELS, pulsePeriodSeconds } from './twin/hotspots';
import type { AstronautViewport, ModelSource, ProjectedHotspot } from './twin/astronautViewport';

export interface DomainSummary {
  label: string;
  value: string;
  status: DomainStatus;
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

/**
 * Host for the team's 3D astronaut. The six `.figure-region-target` buttons
 * are real, focusable controls projected onto the model's hotspot anchors,
 * so keyboard, screen-reader and automated (CDP) users get the same six
 * targets as pointer users.
 */
export function CrewBody3D({
  activeDomain,
  summaries,
  heartRate,
  onHoverDomain,
  onSelectDomain,
  onUnavailable,
}: {
  activeDomain: HealthDomain | null;
  summaries: Record<HealthDomain, DomainSummary>;
  heartRate: number | null;
  onHoverDomain: (domain: HealthDomain | null) => void;
  onSelectDomain: (domain: HealthDomain) => void;
  onUnavailable: (reason: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<AstronautViewport | null>(null);
  const hotspotRefs = useRef(new Map<HealthDomain, HTMLButtonElement>());
  const hudRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<HealthDomain, ProjectedHotspot>());
  const activeRef = useRef<HealthDomain | null>(activeDomain);
  const callbacks = useRef({ onHoverDomain, onSelectDomain, onUnavailable });
  callbacks.current = { onHoverDomain, onSelectDomain, onUnavailable };

  const [reducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(reducedMotionQuery).matches);
  const [autoRotate, setAutoRotate] = useState(!reducedMotion);
  const [model, setModel] = useState<ModelSource | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    import('./twin/astronautViewport')
      .then(({ AstronautViewport, webglAvailable }) => {
        if (cancelled) return;
        if (!webglAvailable()) {
          callbacks.current.onUnavailable('WebGL is not available on this device.');
          return;
        }
        viewportRef.current = new AstronautViewport(canvas, {
          onHotspots: (hotspots) => {
            for (const hotspot of hotspots) positions.current.set(hotspot.domain, hotspot);
            placeOverlays();
            setReady(true);
          },
          onHoverDomain: (domain) => callbacks.current.onHoverDomain(domain),
          onSelectDomain: (domain) => callbacks.current.onSelectDomain(domain),
          onModel: (source) => setModel(source),
          onError: (message) => callbacks.current.onUnavailable(message),
        }, { autoRotate: !reducedMotion, reducedMotion });
      })
      .catch(() => {
        if (!cancelled) callbacks.current.onUnavailable('The 3D module could not be loaded.');
      });

    return () => {
      cancelled = true;
      viewportRef.current?.dispose();
      viewportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    activeRef.current = activeDomain;
    viewportRef.current?.setHighlight(activeDomain);
    placeOverlays();
  }, [activeDomain]);

  function placeOverlays() {
    for (const [domain, button] of hotspotRefs.current) {
      const p = positions.current.get(domain);
      if (!p) continue;
      button.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      button.dataset.occluded = String(!p.visible);
    }
    const hud = hudRef.current;
    const active = activeRef.current;
    const p = active ? positions.current.get(active) : undefined;
    // Compact pill docked at the bottom of the viewport (over the ground) so it never covers the suit.
    if (hud) hud.hidden = !p;
  }

  function toggleAutoRotate() {
    const next = !autoRotate;
    setAutoRotate(next);
    viewportRef.current?.setAutoRotate(next);
  }

  const hud = activeDomain ? summaries[activeDomain] : null;
  const hudStatus = hud ? STATUS_META[hud.status] : null;
  const pulseStyle = { '--pulse-period': `${pulsePeriodSeconds(heartRate)}s` } as CSSProperties;

  return (
    <div className="twin" data-ready={ready}>
      <div className="twin-viewport" style={pulseStyle}>
        <canvas ref={canvasRef} className="twin-canvas" aria-hidden="true" />

        {HEALTH_DOMAINS.map((domain) => {
          const summary = summaries[domain];
          const status = STATUS_META[summary.status];
          return (
            <button
              key={domain}
              ref={(node) => {
                if (node) hotspotRefs.current.set(domain, node);
                else hotspotRefs.current.delete(domain);
              }}
              type="button"
              className={`figure-region-target twin-hotspot status-${status.tone}${domain === 'cardiovascular' ? ' twin-hotspot-pulse' : ''}${activeDomain === domain ? ' is-active' : ''}`}
              aria-label={`${summary.label}, ${HOTSPOT_LABELS[domain].toLowerCase()} region: ${summary.value}. Status: ${status.label}. Open details.`}
              onClick={() => onSelectDomain(domain)}
              onMouseEnter={() => onHoverDomain(domain)}
              onMouseLeave={() => onHoverDomain(null)}
              onFocus={() => onHoverDomain(domain)}
              onBlur={() => onHoverDomain(null)}
            >
              <status.Icon size={13} strokeWidth={2.4} aria-hidden="true" />
            </button>
          );
        })}

        <div ref={hudRef} className="twin-hud" aria-hidden="true" hidden>
          {hud && hudStatus && (
            <>
              <span className="twin-hud-region">{HOTSPOT_LABELS[activeDomain!]}</span>
              <strong className="twin-hud-value">{hud.value}</strong>
              <span className={`twin-hud-status status-${hudStatus.tone}`} title={hudStatus.label}>
                <hudStatus.Icon size={12} aria-hidden="true" /> {hudStatus.label}
              </span>
            </>
          )}
        </div>

        {!ready && <p className="twin-loading" role="status">Loading 3D crew model…</p>}
      </div>

      <div className="twin-toolbar">
        <span className="badge origin-entered" title="assets/astronaut/astronaut_sol_check.glb">
          <Rotate3d size={13} aria-hidden="true" />
          {model === null ? 'Loading model' : model.file}
        </span>
        <div className="twin-controls" role="group" aria-label="3D view controls">
          <button type="button" className="twin-icon-button" aria-label="Rotate left" onClick={() => viewportRef.current?.rotateBy(-Math.PI / 8)}>
            <RotateCcw size={16} aria-hidden="true" />
          </button>
          <button type="button" className="twin-icon-button" aria-label="Rotate right" onClick={() => viewportRef.current?.rotateBy(Math.PI / 8)}>
            <RotateCw size={16} aria-hidden="true" />
          </button>
          <button type="button" className="twin-icon-button" aria-label="Zoom in" onClick={() => viewportRef.current?.zoomBy(0.8)}>
            <ZoomIn size={16} aria-hidden="true" />
          </button>
          <button type="button" className="twin-icon-button" aria-label="Zoom out" onClick={() => viewportRef.current?.zoomBy(1.25)}>
            <ZoomOut size={16} aria-hidden="true" />
          </button>
          <button type="button" className="twin-icon-button" aria-pressed={autoRotate} aria-label={autoRotate ? 'Pause auto-rotation' : 'Resume auto-rotation'} onClick={toggleAutoRotate}>
            {autoRotate ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          </button>
          <button type="button" className="twin-text-button" onClick={() => viewportRef.current?.resetView()}>
            Reset view
          </button>
        </div>
      </div>
      <p className="twin-hint">Drag to orbit · zoom with the buttons · double-click to reset · select a marker to open its details.</p>
    </div>
  );
}
