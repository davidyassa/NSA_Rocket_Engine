import { Activity, ChevronDown, Wind, ChevronLeft, ChevronRight, Flag, Pause, Play, RadioTower, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CSSProperties, ReactNode } from 'react';
import type { DailyCheckin, DemoScenario, HealthMeasurement, MissionEvent, Provenance } from '../../contracts';
import {
  RADLAB_CSV_URL, RADLAB_EVENT_SOURCE, RADLAB_HOURLY, RADLAB_MANIFEST, RADLAB_SOURCE, RADLAB_UNIT,
} from '../../data/nasa';
import { usableMeasurement } from '../../engine';
import { CO2_LIMIT_MMHG } from '../../engine/rules';
import { radlabEventSol, replaySolAt } from '../../sim';
import { ORIGIN_META, TOKENS } from '../../ui/tokens';
import { TimelinePlot } from './TimelinePlot';
import './timeline.css';

const sleepColor = TOKENS.accent;
const moodColor = TOKENS.textSecondary;
const archiveColor = TOKENS.nasaArchive;
const co2Color = TOKENS.accent;
const cabinColor = TOKENS.textSecondary;
const limitColor = TOKENS.statusTrend;
const CO2_MAX = 4;
const CABIN_RANGE = [18, 28] as const;
const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const archiveDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});
const provenanceNames: Record<Provenance, string> = {
  synthetic_demo: 'Synthetic',
  user_entered: 'User-entered',
  derived: 'Derived',
  nasa_archive: 'NASA archive',
};

function utcLabel(timestamp: string) {
  return `${timestamp.slice(0, 19).replace('T', ' ')} UTC`;
}

function Origin({ origin }: { origin: Provenance }) {
  return <span className={ORIGIN_META[origin].className}>{provenanceNames[origin]}</span>;
}

function ProvenanceDetails({ label, origins, children }: {
  label: string;
  origins: readonly Provenance[];
  children: ReactNode;
}) {
  return (
    <details className="timeline-provenance">
      <summary aria-label={label}>
        {origins.map((origin) => <Origin origin={origin} key={origin} />)}
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="timeline-popover">{children}</div>
    </details>
  );
}

function ReadingValue({ label, unit, reading }: { label: string; unit: string; reading?: HealthMeasurement }) {
  return (
    <div className="timeline-selected-reading">
      <span>{label}</span>
      <strong>{reading ? `${numberFormat.format(reading.value)} ${unit}` : 'Not measured'}</strong>
      {reading && <Origin origin={reading.provenance} />}
    </div>
  );
}

function eventsAtSol(events: readonly MissionEvent[], sol: number) {
  return events.filter((event) => event.startSol <= sol && event.endSol >= sol);
}

export function Timeline({ scenario, records, onInspect, voiceControl }: {
  scenario: DemoScenario;
  records: readonly DailyCheckin[];
  onInspect?: (sol: number) => void;
  voiceControl?: { action: 'play' | 'pause' | 'next' | 'back' | 'restart' };
}) {
  const { missionContext } = scenario;
  const eventSol = radlabEventSol(missionContext);
  const { firstTimestampArchive, lastTimestampArchive, verifiedEventReading, peakReading } = RADLAB_MANIFEST;
  const start = Math.max(1, Math.min(
    Math.floor(replaySolAt(firstTimestampArchive, missionContext)),
    scenario.startSol,
    ...scenario.events.map((event) => event.startSol),
  ));
  const last = Math.max(
    Math.floor(replaySolAt(lastTimestampArchive, missionContext)),
    scenario.startSol,
    ...scenario.events.map((event) => event.endSol),
  );
  const end = last + 1;
  const [params] = useSearchParams();
  const requestedSol = Number(params.get('sol')) || eventSol;
  const [selection, setSelection] = useState(requestedSol);
  const [isPlaying, setIsPlaying] = useState(false);
  const selectedSol = Math.max(start, Math.min(selection, last));
  useEffect(() => { setIsPlaying(false); setSelection(requestedSol); }, [requestedSol]);
  useEffect(() => { onInspect?.(selectedSol); }, [onInspect, selectedSol]);
  const sols = Array.from({ length: end - start }, (_, index) => start + index);
  const tickInterval = Math.ceil(sols.length / 7);
  const visibleSolTicks = sols.filter((sol, index) =>
    sol === selectedSol || (index % tickInterval === 0 && Math.abs(sol - selectedSol) >= tickInterval),
  );

  useEffect(() => {
    if (!isPlaying) return;
    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const intervalMs = prefersReducedMotion ? 1500 : 900;

    const timer = window.setInterval(() => {
      setSelection((current) => {
        if (current >= last) {
          setIsPlaying(false);
          return last;
        }
        return current + 1;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, last]);

  function restartReplay() {
    setSelection(start);
    setIsPlaying(true);
  }

  function togglePlay() {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (selectedSol >= last) {
        setSelection(start);
      }
      setIsPlaying(true);
    }
  }

  function stepBack() {
    setIsPlaying(false);
    setSelection((curr) => Math.max(start, curr - 1));
  }

  function stepForward() {
    setIsPlaying(false);
    setSelection((curr) => Math.min(last, curr + 1));
  }

  useEffect(() => {
    switch (voiceControl?.action) {
      case 'play':
        if (selectedSol >= last) setSelection(start);
        setIsPlaying(true);
        break;
      case 'pause': setIsPlaying(false); break;
      case 'restart': restartReplay(); break;
      case 'next': stepForward(); break;
      case 'back': stepBack(); break;
    }
  }, [voiceControl]);

  const crewBySol = new Map<number, DailyCheckin>();
  for (const record of records) {
    if (record.astronautId !== scenario.profile.id || record.sol < start || record.sol > last) continue;
    const previous = crewBySol.get(record.sol);
    if (!previous || record.submittedAtUtc >= previous.submittedAtUtc) crewBySol.set(record.sol, record);
  }

  const crewSeries = sols.map((sol) => {
    const checkin = crewBySol.get(sol);
    const sleep = checkin && usableMeasurement(checkin, 'sleep_duration');
    const mood = checkin && usableMeasurement(checkin, 'mood');
    return { sol, sleep, mood };
  });
  const inspected = crewSeries.find((point) => point.sol === selectedSol);
  const crewOrigins = [...new Set(crewSeries.flatMap(({ sleep, mood }) =>
    [sleep?.provenance, mood?.provenance].filter((value) => value !== undefined),
  ))];
  const maxSleep = Math.max(8, ...crewSeries.map(({ sleep }) => Math.ceil((sleep?.value ?? 0) / 2) * 2));
  const sleepPoints = crewSeries.map(({ sol, sleep }) => ({
    sol: sol + 0.5, value: sleep?.value ?? null, hollow: sleep?.provenance === 'user_entered',
  }));
  const moodPoints = crewSeries.map(({ sol, mood }) => ({
    sol: sol + 0.5, value: mood?.value ?? null, hollow: mood?.provenance === 'user_entered',
  }));

  const habitatBySol = new Map((scenario.environment ?? []).map((sample) => [sample.sol, sample]));
  const habitatSeries = sols.map((sol) => ({ sol, sample: habitatBySol.get(sol) }));
  const co2Points = habitatSeries.map(({ sol, sample }) => ({ sol: sol + 0.5, value: sample ? Math.min(CO2_MAX, sample.co2Mmhg) : null }));
  const cabinPoints = habitatSeries.map(({ sol, sample }) => ({ sol: sol + 0.5, value: sample?.cabinTempC ?? null }));
  const selectedHabitat = habitatBySol.get(selectedSol);
  const habitatOrigins = [...new Set((scenario.environment ?? []).map((sample) => sample.provenance))];

  const archivePoints = RADLAB_HOURLY.map((hour) => ({
    sol: replaySolAt(hour.hourStartUtc, missionContext),
    value: hour.absorbedDoseRate,
    hour,
  })).filter(({ sol }) => sol >= start && sol < end);
  const inspectedHours = archivePoints.filter(({ sol }) => Math.floor(sol) === selectedSol);
  const populatedHours = inspectedHours.filter(({ value }) => value !== null);
  const selectedRates = populatedHours.flatMap(({ value }) => value === null ? [] : [value]);
  const maxRate = Math.max(5, ...archivePoints.map(({ value }) => Math.ceil((value ?? 0) / 5) * 5));
  const selectedEvents = eventsAtSol(scenario.events, selectedSol);
  const archiveEventDate = archiveDate.format(new Date(`${verifiedEventReading.timestampArchive}Z`));

  return (
    <>
      <header className="page-intro">
        <h1>Mission timeline</h1>
        <p>Compare crew readings, simulated events and Curiosity’s radiation archive by mission sol.</p>
      </header>

      <section className="panel mission-timeline" aria-label="Aligned mission timeline">
        <header className="timeline-toolbar">
          <div>
            <p className="timeline-replay-label">
              <span className="timeline-range">Sols {start}–{last} · </span>
              {archiveEventDate} solar particle event replayed on <strong>Sol {eventSol}</strong>
            </p>
          </div>

          <div className="timeline-actions">
            <div className="timeline-replay-controls" role="toolbar" aria-label="Timeline replay controls">
              <button
                type="button"
                className="timeline-control-btn"
                onClick={restartReplay}
                title={`Restart replay from Sol ${start}`}
                aria-label={`Restart replay from Sol ${start}`}
              >
                <RotateCcw size={15} aria-hidden="true" />
                <span>Restart</span>
              </button>

              <button
                type="button"
                className="timeline-control-btn timeline-step-btn"
                onClick={stepBack}
                disabled={selectedSol <= start}
                title="Previous sol"
                aria-label="Previous sol"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>

              <button
                type="button"
                className={`timeline-control-btn timeline-play-btn ${isPlaying ? 'is-playing' : ''}`}
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause timeline replay' : 'Play timeline replay'}
              >
                {isPlaying ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <button
                type="button"
                className="timeline-control-btn timeline-step-btn"
                onClick={stepForward}
                disabled={selectedSol >= last}
                title="Next sol"
                aria-label="Next sol"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>

            <label className="timeline-selector">
              <span>Inspect sol</span>
              <select
                value={selectedSol}
                onChange={(event) => {
                  setIsPlaying(false);
                  setSelection(Number(event.target.value));
                }}
              >
                {sols.map((sol) => (
                  <option key={sol} value={sol}>Sol {sol}{sol === eventSol ? ' · archive event' : ''}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {isPlaying ? `Replaying timeline at Sol ${selectedSol}` : `Inspecting Sol ${selectedSol}`}
          </p>
        </header>

        <div className="timeline-plot-layout timeline-axis" aria-hidden="true">
          <span className="timeline-axis-title">Sol</span>
          <div className="timeline-axis-labels">
            {visibleSolTicks.map((sol) => (
              <span
                key={sol}
                className={sol === selectedSol ? 'timeline-axis-selected' : undefined}
                style={{ left: `${((sol + 0.5 - start) / (end - start)) * 100}%` }}
              >{sol}</span>
            ))}
          </div>
          <span />
        </div>

        <section className="timeline-lane" aria-labelledby="timeline-health-heading">
          <div className="timeline-lane-heading">
            <div className="timeline-lane-title">
              <span className="timeline-lane-icon"><Activity size={17} aria-hidden="true" /></span>
              <div>
                <h2 id="timeline-health-heading">Crew readings</h2>
                <p className="timeline-trace-legend"><span>Sleep · h</span><span>Mood · 1–5</span></p>
              </div>
            </div>
            {crewOrigins.length > 0 && (
              <ProvenanceDetails label="Crew readings provenance" origins={crewOrigins}>
                <p>Synthetic readings come from the demo history. User-entered readings come from this device’s check-in. Hollow markers indicate user-entered values.</p>
                <p>Each marker represents one sol’s check-in. Blank readings appear as gaps.</p>
              </ProvenanceDetails>
            )}
          </div>
          <TimelinePlot
            start={start} end={end} selectedSol={selectedSol}
            leftTicks={<><span>{maxSleep} h</span><span>{maxSleep / 2} h</span><span>0 h</span></>}
            rightTicks={<><span>5</span><span>3</span><span>1</span></>}
            lines={[
              { id: 'sleep', points: sleepPoints, domain: [0, maxSleep], color: sleepColor, markers: sleepPoints },
              { id: 'mood', points: moodPoints, domain: [1, 5], color: moodColor, dashed: true, markers: moodPoints },
            ]}
          />
          <div className="timeline-selected-values">
            <span className="timeline-selected-sol">Sol {selectedSol}</span>
            <ReadingValue label="Sleep" unit="h" reading={inspected?.sleep} />
            <ReadingValue label="Mood" unit="/ 5" reading={inspected?.mood} />
          </div>
        </section>

        <section className="timeline-lane timeline-event-lane" aria-labelledby="timeline-events-heading">
          <div className="timeline-lane-heading">
            <div className="timeline-lane-title">
              <span className="timeline-lane-icon"><Flag size={17} aria-hidden="true" /></span>
              <h2 id="timeline-events-heading">Mission events</h2>
            </div>
            <ProvenanceDetails label="Mission events provenance" origins={['synthetic_demo']}>
              <p>Events are fictional scenario entries on the mission sol scale.</p>
              {scenario.events.length > 0 && (
                <ul>
                  {scenario.events.map((event) => (
                    <li key={event.id}>{event.label} · Sol {event.startSol}{event.startSol !== event.endSol && `–${event.endSol}`}</li>
                  ))}
                </ul>
              )}
            </ProvenanceDetails>
          </div>
          <div className="timeline-plot-layout" aria-hidden="true">
            <span />
            <div className="timeline-event-track" style={{ '--sol-columns': end - start } as CSSProperties}>
              <span
                className="timeline-event-selection"
                style={{ left: `${((selectedSol - start) / (end - start)) * 100}%`, width: `${100 / (end - start)}%` }}
              />
              {scenario.events.map((event) => (
                <span
                  key={event.id}
                  className="timeline-event-range"
                  style={{ gridColumn: `${event.startSol - start + 1} / ${event.endSol - start + 2}` }}
                >
                  {event.label}
                </span>
              ))}
            </div>
            <span />
          </div>
          <div className="timeline-selected-values">
            <span className="timeline-selected-sol">Sol {selectedSol}</span>
            {selectedEvents.length ? selectedEvents.map((event) => (
              <strong key={event.id}>{event.label}</strong>
            )) : <span className="muted">No mission event recorded.</span>}
          </div>
        </section>

        {habitatSeries.some(({ sample }) => sample) && (
          <section className="timeline-lane" aria-labelledby="timeline-habitat-heading">
            <div className="timeline-lane-heading">
              <div className="timeline-lane-title">
                <span className="timeline-lane-icon"><Wind size={17} aria-hidden="true" /></span>
                <div>
                  <h2 id="timeline-habitat-heading">Habitat air</h2>
                  <p className="timeline-trace-legend"><span>CO2 · mmHg</span><span>Cabin · °C</span></p>
                </div>
              </div>
              <ProvenanceDetails label="Habitat air provenance" origins={habitatOrigins.length ? habitatOrigins : ['synthetic_demo']}>
                <p>Daily mean cabin CO2 and temperature. In this demo they are simulated life-support (ECLSS) readings, not live sensors.</p>
                <p>The dotted line marks NASA’s {CO2_LIMIT_MMHG} mmHg limit for the 1-hour average CO2 (NASA-STD-3001). Values above {CO2_MAX} mmHg are drawn at the top edge.</p>
              </ProvenanceDetails>
            </div>
            <TimelinePlot
              start={start} end={end} selectedSol={selectedSol}
              leftTicks={<><span>{CO2_MAX}</span><span>{CO2_MAX / 2}</span><span>0</span></>}
              rightTicks={<><span>{CABIN_RANGE[1]}°</span><span>{(CABIN_RANGE[0] + CABIN_RANGE[1]) / 2}°</span><span>{CABIN_RANGE[0]}°</span></>}
              limits={[{ id: 'co2-limit', value: CO2_LIMIT_MMHG, domain: [0, CO2_MAX], color: limitColor, label: `Limit ${CO2_LIMIT_MMHG} mmHg` }]}
              lines={[
                { id: 'co2', points: co2Points, domain: [0, CO2_MAX], color: co2Color, markers: co2Points },
                { id: 'cabin', points: cabinPoints, domain: CABIN_RANGE, color: cabinColor, dashed: true },
              ]}
            />
            <div className="timeline-selected-values">
              <span className="timeline-selected-sol">Sol {selectedSol}</span>
              {selectedHabitat ? (
                <>
                  <span>CO2 <strong>{numberFormat.format(selectedHabitat.co2Mmhg)} mmHg</strong>
                    {selectedHabitat.co2Mmhg >= CO2_LIMIT_MMHG ? ' · above limit' : selectedHabitat.co2Mmhg >= 2.5 ? ' · elevated' : ' · within limit'}</span>
                  <span>Cabin <strong>{numberFormat.format(selectedHabitat.cabinTempC)} °C</strong></span>
                </>
              ) : <span className="muted">No habitat reading for this sol.</span>}
            </div>
          </section>
        )}

        <section className="timeline-lane" aria-labelledby="timeline-archive-heading">
          <div className="timeline-lane-heading">
            <div className="timeline-lane-title">
              <span className="timeline-lane-icon timeline-lane-icon-archive"><RadioTower size={17} aria-hidden="true" /></span>
              <div>
                <h2 id="timeline-archive-heading">Curiosity radiation archive</h2>
                <p>Absorbed dose rate · {RADLAB_UNIT} · UTC hourly medians</p>
              </div>
            </div>
            <ProvenanceDetails label="NASA archive provenance" origins={['nasa_archive']}>
              <dl className="timeline-source-fields">
                <dt>Instrument</dt><dd>{RADLAB_MANIFEST.instrumentId} · Curiosity RAD</dd>
                <dt>Source</dt><dd>{RADLAB_SOURCE.publisher}</dd>
                <dt>Archive period</dt><dd>{utcLabel(firstTimestampArchive)} – {utcLabel(lastTimestampArchive)}</dd>
                <dt>Retrieved</dt><dd>{RADLAB_MANIFEST.retrievedOn}</dd>
                <dt>Measurement</dt><dd>Absorbed dose rate · {RADLAB_UNIT}</dd>
                <dt>Coverage</dt><dd>{RADLAB_MANIFEST.rawReadingCount.toLocaleString('en-US')} original readings · {RADLAB_MANIFEST.populatedHourCount} hourly medians · {RADLAB_MANIFEST.missingHourCount} empty hours</dd>
                <dt>Event reading (08:01 UTC)</dt><dd>{numberFormat.format(verifiedEventReading.absorbedDoseRate)} {RADLAB_UNIT} at {utcLabel(verifiedEventReading.timestampArchive)} (single raw reading)</dd>
                <dt>Raw peak reading (15:23 UTC)</dt><dd>{numberFormat.format(peakReading.absorbedDoseRate)} {RADLAB_UNIT} at {utcLabel(peakReading.timestampArchive)} (single raw reading)</dd>
                <dt>Longest gap</dt><dd>{utcLabel(RADLAB_MANIFEST.longestGap.fromTimestampArchive)} – {utcLabel(RADLAB_MANIFEST.longestGap.toTimestampArchive)}</dd>
              </dl>
              <p>Archive timestamps use UTC as checked against RadLab’s Unix timestamp filter. The replay positions each hourly median by its hour start. Gaps indicate unmeasured hours.</p>
              <div className="timeline-source-links">
                <a href={RADLAB_SOURCE.url ?? RADLAB_MANIFEST.queryUrl} target="_blank" rel="noreferrer">NASA RadLab instrument</a>
                <a href={RADLAB_MANIFEST.queryUrl} target="_blank" rel="noreferrer">Original API query</a>
                <a href={RADLAB_CSV_URL} download="msl-rad-surface-2017-09.csv">Download archive CSV</a>
              </div>
            </ProvenanceDetails>
          </div>
          <TimelinePlot
            start={start} end={end} selectedSol={selectedSol}
            leftTicks={<><span>{maxRate}</span><span>{maxRate / 2}</span><span>0</span></>}
            lines={[{ id: 'radiation', points: archivePoints, domain: [0, maxRate], color: archiveColor }]}
          />
          <div className="timeline-selected-values">
            <span className="timeline-selected-sol">Sol {selectedSol}</span>
            {selectedRates.length > 0 ? (
              <span>Hourly medians: <strong>{numberFormat.format(Math.min(...selectedRates))}–{numberFormat.format(Math.max(...selectedRates))} {RADLAB_UNIT}</strong></span>
            ) : <span className="muted">Archive readings unavailable for this sol.</span>}
            {selectedSol === eventSol && (
              <span className="timeline-original-anchor">
                Event reading · {utcLabel(verifiedEventReading.timestampArchive)}: {numberFormat.format(verifiedEventReading.absorbedDoseRate)} {RADLAB_UNIT} (raw) · Raw peak: {numberFormat.format(peakReading.absorbedDoseRate)} {RADLAB_UNIT} ({utcLabel(peakReading.timestampArchive)})
              </span>
            )}
          </div>
          {inspectedHours.length > 0 && (
            <details className="timeline-hourly">
              <summary>Hourly archive readings for Sol {selectedSol}</summary>
              <div className="timeline-table-wrap" tabIndex={0} role="region" aria-label="Hourly NASA archive readings">
                <table className="data-table">
                  <thead><tr><th scope="col">Archive hour (UTC)</th><th scope="col">Absorbed dose rate ({RADLAB_UNIT})</th><th scope="col">Original readings (UTC)</th></tr></thead>
                  <tbody>
                    {inspectedHours.map(({ hour }) => (
                      <tr key={hour.hourStartUtc}>
                        <th scope="row">{utcLabel(hour.hourStartUtc)}</th>
                        <td>{hour.absorbedDoseRate === null ? 'Unmeasured' : numberFormat.format(hour.absorbedDoseRate)}</td>
                        <td>{hour.timestampArchive === null ? 'None' : (
                          <>{hour.timestampArchive}{hour.endTimestampArchive !== hour.timestampArchive && <> – {hour.endTimestampArchive}</>} ({hour.sampleCount})</>
                        )}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>
      </section>

      <aside className="timeline-context-note" aria-label="Archive interpretation">
        <RadioTower size={18} aria-hidden="true" />
        <div>
          <h2>Context for the simulated mission</h2>
          <p>Curiosity recorded the September 2017 solar particle event on the Mars surface. Its alignment with crew readings is a simulation. Crew exposure and health effects are outside the scope of the archive.</p>
          <a href={RADLAB_EVENT_SOURCE} target="_blank" rel="noreferrer">Read NASA JPL’s event report</a>
        </div>
      </aside>
    </>
  );
}
