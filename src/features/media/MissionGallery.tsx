import { ArrowLeft, ArrowRight, ArrowUpRight, Images, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { mediaCatalog, mediaCategories, type MediaCategory } from './mediaCatalog';
import './mission-media.css';

const PAGE_SIZE = 12;

export function MissionMedia() {
  const [category, setCategory] = useState<MediaCategory | 'all'>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const assets = category === 'all'
    ? mediaCatalog
    : mediaCatalog.filter((asset) => asset.category === category);
  const activeAsset = activeIndex === null ? undefined : assets[activeIndex];

  useEffect(() => {
    if (activeAsset && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
    }
  }, [activeAsset]);

  function move(direction: -1 | 1) {
    setActiveIndex((index) => {
      if (index === null) return index;
      return (index + direction + assets.length) % assets.length;
    });
  }

  return (
    <section className="mission-media" id="mission-media" tabIndex={-1} aria-labelledby="mission-media-title">
      <header className="mission-media-header">
        <div>
          <h2 id="mission-media-title"><Images size={22} aria-hidden="true" /> Mission media</h2>
          <p className="muted">Browse spaceflight imagery, concept illustrations and Rocket Engine artwork.</p>
        </div>
        <label className="mission-media-filter">
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as MediaCategory | 'all');
              setLimit(PAGE_SIZE);
            }}
          >
            <option value="all">All media</option>
            {Object.entries(mediaCategories).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </header>

      <ul className="mission-media-grid">
        {assets.slice(0, limit).map((asset, index) => (
          <li key={asset.id}>
            <button
              type="button"
              className="panel mission-media-card"
              data-category={asset.category}
              onClick={(event) => {
                trigger.current = event.currentTarget;
                setActiveIndex(index);
              }}
              aria-haspopup="dialog"
            >
              <div className="mission-media-thumbnail">
                <img src={asset.src} alt="" loading="lazy" decoding="async" />
              </div>
              <span className="mission-media-card-label">
                <span>{asset.title}</span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mission-media-pagination">
        <p className="muted" role="status">Showing {Math.min(limit, assets.length)} of {assets.length} images</p>
        {limit < assets.length && (
          <button type="button" className="button button-secondary" onClick={() => setLimit(limit + PAGE_SIZE)}>
            Show more images <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <dialog
        className="mission-media-dialog"
        ref={dialog}
        aria-labelledby="mission-media-dialog-title"
        onClose={() => {
          setActiveIndex(null);
          trigger.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            move(event.key === 'ArrowLeft' ? -1 : 1);
          }
        }}
      >
        {activeAsset && (
          <>
            <header className="mission-media-dialog-header">
              <div aria-live="polite">
                <h3 id="mission-media-dialog-title">{activeAsset.title}</h3>
                <p className="muted">{mediaCategories[activeAsset.category]} · {(activeIndex ?? 0) + 1} of {assets.length}</p>
                {activeAsset.credit && <p className="muted">{activeAsset.credit}</p>}
              </div>
              <button
                type="button"
                className="button button-secondary mission-media-close"
                aria-label="Close media viewer"
                onClick={() => dialog.current?.close()}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className="mission-media-view">
              <img src={activeAsset.src} alt={activeAsset.description} />
            </div>
            <footer className="mission-media-dialog-actions">
              <button type="button" className="button button-secondary" onClick={() => move(-1)}>
                <ArrowLeft size={16} aria-hidden="true" /> Previous
              </button>
              <a className="text-link" href={activeAsset.src} target="_blank" rel="noreferrer">
                View full image <ArrowUpRight size={16} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <button type="button" className="button button-secondary" onClick={() => move(1)}>
                Next <ArrowRight size={16} aria-hidden="true" />
              </button>
            </footer>
          </>
        )}
      </dialog>
    </section>
  );
}
