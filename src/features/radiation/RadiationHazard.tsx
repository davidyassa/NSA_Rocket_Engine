import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Compass,
  Footprints,
  Lock,
  MapPin,
  Pause,
  Pill,
  Play,
  Radiation,
  RefreshCw,
  RotateCcw,
  Salad,
  Shield,
  ShieldCheck,
  SkipForward,
  Thermometer,
  Timer,
  Unlock,
  Users,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import type { DemoScenario } from '../../contracts';
import { RadiationStationMap } from './RadiationStationMap';
import {
  CAREER_LIMIT_MSV,
  CARN_RATES,
  calculateCrewDose,
  computeLowestDosePath,
  evaluateRoomAccess,
  evaluateVehicleRadiationStatus,
  localizeDirectionalEvent,
  type CrewRadiationProfile,
} from './radiationEngine';
import {
  DEFAULT_CREW_ROSTER,
  ENVIRONMENT_SCENARIOS,
  ENVIRONMENT_SCENARIO_MAP,
  SPACECRAFT_COMPARTMENTS,
  TELEMETRY_PRESETS,
  frameNowMs,
  generateCARNTimeline,
  telemetryFromFrame,
} from './radiationData';
import {
  inferEnvironmentEvent,
  summarizeEnvironment,
  type CompartmentSnapshot,
} from './compartmentEnvironmentEngine';
import { useRadiationSimStore } from './radiationSimStore';
import './radiation.css';

function fmtAvg(value: number | null, digits: number, unit: string) {
  return value === null ? 'Unavailable' : `${value.toFixed(digits)} ${unit}`;
}

export function RadiationHazard({ scenario, onInspectRoom }: {
  scenario?: DemoScenario;
  onInspectRoom?: (roomId: string) => void;
}) {
  // Scenario + sample live in the shared sim store so the dashboard shows the same condition.
  const activeScenarioKey = useRadiationSimStore((state) => state.scenarioKey);
  const frameIndex = useRadiationSimStore((state) => state.frameIndex);
  const selectSimScenario = useRadiationSimStore((state) => state.selectScenario);
  const setFrameIndex = useRadiationSimStore((state) => state.setFrameIndex);
  const [isPlaying, setIsPlaying] = useState(false);

  // Selected crew member for personalized gauge & routing
  const [selectedCrewId, setSelectedCrewId] = useState<string>(DEFAULT_CREW_ROSTER[1].id);
  // Selected compartment for CARN telemetry inspection & timeline
  const [selectedRoomId, setSelectedRoomId] = useState<string>('flight-deck');
  // Timeline chart resolution
  const [timelineResolution, setTimelineResolution] = useState<'1min' | '1hr' | '24hr'>('1hr');

  // Interactive 5-minute shelter accountability simulation
  const [accountabilityChecked, setAccountabilityChecked] = useState(false);
  // Post-event assay simulator
  const [assay24Done, setAssay24Done] = useState(false);
  const [assay48Done, setAssay48Done] = useState(false);
  const [reopenPhasedDone, setReopenPhasedDone] = useState(false);

  // Optional, explicitly user-enabled audio alarm
  const [alarmSoundEnabled, setAlarmSoundEnabled] = useState(false);
  const [alarmAcknowledged, setAlarmAcknowledged] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const envScenario = ENVIRONMENT_SCENARIO_MAP[activeScenarioKey] ?? ENVIRONMENT_SCENARIOS[0];
  const frames = envScenario.frames;
  const clampedIndex = Math.min(frameIndex, frames.length - 1);
  const frame = frames[clampedIndex];
  const nowMs = useMemo(() => frameNowMs(frame), [frame]);

  // CARN radiation telemetry for the existing panels, derived from the current frame.
  const telemetry = useMemo(() => telemetryFromFrame(frame), [frame]);
  const snapshotByRoom = useMemo(
    () => Object.fromEntries(frame.map((reading) => [reading.roomId, reading])) as Record<string, CompartmentSnapshot>,
    [frame],
  );
  const recoveryState = envScenario.recoveryActive ? TELEMETRY_PRESETS.RECOVERY.recoveryState : undefined;

  // Three ISS-wide averages (independent, excludes invalid/stale, never zero-fills).
  const summary = useMemo(() => summarizeEnvironment(frame, nowMs), [frame, nowMs]);

  // Temporal-spatial event inference over the frames seen so far.
  const localization = useMemo(
    () => inferEnvironmentEvent(frames.slice(0, clampedIndex + 1), SPACECRAFT_COMPARTMENTS, nowMs, {
      recoveryActive: envScenario.recoveryActive,
    }),
    [frames, clampedIndex, nowMs, envScenario.recoveryActive],
  );

  function selectScenario(key: string) {
    const next = ENVIRONMENT_SCENARIO_MAP[key];
    if (!next) return;
    selectSimScenario(key); // jumps straight to the full-state frame
    setIsPlaying(false);
    setAccountabilityChecked(false);
    setAlarmAcknowledged(false);
    if (key === 'RECOVERY') {
      setAssay24Done(true);
      setAssay48Done(false);
      setReopenPhasedDone(false);
    }
  }

  function replayFromStart() {
    if (frames.length <= 1) return;
    setFrameIndex(0);
    setIsPlaying(true);
    setAlarmAcknowledged(false);
  }

  // Replay transport: advance one frame at a time while playing.
  useEffect(() => {
    if (!isPlaying) return undefined;
    if (clampedIndex >= frames.length - 1) {
      setIsPlaying(false);
      return undefined;
    }
    const id = window.setTimeout(() => setFrameIndex((index) => index + 1), 950);
    return () => window.clearTimeout(id);
  }, [isPlaying, clampedIndex, frames.length]);

  // Crew radiation calculations
  const crewProfiles = useMemo<CrewRadiationProfile[]>(() => {
    if (!scenario) return DEFAULT_CREW_ROSTER;
    return DEFAULT_CREW_ROSTER.map((c) => {
      if (c.role.includes('Specialist') && scenario.profile.displayName) {
        return {
          ...c,
          displayName: scenario.profile.displayName,
          role: `${scenario.profile.role} (Current Mission Profile)`,
        };
      }
      return c;
    });
  }, [scenario]);

  const crewCalculatedList = useMemo(() => crewProfiles.map(calculateCrewDose), [crewProfiles]);

  const selectedCrewCalculated = useMemo(
    () => crewCalculatedList.find((c) => c.crewId === selectedCrewId) ?? crewCalculatedList[0],
    [crewCalculatedList, selectedCrewId],
  );

  const selectedCrewProfile = useMemo(
    () => crewProfiles.find((c) => c.id === selectedCrewId) ?? crewProfiles[0],
    [crewProfiles, selectedCrewId],
  );

  const vehicleAssessment = useMemo(
    () => evaluateVehicleRadiationStatus(SPACECRAFT_COMPARTMENTS, telemetry, crewCalculatedList, recoveryState),
    [telemetry, crewCalculatedList, recoveryState],
  );

  useEffect(() => { onInspectRoom?.(selectedRoomId); }, [onInspectRoom, selectedRoomId]);

  const directionalEvent = useMemo(
    () => localizeDirectionalEvent(SPACECRAFT_COMPARTMENTS, telemetry),
    [telemetry],
  );

  const accessMatrix = useMemo(() => crewProfiles.map((crew, cIdx) => {
    const calculated = crewCalculatedList[cIdx];
    const roomEvaluations = SPACECRAFT_COMPARTMENTS.map((room) => {
      const roomTelemetry = telemetry[room.id] ?? {
        roomId: room.id,
        doseRateMsvH: 0.08,
        projectedDailyMsv: 1.92,
        particleFlux: 100,
        timestamp: new Date(nowMs).toISOString(),
      };
      const isEvacUnderway = vehicleAssessment.status === 'ORANGE' || vehicleAssessment.status === 'RED';
      return evaluateRoomAccess(room, roomTelemetry, calculated, crew, isEvacUnderway);
    });
    return { crew, calculated, roomEvaluations };
  }), [crewProfiles, crewCalculatedList, telemetry, vehicleAssessment.status, nowMs]);

  const evacuationRoute = useMemo(() => {
    const startRoom = selectedCrewProfile.lastBeaconLocation || 'flight-deck';
    return computeLowestDosePath(startRoom, 'storm-shelter', SPACECRAFT_COMPARTMENTS, telemetry);
  }, [selectedCrewProfile, telemetry]);

  // Shelter safety: only call it "SAFE" if the destination is below the acute rate AND reachable.
  const shelterRate = snapshotByRoom['storm-shelter']?.radiationDoseRateMsvH ?? 0.03;
  const shelterReachable = evacuationRoute.path[evacuationRoute.path.length - 1] === 'storm-shelter';
  const shelterSafe = typeof shelterRate === 'number'
    && shelterRate <= CARN_RATES.ACUTE_BREACH_HOURLY
    && shelterReachable;

  const selectedCompartment = useMemo(
    () => SPACECRAFT_COMPARTMENTS.find((r) => r.id === selectedRoomId) ?? SPACECRAFT_COMPARTMENTS[0],
    [selectedRoomId],
  );

  const selectedTelemetry = telemetry[selectedRoomId] ?? {
    roomId: selectedRoomId,
    doseRateMsvH: 0.08,
    projectedDailyMsv: 1.92,
    particleFlux: 100,
    timestamp: new Date(nowMs).toISOString(),
  };
  const selectedSnapshot = snapshotByRoom[selectedRoomId];

  const timelinePoints = useMemo(() => {
    const peak = localization.peakDoseRateMsvH ?? selectedTelemetry.doseRateMsvH;
    const spikeMul = peak > 4 ? 50 : peak > 2.1 ? 25 : peak > 0.15 ? 6 : 1;
    return generateCARNTimeline(selectedTelemetry.doseRateMsvH, timelineResolution, spikeMul);
  }, [selectedTelemetry.doseRateMsvH, timelineResolution, localization.peakDoseRateMsvH]);

  // Optional audio alarm (visual alert always remains; audio never required for safety).
  const alarm = localization.state === 'ALERT';
  const soundActive = alarm && alarmSoundEnabled && !alarmAcknowledged;
  useEffect(() => {
    if (!soundActive) return undefined;
    function beep() {
      try {
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 880;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.33);
      } catch {
        /* audio is best-effort only */
      }
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor && !audioCtxRef.current) audioCtxRef.current = new Ctor();
      void audioCtxRef.current?.resume();
    } catch {
      /* ignore */
    }
    beep();
    const id = window.setInterval(beep, 1900);
    return () => window.clearInterval(id);
  }, [soundActive]);

  useEffect(() => () => {
    try {
      void audioCtxRef.current?.close();
    } catch {
      /* ignore */
    }
  }, []);

  const peakRoomName = SPACECRAFT_COMPARTMENTS.find((c) => c.id === localization.peakRoomId)?.name;
  const firstHitNames = localization.firstHitRoomIds
    .map((id) => SPACECRAFT_COMPARTMENTS.find((c) => c.id === id)?.name ?? id);
  const alarmSeverity = (localization.peakDoseRateMsvH ?? 0) > CARN_RATES.SEVERE_STORM_HOURLY ? 'CRITICAL' : 'WARN';
  const minReporting = Math.min(
    summary.validCounts.temperature,
    summary.validCounts.radiation,
    summary.validCounts.co2,
  );

  return (
    <div className="radiation-container">
      {/* Page Header */}
      <header className="page-intro">
        <Link to="/hazards" className="text-link">
          All five hazards
        </Link>
        <h1>1. Space Radiation Health Monitoring</h1>
        <p>
          Deep-space transit autonomous radiation protection specification per{' '}
          <strong>NASA-STD-3001</strong>. Universal 600 mSv career limit, CARN sensor compartment mapping,
          personalized room lockdown matrix, directional storm localization, and post-event hysteresis de-escalation.
        </p>
        <div className="radiation-badge-row">
          <span className="badge">
            <Shield size={13} aria-hidden="true" /> Universal Career Limit: 600 mSv
          </span>
          <span className="badge">
            <Timer size={13} aria-hidden="true" /> Rolling 30-Day Budget: 250 mSv
          </span>
          <span className="badge">
            <Radiation size={13} aria-hidden="true" /> 1-Min CARN Telemetry Stream
          </span>
          <span className="badge badge-synthetic">Simulated Deep-Space Transit</span>
        </div>
      </header>

      {/* Vehicle Status Banner */}
      <section
        className={`radiation-status-banner status-${vehicleAssessment.status.toLowerCase()}`}
        aria-live="polite"
        aria-labelledby="banner-heading"
      >
        <div className="banner-header">
          <div className="banner-title-group">
            {vehicleAssessment.status === 'RED' && <AlertOctagon size={26} color="var(--nasa-red)" aria-hidden="true" />}
            {vehicleAssessment.status === 'ORANGE' && <AlertTriangle size={26} color="var(--status-trend)" aria-hidden="true" />}
            {vehicleAssessment.status === 'YELLOW' && <AlertTriangle size={24} color="var(--status-change)" aria-hidden="true" />}
            {vehicleAssessment.status === 'GREEN' && <ShieldCheck size={24} color="var(--status-steady)" aria-hidden="true" />}
            <div>
              <span className="banner-status-badge">
                VEHICLE STATUS: {vehicleAssessment.status}
              </span>
              <h2 id="banner-heading" className="banner-message">
                {vehicleAssessment.warningMessage}
              </h2>
            </div>
          </div>
          <span className="badge" style={{ background: 'var(--bg-surface)' }}>
            {vehicleAssessment.statusLabel}
          </span>
        </div>

        <p className="banner-condition">
          <strong>Trigger Condition:</strong> {vehicleAssessment.conditionMet}
        </p>

        <div className="radiation-badge-row">
          {vehicleAssessment.countermeasures.map((cm, idx) => (
            <span key={idx} className="badge" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-control)' }}>
              • {cm.split(':')[0]}
            </span>
          ))}
        </div>
      </section>

      {/* Interactive Simulation Preset Controller Bar */}
      <section className="radiation-sim-bar" aria-labelledby="sim-bar-title">
        <div className="sim-bar-title">
          <span id="sim-bar-title">
            <RefreshCw size={14} style={{ display: 'inline', marginRight: '6px' }} />
            Simulate Transit Conditions & CARN Flare Telemetry
          </span>
          <span>Click a scenario, then replay to watch the event unfold:</span>
        </div>

        <div className="sim-scenario-groups">
          <div className="sim-buttons-group" role="group" aria-label="Radiation telemetry scenarios">
            {ENVIRONMENT_SCENARIOS.filter((s) => s.group === 'preset').map((s) => {
              const isSelected = activeScenarioKey === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  className={`sim-button${isSelected ? ' is-active' : ''}`}
                  onClick={() => selectScenario(s.key)}
                  aria-pressed={isSelected}
                >
                  {s.key === 'GREEN' && <ShieldCheck size={14} />}
                  {s.key === 'YELLOW' && <AlertTriangle size={14} />}
                  {s.key === 'ORANGE' && <AlertTriangle size={14} />}
                  {s.key === 'RED' && <AlertOctagon size={14} />}
                  {s.key === 'RECOVERY' && <Activity size={14} />}
                  {s.name}
                </button>
              );
            })}
          </div>
          <div className="sim-buttons-group" role="group" aria-label="Additional demonstration events">
            {ENVIRONMENT_SCENARIOS.filter((s) => s.group === 'demo').map((s) => {
              const isSelected = activeScenarioKey === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  className={`sim-button sim-button-demo${isSelected ? ' is-active' : ''}`}
                  onClick={() => selectScenario(s.key)}
                  aria-pressed={isSelected}
                >
                  {s.short}
                </button>
              );
            })}
          </div>
        </div>

        <div className="sim-transport">
          <button
            type="button"
            className="button button-sm button-secondary"
            onClick={() => (isPlaying ? setIsPlaying(false) : replayFromStart())}
            disabled={frames.length <= 1}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            {isPlaying ? 'Pause' : 'Replay event'}
          </button>
          <button
            type="button"
            className="button button-sm button-secondary"
            onClick={() => { setIsPlaying(false); setFrameIndex((i) => Math.min(i + 1, frames.length - 1)); }}
            disabled={frames.length <= 1 || clampedIndex >= frames.length - 1}
          >
            <SkipForward size={14} /> Step
          </button>
          <button
            type="button"
            className="button button-sm button-secondary"
            onClick={() => { setIsPlaying(false); setFrameIndex(0); }}
            disabled={frames.length <= 1 || clampedIndex === 0}
          >
            <RotateCcw size={14} /> Reset
          </button>
          <span className="sim-frame-indicator">
            Sample {clampedIndex + 1} / {frames.length}
          </span>
        </div>

        <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
          {envScenario.description}
        </p>
      </section>

      {/* Main Grid: Spacecraft Map & Telemetry HUD */}
      <div className="radiation-schematic-grid">
        {/* Left: Spacecraft Compartment Map & CARN Telemetry */}
        <div className="map-card">
          <div className="map-header">
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
                Spacecraft Compartment Map & CARN Nodes
              </h2>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.82rem' }}>
                Each node shows temperature (°C), radiation (mSv/h) and CO₂ (mmHg) over the ISS model.
              </p>
            </div>
            <span className="badge">
              Selected: <strong>{selectedCompartment.name}</strong>
            </span>
          </div>

          {/* Three ISS-wide sensor averages */}
          <div className="env-averages" role="group" aria-label="ISS-wide sensor averages">
            <div className="env-averages-head">
              <span>ISS-WIDE SENSOR AVERAGES</span>
              <span className="badge badge-synthetic">
                Simulated · {minReporting}/{summary.totalNodes} nodes reporting
              </span>
            </div>
            <div className="env-averages-row">
              <div className="env-avg-cell">
                <span className="env-avg-label"><Thermometer size={13} aria-hidden="true" /> Avg Temp</span>
                <span className="env-avg-value">{fmtAvg(summary.avgTemperatureC, 1, '°C')}</span>
              </div>
              <div className="env-avg-cell">
                <span className="env-avg-label"><Radiation size={13} aria-hidden="true" /> Avg Radiation</span>
                <span className="env-avg-value">{fmtAvg(summary.avgRadiationMsvH, 2, 'mSv/h')}</span>
              </div>
              <div className="env-avg-cell">
                <span className="env-avg-label"><Wind size={13} aria-hidden="true" /> Avg CO₂</span>
                <span className="env-avg-value">{fmtAvg(summary.avgCo2Mmhg, 1, 'mmHg')}</span>
              </div>
            </div>
            <p className="env-averages-foot muted">
              Averages are the arithmetic mean of valid nodes (including the shelter). Hazard severity uses the
              peak affected room{peakRoomName ? <> — currently <strong>{peakRoomName}</strong> at {(localization.peakDoseRateMsvH ?? 0).toFixed(2)} mSv/h</> : ''}, not the mean.
            </p>
          </div>

          {/* Possible radiation event / environmental alert */}
          {alarm && (
            <div className="env-alert env-alert-critical" role="alert">
              <div className="env-alert-head">
                <span className="env-alert-sign" aria-hidden="true">⚠️</span>
                <div>
                  <strong className="env-alert-title">
                    POSSIBLE RADIATION EVENT · {alarmSeverity}
                  </strong>
                  <p className="env-alert-sector">
                    {localization.estimatedSector
                      ? <>Estimated exposure sector (simulation): <strong>{localization.estimatedSector}</strong> · {localization.confidence} confidence</>
                      : <>Direction uncertain — evidence is diffuse or insufficient</>}
                  </p>
                </div>
                <span className="badge badge-synthetic">Simulated</span>
              </div>
              <p className="env-alert-body">
                {firstHitNames.length > 0 && <>First detected in <strong>{firstHitNames.join(' and ')}</strong>. </>}
                {localization.temperatureCorroborated
                  ? 'Temperature rose in those modules as corroboration. '
                  : 'Temperature did not corroborate; the radiation reading alarms on its own. '}
                Proceed to the Central Storm Shelter and follow the lowest-dose route below.
              </p>
              <div className="env-alert-actions">
                <button
                  type="button"
                  className="button button-xs button-secondary"
                  onClick={() => setAlarmSoundEnabled((on) => !on)}
                  aria-pressed={alarmSoundEnabled}
                >
                  {alarmSoundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                  {alarmSoundEnabled ? 'Alarm sound on' : 'Enable alarm sound'}
                </button>
                {alarmSoundEnabled && (
                  <button
                    type="button"
                    className="button button-xs button-secondary"
                    onClick={() => setAlarmAcknowledged(true)}
                    disabled={alarmAcknowledged}
                  >
                    {alarmAcknowledged ? 'Audio acknowledged (visual alarm stays)' : 'Acknowledge / mute audio'}
                  </button>
                )}
              </div>
            </div>
          )}
          {!alarm && (localization.state === 'WATCH' && localization.co2Anomaly) && (
            <div className="env-alert env-alert-watch" role="status">
              <div className="env-alert-head">
                <Wind size={18} aria-hidden="true" />
                <div>
                  <strong className="env-alert-title">AIR-QUALITY WATCH — CO₂ elevated</strong>
                  <p className="env-alert-sector">Independent environmental warning. This is <strong>not</strong> a solar-radiation event.</p>
                </div>
                <span className="badge badge-synthetic">Simulated</span>
              </div>
            </div>
          )}

          <RadiationStationMap
            snapshotByRoom={snapshotByRoom}
            crew={crewProfiles}
            directionalEvent={directionalEvent}
            localization={localization}
            shelterSafe={shelterSafe}
            selectedRoomId={selectedRoomId}
            onSelectRoom={setSelectedRoomId}
          />

          {/* Directional Event Localization HUD Box */}
          <div className="directional-hud-panel">
            <div className="hud-vector-row">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem' }}>
                <Compass size={16} color="var(--accent)" aria-hidden="true" />
                <strong>Solar Storm Directional Localization:</strong>
              </span>
              <span className="hud-vector-heading">{directionalEvent.vectorHeading}</span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '0.84rem' }}>
              {directionalEvent.description}
            </p>
            <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
              <strong>Temporal estimate:</strong> {localization.explanation}
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.82rem', marginTop: '2px' }}>
              <span>
                Peak Exposed: <strong>{peakRoomName ?? 'None'}</strong> (
                {directionalEvent.highestDoseRateMsvH.toFixed(2)} mSv/h)
              </span>
              <span>
                Central Shelter: <strong>{directionalEvent.coreShelterDoseRateMsvH.toFixed(2)} mSv/h</strong>
              </span>
              <span className="hud-attenuation">
                Shielding Attenuation: <strong>{directionalEvent.attenuationRatio.toFixed(1)}x</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right: Selected Room CARN Sensor Deep-Dive & Time-Series */}
        <div className="gauge-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Dedicated CARN Sensor Node
              </span>
              <h3 style={{ margin: '2px 0 0', fontSize: '1.15rem' }}>{selectedCompartment.name}</h3>
            </div>
            <span
              className={`matrix-status-cell ${
                selectedTelemetry.doseRateMsvH > CARN_RATES.ACUTE_BREACH_HOURLY
                  ? 'restricted'
                  : selectedTelemetry.doseRateMsvH > CARN_RATES.SAFE_BASELINE_HOURLY
                  ? 'evac'
                  : 'allowed'
              }`}
            >
              {selectedTelemetry.doseRateMsvH > CARN_RATES.ACUTE_BREACH_HOURLY ? (
                <>
                  <Lock size={12} /> HATCH LOCKED
                </>
              ) : (
                <>
                  <Unlock size={12} /> HATCH OPEN
                </>
              )}
            </span>
          </div>

          {/* Tri-metric readings for the selected node */}
          <div className="selected-metric-trio">
            <div className="selected-metric">
              <span className="muted"><Thermometer size={12} aria-hidden="true" /> Temperature</span>
              <strong>{selectedSnapshot && typeof selectedSnapshot.temperatureC === 'number'
                ? `${selectedSnapshot.temperatureC.toFixed(1)} °C` : 'No recent reading'}</strong>
            </div>
            <div className="selected-metric">
              <span className="muted"><Radiation size={12} aria-hidden="true" /> Radiation</span>
              <strong>{selectedSnapshot && typeof selectedSnapshot.radiationDoseRateMsvH === 'number'
                ? `${selectedSnapshot.radiationDoseRateMsvH.toFixed(2)} mSv/h` : 'No recent reading'}</strong>
            </div>
            <div className="selected-metric">
              <span className="muted"><Wind size={12} aria-hidden="true" /> CO₂</span>
              <strong>{selectedSnapshot && typeof selectedSnapshot.co2Mmhg === 'number'
                ? `${selectedSnapshot.co2Mmhg.toFixed(1)} mmHg` : 'No recent reading'}</strong>
            </div>
          </div>

          {/* Key Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ padding: '8px', background: 'var(--bg-raised)', borderRadius: '8px' }}>
              <span className="muted" style={{ fontSize: '0.75rem' }}>Real-time Rate</span>
              <p style={{ margin: '2px 0 0', font: '700 1.2rem var(--mono)', color: 'var(--accent)' }}>
                {selectedTelemetry.doseRateMsvH.toFixed(2)} <small style={{ fontSize: '0.75rem' }}>mSv/h</small>
              </p>
            </div>
            <div style={{ padding: '8px', background: 'var(--bg-raised)', borderRadius: '8px' }}>
              <span className="muted" style={{ fontSize: '0.75rem' }}>Projected Daily</span>
              <p style={{ margin: '2px 0 0', font: '700 1.2rem var(--mono)' }}>
                {selectedTelemetry.projectedDailyMsv.toFixed(1)} <small style={{ fontSize: '0.75rem' }}>mSv/d</small>
              </p>
            </div>
            <div style={{ padding: '8px', background: 'var(--bg-raised)', borderRadius: '8px' }}>
              <span className="muted" style={{ fontSize: '0.75rem' }}>Particle Flux</span>
              <p style={{ margin: '2px 0 0', font: '700 1.1rem var(--mono)' }}>
                {selectedTelemetry.particleFlux} <small style={{ fontSize: '0.7rem' }}>p/cm²·s</small>
              </p>
            </div>
            <div style={{ padding: '8px', background: 'var(--bg-raised)', borderRadius: '8px' }}>
              <span className="muted" style={{ fontSize: '0.75rem' }}>Shielding Thickness</span>
              <p style={{ margin: '2px 0 0', font: '700 1.1rem var(--mono)' }}>
                {selectedCompartment.shieldingFactor} <small style={{ fontSize: '0.7rem' }}>g/cm² H₂O</small>
              </p>
            </div>
          </div>

          {/* Per-Room Time-Series Chart */}
          <div className="carn-chart-wrap" style={{ padding: '10px' }}>
            <div className="chart-controls">
              <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>CARN Time-Series Timeline</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['1min', '1hr', '24hr'] as const).map((res) => (
                  <button
                    key={res}
                    type="button"
                    className={`button button-xs button-secondary${timelineResolution === res ? ' is-selected' : ''}`}
                    onClick={() => setTimelineResolution(res)}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            <svg className="chart-svg" viewBox="0 0 300 120" role="img" aria-label="CARN time series graph">
              <line x1="0" y1="95" x2="300" y2="95" stroke="var(--status-steady)" strokeWidth="1" strokeDasharray="3 3" />
              <text x="2" y="92" fill="var(--status-steady)" fontSize="7" fontFamily="var(--mono)">
                0.15 mSv/h Safe Baseline
              </text>
              <line x1="0" y1="40" x2="300" y2="40" stroke="var(--nasa-red)" strokeWidth="1" strokeDasharray="3 3" />
              <text x="2" y="37" fill="var(--nasa-red)" fontSize="7" fontFamily="var(--mono)">
                2.10 mSv/h Acute Breach
              </text>
              {(() => {
                const maxVal = Math.max(...timelinePoints.map((p) => p.doseRateMsvH), 2.5);
                const pathD = timelinePoints
                  .map((p, idx) => {
                    const x = (idx / (timelinePoints.length - 1)) * 290 + 5;
                    const y = 110 - (p.doseRateMsvH / maxVal) * 95;
                    return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                  })
                  .join(' ');
                return <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2" />;
              })()}
            </svg>
          </div>
        </div>
      </div>

      {/* Dynamic Personalized Room Access Matrix Table */}
      <section className="radiation-matrix-card" aria-labelledby="matrix-title">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <div>
            <h2 id="matrix-title" style={{ margin: 0, fontSize: '1.2rem' }}>
              Personalized Room Access & Dynamic Lockdown Matrix
            </h2>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>
              Evaluates individual permissible dose safety per astronaut. Rooms are flagged <strong>RESTRICTED</strong> if acute rate &gt; 2.1 mSv/h,
              projected 8-hour shift &gt; 5% remaining 30-day budget, &gt; 2% remaining career budget, or career ceiling reached.
            </p>
          </div>
          <span className="badge">
            <Users size={14} style={{ display: 'inline', marginRight: '4px' }} /> 4 Active Crew Profiles
          </span>
        </div>

        <div className="matrix-table-wrap">
          <table className="radiation-matrix-table">
            <thead>
              <tr>
                <th>Crew Member</th>
                <th>Role & Career Tier</th>
                <th>Remaining 30D / Career</th>
                {SPACECRAFT_COMPARTMENTS.map((comp) => (
                  <th key={comp.id} title={`${comp.name} (${comp.shieldingFactor} g/cm²)`}>
                    {comp.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accessMatrix.map(({ crew, calculated, roomEvaluations }) => (
                <tr key={crew.id}>
                  <td>
                    <strong>{crew.displayName}</strong>
                    {crew.lastBeaconLocation && (
                      <span className="beacon-badge" title="Last recorded location beacon">
                        <MapPin size={11} /> {SPACECRAFT_COMPARTMENTS.find(c => c.id === crew.lastBeaconLocation)?.name}
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {crew.role}
                    </span>
                    <span className="badge" style={{ fontSize: '0.72rem', padding: '1px 5px' }}>
                      {calculated.tier.name}
                    </span>
                  </td>
                  <td>
                    <div style={{ font: '600 0.82rem var(--mono)' }}>
                      <span style={{ color: calculated.remaining30DayBudgetMsv < 50 ? 'var(--nasa-red)' : 'var(--text-primary)' }}>
                        30D: {calculated.remaining30DayBudgetMsv.toFixed(1)} mSv
                      </span>
                      <br />
                      <span style={{ color: calculated.remainingCareerBudgetMsv < 150 ? 'var(--status-trend)' : 'var(--text-muted)' }}>
                        Car: {calculated.remainingCareerBudgetMsv.toFixed(1)} mSv
                      </span>
                    </div>
                  </td>
                  {roomEvaluations.map((evalResult) => {
                    const isRestricted = evalResult.isRestricted;
                    const statusClass =
                      evalResult.status === 'ALLOWED'
                        ? 'allowed'
                        : evalResult.status === 'EVACUATION_TRANSIT_ONLY'
                        ? 'evac'
                        : 'restricted';

                    return (
                      <td key={evalResult.roomId}>
                        <span className={`matrix-status-cell ${statusClass}`}>
                          {isRestricted ? <Lock size={12} /> : <CheckCircle2 size={12} />}
                          {evalResult.status}
                        </span>

                        {isRestricted && (
                          <small className="threat-warning-pill">
                            {evalResult.lockoutReasons[0]}
                          </small>
                        )}

                        {evalResult.beaconAlert && (
                          <div style={{ marginTop: '4px', color: 'var(--nasa-red)', fontWeight: 700, fontSize: '0.75rem' }}>
                            🚨 BEACON ALERT: Crew inside restricted hazard zone!
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Turn-by-Turn Evacuation Routing Assistant */}
      <section className="evac-route-box" aria-labelledby="evac-route-title">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600 }}>
              Dijkstra Pathfinding Algorithm
            </span>
            <h2 id="evac-route-title" style={{ margin: '2px 0 0', fontSize: '1.15rem' }}>
              Automated Turn-by-Turn Lowest-Dose Evacuation Route
            </h2>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.84rem' }}>
              Computes the safest path to the Central Storm Shelter from the astronaut's last known beacon check-in, avoiding CARN hotzones.
            </p>
          </div>

          <div className="evac-crew-picker">
            <label htmlFor="evac-crew-select" className="muted" style={{ fontSize: '0.85rem' }}>
              Select Astronaut:
            </label>
            <select
              id="evac-crew-select"
              value={selectedCrewId}
              onChange={(e) => setSelectedCrewId(e.target.value)}
              className="button button-secondary button-sm"
              style={{ colorScheme: 'dark' }}
            >
              {crewProfiles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} (at {SPACECRAFT_COMPARTMENTS.find(r => r.id === c.lastBeaconLocation)?.name})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '10px', background: 'var(--bg-raised)', borderRadius: '8px' }}>
          <div>
            <span className="muted" style={{ fontSize: '0.75rem' }}>Starting Beacon:</span>{' '}
            <strong>{SPACECRAFT_COMPARTMENTS.find(c => c.id === evacuationRoute.startRoomId)?.name}</strong>
          </div>
          <div>
            <span className="muted" style={{ fontSize: '0.75rem' }}>Destination:</span>{' '}
            <strong>{shelterSafe
              ? 'Central Storm Shelter (Surrounded by Water & Food Stores)'
              : 'Central Storm Shelter — shelter status requires verification'}</strong>
          </div>
          <div>
            <span className="muted" style={{ fontSize: '0.75rem' }}>Total Transit Exposure:</span>{' '}
            <strong style={{ color: shelterSafe ? 'var(--status-steady)' : 'var(--nasa-red)' }}>
              {evacuationRoute.estimatedTransitDoseMsv.toFixed(4)} mSv
            </strong>
          </div>
          {evacuationRoute.avoidedHotzones.length > 0 && (
            <div>
              <span className="muted" style={{ fontSize: '0.75rem' }}>Rerouted around hotzones:</span>{' '}
              <strong style={{ color: 'var(--nasa-red)' }}>{evacuationRoute.avoidedHotzones.join(', ')}</strong>
            </div>
          )}
        </div>

        <ol className="evac-steps-list">
          {evacuationRoute.turnByTurn.map((step) => (
            <li key={step.step} className={`evac-step-item${step.isHotzone ? ' is-hotzone' : ''}`}>
              <span className="step-num-badge">{step.step}</span>
              <div>
                <p className="step-instruction">
                  <Footprints size={14} style={{ display: 'inline', marginRight: '6px', color: 'var(--accent)' }} />
                  {step.instruction}
                </p>
                <span className="muted" style={{ fontSize: '0.78rem' }}>
                  Module: <strong>{step.roomName}</strong>
                </span>
              </div>
              <span className="step-rate-badge">
                CARN: {step.doseRateMsvH.toFixed(2)} mSv/h
              </span>
            </li>
          ))}
        </ol>

        {vehicleAssessment.status === 'RED' && (
          <div style={{ padding: '12px', background: 'rgba(255, 105, 77, 0.15)', border: '1px solid var(--nasa-red)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <strong style={{ color: 'var(--nasa-red)' }}>
                  <Timer size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  MANDATORY 5-MINUTE CREW ACCOUNTABILITY CHECK
                </strong>
                <p style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>
                  Verify that 100% of crew members have arrived inside the shielded perimeter within 5 minutes of storm alarm.
                </p>
              </div>
              <button
                type="button"
                className={`button ${accountabilityChecked ? 'button-secondary' : 'button-warning'}`}
                onClick={() => setAccountabilityChecked(true)}
              >
                {accountabilityChecked ? '✓ 4/4 Crew Accounted For in Shelter' : 'Confirm 100% Shelter Beacon Muster'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Cumulative Career & 30-Day Budget Tracking */}
      <section className="radiation-gauges-grid" aria-labelledby="budgets-heading">
        <div className="gauge-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 id="budgets-heading" style={{ margin: 0, fontSize: '1.05rem' }}>
              Career Effective Dose Progress
            </h3>
            <span className="badge" style={{ fontSize: '0.75rem' }}>
              {selectedCrewCalculated.displayName}
            </span>
          </div>

          <div className="gauge-kpi-row">
            <div>
              <span className="gauge-kpi-num">
                {selectedCrewCalculated.totalCareerDoseMsv.toFixed(1)}{' '}
                <small style={{ fontSize: '0.9rem' }}>mSv</small>
              </span>
              <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                Pre-mission: {selectedCrewCalculated.preMissionBaselineMsv} mSv + Mission: {selectedCrewCalculated.missionTotalDoseMsv.toFixed(1)} mSv
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="gauge-kpi-sub">
                {selectedCrewCalculated.remainingCareerBudgetMsv.toFixed(1)} mSv
              </span>
              <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                Remaining Budget
              </span>
            </div>
          </div>

          <div className="gauge-track">
            <div
              className="gauge-fill"
              style={{
                width: `${Math.min(100, (selectedCrewCalculated.totalCareerDoseMsv / CAREER_LIMIT_MSV) * 100)}%`,
                background:
                  selectedCrewCalculated.totalCareerDoseMsv >= 450
                    ? 'var(--nasa-red)'
                    : selectedCrewCalculated.totalCareerDoseMsv >= 300
                    ? 'var(--status-trend)'
                    : selectedCrewCalculated.totalCareerDoseMsv >= 150
                    ? 'var(--status-change)'
                    : 'var(--status-steady)',
              }}
            />
          </div>

          <div className="gauge-milestones-row">
            <span>0 mSv</span>
            <span style={{ color: selectedCrewCalculated.totalCareerDoseMsv >= 150 ? 'var(--status-change)' : 'inherit' }}>
              150 (25%)
            </span>
            <span style={{ color: selectedCrewCalculated.totalCareerDoseMsv >= 300 ? 'var(--status-trend)' : 'inherit' }}>
              300 (50%)
            </span>
            <span style={{ color: selectedCrewCalculated.totalCareerDoseMsv >= 450 ? 'var(--nasa-red)' : 'inherit' }}>
              450 (75%)
            </span>
            <span style={{ color: 'var(--nasa-red)', fontWeight: 700 }}>600 (100%)</span>
          </div>

          <div
            style={{
              padding: '10px',
              borderRadius: '8px',
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-subtle)',
              marginTop: '4px',
            }}
          >
            <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              {selectedCrewCalculated.tier.warningMessage(selectedCrewCalculated.crewId)}
            </strong>
            <ul className="hazard-list" style={{ marginTop: '6px', fontSize: '0.82rem' }}>
              {selectedCrewCalculated.tier.automatedActions.map((action, i) => (
                <li key={i}>{action}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="gauge-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Rolling 30-Day Cumulative Dose</h3>
            <span className="badge" style={{ fontSize: '0.75rem' }}>
              Limit: 250 mSv
            </span>
          </div>

          <div className="gauge-kpi-row">
            <div>
              <span className="gauge-kpi-num">
                {selectedCrewCalculated.rolling30DayDoseMsv.toFixed(1)}{' '}
                <small style={{ fontSize: '0.9rem' }}>mSv</small>
              </span>
              <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                Sum of past 30 mission sols
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="gauge-kpi-sub" style={{ color: selectedCrewCalculated.remaining30DayBudgetMsv < 50 ? 'var(--nasa-red)' : 'var(--text-primary)' }}>
                {selectedCrewCalculated.remaining30DayBudgetMsv.toFixed(1)} mSv
              </span>
              <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                Remaining 30D Budget
              </span>
            </div>
          </div>

          <div className="gauge-track">
            <div
              className="gauge-fill"
              style={{
                width: `${Math.min(100, (selectedCrewCalculated.rolling30DayDoseMsv / 250) * 100)}%`,
                background:
                  selectedCrewCalculated.rolling30DayDoseMsv >= 250
                    ? 'var(--nasa-red)'
                    : selectedCrewCalculated.rolling30DayDoseMsv >= 105
                    ? 'var(--status-trend)'
                    : 'var(--status-steady)',
              }}
            />
          </div>

          <div className="gauge-milestones-row">
            <span>0 mSv</span>
            <span style={{ color: selectedCrewCalculated.rolling30DayDoseMsv >= 105 ? 'var(--status-change)' : 'inherit' }}>
              105 mSv (Safe Cap)
            </span>
            <span style={{ color: 'var(--nasa-red)', fontWeight: 700 }}>250 mSv (Breach Threat)</span>
          </div>

          <div
            style={{
              padding: '10px',
              borderRadius: '8px',
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-subtle)',
              marginTop: '4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Salad size={15} color="var(--status-steady)" />
              <strong style={{ fontSize: '0.85rem' }}>Dietary & Radioprotective Protocol:</strong>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              Prioritize antioxidant-rich foods: freeze-dried blueberries, strawberries, kale, spinach, walnuts, and lycopene tomatoes.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '8px 0 2px' }}>
              <Pill size={15} color="var(--accent)" />
              <strong style={{ fontSize: '0.85rem' }}>Recommended Supplements:</strong>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              Vitamin C, Vitamin E, Selenium, N-acetylcysteine (NAC), and Omega-3 fatty acids.
            </p>
          </div>
        </div>
      </section>

      {/* Post-Event Monitoring & De-Escalation Workflow Console */}
      <section className="recovery-box" aria-labelledby="recovery-heading">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--status-check)', fontWeight: 600 }}>
              Post-Event De-escalation & Biometric Recovery Protocol
            </span>
            <h2 id="recovery-heading" style={{ margin: '2px 0 0', fontSize: '1.2rem' }}>
              Hysteresis Verification & Lymphocyte Recovery
            </h2>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>
              Hysteresis rule: The software <strong>must not</strong> unlock closed rooms or clear warnings upon a single low reading.
              All compartment CARN sensors must verify &le; 0.15 mSv/h continuously for <strong>at least 6 consecutive hours</strong>.
            </p>
          </div>

          <span className="badge" style={{ background: 'var(--bg-surface)' }}>
            Hysteresis Window: 6.0 Hours
          </span>
        </div>

        <div className="hysteresis-progress-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
            <span>Consecutive Stabilized Hours:</span>
            <strong>
              {activeScenarioKey === 'RECOVERY'
                ? (recoveryState?.hoursBelowThreshold ?? 3.5).toFixed(1)
                : activeScenarioKey === 'GREEN'
                ? '6.0 (Complete)'
                : '0.0 (Event Active)'}{' '}
              / 6.0 Hours
            </strong>
          </div>
          <div className="hysteresis-bar">
            <div
              className="hysteresis-fill"
              style={{
                width: `${
                  activeScenarioKey === 'RECOVERY'
                    ? ((recoveryState?.hoursBelowThreshold ?? 3.5) / 6) * 100
                    : activeScenarioKey === 'GREEN'
                    ? 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        <div className="assay-cards-grid">
          <div className="assay-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>24-Hour Lymphocyte Assay</strong>
              <span className={`badge ${assay24Done || activeScenarioKey === 'RECOVERY' ? 'status-steady' : ''}`}>
                {assay24Done || activeScenarioKey === 'RECOVERY' ? '✓ Completed' : 'Pending'}
              </span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              Finger-prick blood/saliva sample to evaluate bone marrow suppression & peripheral lymphocyte recovery.
            </p>
            <button
              type="button"
              className="button button-xs button-secondary"
              onClick={() => setAssay24Done(true)}
              disabled={assay24Done || activeScenarioKey === 'RECOVERY'}
            >
              {assay24Done || activeScenarioKey === 'RECOVERY' ? 'Result: 88% Baseline Lymphocytes' : 'Log 24h Finger-Prick Assay'}
            </button>
          </div>

          <div className="assay-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>48-Hour Follow-Up Assay</strong>
              <span className={`badge ${assay48Done ? 'status-steady' : ''}`}>
                {assay48Done ? '✓ Completed' : 'Scheduled'}
              </span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              Confirm continued hematopoietic recovery before restoring full physical training and EVA clearance.
            </p>
            <button
              type="button"
              className="button button-xs button-secondary"
              onClick={() => setAssay48Done(true)}
              disabled={assay48Done}
            >
              {assay48Done ? 'Result: 96% Recovery (Nominal)' : 'Log 48h Follow-Up Assay'}
            </button>
          </div>

          <div className="assay-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Phased Re-Opening</strong>
              <span className={`badge ${reopenPhasedDone ? 'status-steady' : ''}`}>
                {reopenPhasedDone ? 'Unlocked' : 'Gated'}
              </span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              Recalculates individual remaining dose budgets and selectively re-opens compartments per crew member.
            </p>
            <button
              type="button"
              className="button button-xs button-primary"
              onClick={() => {
                setReopenPhasedDone(true);
                selectScenario('GREEN');
              }}
            >
              Recalculate Budgets & Restore Access
            </button>
          </div>
        </div>
      </section>

      {/* Navigation Footer */}
      <footer style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem' }}>
        <Link to="/hazards" className="button button-secondary">
          ← Back to all hazards
        </Link>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link to="/cmo" className="button button-secondary">
            CMO console <ArrowRight size={15} style={{ display: 'inline', marginLeft: '4px' }} />
          </Link>
          <Link to="/timeline" className="button button-secondary">
            Mission Timeline <ArrowRight size={15} style={{ display: 'inline', marginLeft: '4px' }} />
          </Link>
        </div>
      </footer>
    </div>
  );
}
