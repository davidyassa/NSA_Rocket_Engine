import { Link } from 'react-router-dom';
import {
  Activity, ArrowRight, Brain, Equal, ExternalLink, Globe, Radiation, SatelliteDish, Triangle, Weight,
  type LucideIcon,
} from 'lucide-react';
import { NASA_FIVE_HAZARDS, type NasaHazard } from './hazardsData';
import { missionMedia } from '../media/mediaCatalog';
import './hazards.css';

const hazardCards: Record<string, { image: string; Icon: LucideIcon; overview: string }> = {
  radiation: {
    image: missionMedia['hazards-radiation'],
    Icon: Radiation,
    overview: 'Track the simulated solar storm and recovery alongside Curiosity radiation readings.',
  },
  isolation: {
    image: missionMedia['hazards-isolation'],
    Icon: Brain,
    overview: 'Follow changes in sleep, mood, and alertness while living in a confined habitat.',
  },
  distance: {
    image: missionMedia['hazards-distance'],
    Icon: SatelliteDish,
    overview: 'A 40-minute round trip to Earth in the demo makes onboard decisions essential.',
  },
  gravity: {
    image: missionMedia['hazards-gravity'],
    Icon: Weight,
    overview: 'Monitor how the crew adapts to changing gravity through check-ins and the stand-up test.',
  },
  environment: {
    image: missionMedia['hazards-environment'],
    Icon: Globe,
    overview: 'Review cabin CO₂ and temperature alongside symptoms reported by the crew.',
  },
};

/** Status in three channels: icon, label, and colour tone. */
const STATE_META: Record<NasaHazard['sol43Status']['state'], { label: string; Icon: LucideIcon; tone: string }> = {
  nominal: { label: 'Nominal', Icon: Equal, tone: 'steady' },
  elevated: { label: 'Elevated', Icon: Triangle, tone: 'change' },
  active_monitoring: { label: 'Active monitoring', Icon: Activity, tone: 'monitor' },
};

export function NasaHazards() {
  return (
    <div className="hazards-container">
      <header className="page-intro">
        <h1>Hazards</h1>
        <p>NASA’s five hazards of human spaceflight and how Sol Check monitors them.</p>
      </header>

      <div className="hazards-grid">
        {NASA_FIVE_HAZARDS.map((hazard) => {
          const { image, Icon, overview } = hazardCards[hazard.id];
          const state = STATE_META[hazard.sol43Status.state];
          const headingId = `hazard-${hazard.id}`;
          return (
            <article key={hazard.id} className="hazard-card" aria-labelledby={headingId}>
              <img className="hazard-card-photo" src={image} alt="" loading="lazy" />
              <div className="hazard-card-header">
                <span className="hazard-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.8} /></span>
                <h2 className="hazard-name" id={headingId}>{hazard.name}</h2>
              </div>

              <p className="hazard-overview">{overview}</p>
              <span className={`hazard-status-badge status-${state.tone}`}>
                <state.Icon size={13} aria-hidden="true" /> Sol 43 demo · {state.label}
              </span>

              {hazard.id === 'radiation' && (
                <Link to="/hazards/radiation" className="button button-primary hazard-detail-link">
                  Open Hazard 1 <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
              {hazard.id === 'isolation' && (
                <Link to="/hazards/isolation" className="button button-primary hazard-detail-link">
                  Open Hazard 2 <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
              {hazard.id === 'distance' && (
                <Link to="/hazards/distance" className="button button-primary hazard-detail-link">
                  Open Hazard 3 <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}

              <details className="hazard-details">
                <summary>Details and sources<span className="sr-only"> for {hazard.name}</span></summary>
                <div className="hazard-details-body">
                  <section>
                    <h3>Sol 43 scenario</h3>
                    <p>{hazard.sol43Status.summary}</p>
                  </section>
                  <section>
                    <h3>What Sol Check tracks</h3>
                    <ul className="hazard-list">
                      {hazard.measuredBy.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </section>
                  <section>
                    <h3>Equipment needed for flight</h3>
                    <ul className="hazard-list">
                      {hazard.needsHardware.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </section>
                  <section>
                    <h3>Countermeasures</h3>
                    <ul className="hazard-list">
                      {hazard.operationalCountermeasures.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </section>
                  <section>
                    <h3>Evidence sources</h3>
                    <ul className="hazard-list">
                      {hazard.officialReferences.map(({ title, publisher, link }) => (
                        <li key={title}>
                          {link ? (
                            <a href={link} target="_blank" rel="noreferrer">
                              {title}<ExternalLink size={13} aria-hidden="true" className="external-icon" />
                              <span className="sr-only"> (opens in a new tab)</span>
                            </a>
                          ) : title}
                          <span className="muted"> · {publisher}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </div>
  );
}
