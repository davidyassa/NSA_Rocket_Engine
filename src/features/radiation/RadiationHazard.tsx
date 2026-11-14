import { useEffect, useMemo, useRef, useState } from 'react';
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
  RotateCcw,
  Salad,
  ShieldCheck,
  SkipForward,
  Thermometer,
  Unlock,
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

export function RadiationHazard({ scenario, onInspectRoom, command }: {
  scenario?: DemoScenario;
  onInspectRoom?: (roomId: string) => void;
  /** External "click this compartment" signal from Sol's voice control. */
  command?: { id: string; n: number };
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
  // Sol's voice can select a compartment ("open the storm shelter"); the nonce
  // makes a repeated command for the same room re-fire.
  useEffect(() => { if (command) setSelectedRoomId(command.id); }, [command]);

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
  const minReporting = Math.min(
    summary.validCounts.temperature,
    summary.validCounts.radiation,
    summary.validCounts.co2,
  );

  return (
    <div className="radiation-container">
      {/* Interactive Simulation Preset Controller Bar */}
      <section className="radiation-sim-bar" aria-labelledby="sim-bar-title">
        <div className="sim-bar-title">
          <span id="sim-bar-title">
            DEMO SIMULATION
          </span>
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
        </div>
      </section>

      {/* Post-event de-escalation: shown only while the simulation is in recovery. */}
      {envScenario.recoveryActive && (
        <section className="recovery-box recovery-box-compact" aria-labelledby="recovery-heading">
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
            <div>
              <h2 id="recovery-heading" style={{ margin: 0, fontSize: '1.1rem' }}>Post-Event De-escalation</h2>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                Complete the recovery checks, then restore room access when the six-hour stabilization window is satisfied.
              </p>
            </div>
            <span className="badge" style={{ background: 'var(--bg-surface)' }}>
              {(recoveryState?.hoursBelowThreshold ?? 0).toFixed(1)} / 6 hours stable
            </span>
          </div>
          <div className="hysteresis-bar" aria-label="Recovery stabilization progress">
            <div className="hysteresis-fill" style={{ width: `${Math.min(100, ((recoveryState?.hoursBelowThreshold ?? 0) / 6) * 100)}%` }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="button" className="button button-xs button-secondary" onClick={() => setAssay24Done(true)} disabled={assay24Done || activeScenarioKey === 'RECOVERY'}>
              {assay24Done || activeScenarioKey === 'RECOVERY' ? '24-hour assay complete' : 'Log 24-hour assay'}
            </button>
            <button type="button" className="button button-xs button-secondary" onClick={() => setAssay48Done(true)} disabled={assay48Done}>
              {assay48Done ? '48-hour assay complete' : 'Log 48-hour assay'}
            </button>
            <button
              type="button"
              className="button button-xs button-primary"
              onClick={() => { setReopenPhasedDone(true); selectScenario('GREEN'); }}
              disabled={reopenPhasedDone}
            >
              {reopenPhasedDone ? 'Access restored' : 'Restore room access'}
            </button>
          </div>
        </section>
      )}

      {/* Current Radiation Status */}
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
            <span className="banner-status-badge">RADIATION STATUS: {vehicleAssessment.status}</span>
          </div>
          {alarm && (
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
          )}
          <h2 id="banner-heading" className="banner-message">{vehicleAssessment.warningMessage}</h2>
        </div>
      </section>

      {/* Main Grid: Spacecraft Map & Telemetry HUD */}
      <div className="radiation-schematic-grid">
        {/* Left: Spacecraft Compartment Map & CARN Telemetry */}
        <div className="map-card">
          <div className="map-header">
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
                Space Station Model
              </h2>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.82rem' }}>
                Select any compartment to inspect its environmental and radiation readings.
              </p>
            </div>
            <span className="badge">
              Selected: <strong>{selectedCompartment.name}</strong>
            </span>
          </div>

          <div className="station-overview-grid">
            <div className="station-model-panel">
          <RadiationStationMap
            snapshotByRoom={snapshotByRoom}
            crew={crewProfiles}
            directionalEvent={directionalEvent}
            localization={localization}
            shelterSafe={shelterSafe}
            selectedRoomId={selectedRoomId}
            onSelectRoom={setSelectedRoomId}
            focusCommand={command}
          />




            </div>
            <div className="station-averages-panel">
          <div className="env-averages env-averages-prominent" role="group" aria-label="ISS-wide sensor averages">
            <div className="env-averages-head">
              <span>ISS-WIDE SENSOR AVERAGES</span>
              <span className="badge badge-synthetic">
                Simulated · {minReporting}/{summary.totalNodes} nodes reporting
              </span>
            </div>
            <div className="env-averages-row">
              <div className="env-avg-cell">
                <span className="env-avg-label"><Thermometer size={25} aria-hidden="true" /> Avg Temp</span>
                <span className="env-avg-value" style={{ fontSize: '1.45rem', fontWeight: 700 }}>{fmtAvg(summary.avgTemperatureC, 1, '°C')}</span>
              </div>
              <div className="env-avg-cell">
                <span className="env-avg-label"><Radiation size={25} aria-hidden="true" /> Avg Radiation</span>
                <span className="env-avg-value" style={{ fontSize: '1.45rem', fontWeight: 700 }}>{fmtAvg(summary.avgRadiationMsvH, 2, 'mSv/h')}</span>
              </div>
              <div className="env-avg-cell">
                <span className="env-avg-label"><Wind size={25} aria-hidden="true" /> Avg CO₂</span>
                <span className="env-avg-value" style={{ fontSize: '1.45rem', fontWeight: 700 }}>{fmtAvg(summary.avgCo2Mmhg, 1, 'mmHg')}</span>
              </div>
            </div>
            <p className="env-averages-foot muted">
              Averages are the arithmetic mean of valid nodes (including the shelter). Hazard severity uses the
              peak affected room{peakRoomName ? <> — currently <strong>{peakRoomName}</strong> at {(localization.peakDoseRateMsvH ?? 0).toFixed(2)} mSv/h</> : ''}, not the mean.
            </p>
          </div>


            </div>
          </div>

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
      </div>

<div className="gauge-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: '2px 0 0', fontSize: '1.15rem' }}>{selectedCompartment.name}</h3>
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

      <div className="room-telemetry-layout">
        <div className="room-measurements">
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

      {/* Crew access overview */}
      <section className="radiation-matrix-card members-section" aria-labelledby="matrix-title">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <h2 id="matrix-title" style={{ margin: 0, fontSize: '1.2rem' }}>Members</h2>
          <span className="badge">{accessMatrix.length} crew members</span>
        </div>
        <div className="members-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
          {accessMatrix.map(({ crew, roomEvaluations }) => {
            const currentLocation = SPACECRAFT_COMPARTMENTS.find((room) => room.id === crew.lastBeaconLocation)?.name ?? 'Unknown';
            const accessibleRooms = roomEvaluations.filter((room) => !room.isRestricted);
            return (
              <article key={crew.id} className="assay-card member-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{crew.displayName}</h3>
                    <span className="muted" style={{ fontSize: '0.82rem' }}>{crew.role}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.75rem', fontSize: '0.88rem' }}>
                  <MapPin size={15} aria-hidden="true" />
                  <span><strong>Location:</strong> {currentLocation}</span>
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}>Accessible rooms</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                    {accessibleRooms.length > 0 ? accessibleRooms.map((room) => {
                      const roomName = SPACECRAFT_COMPARTMENTS.find((item) => item.id === room.roomId)?.name ?? room.roomId;
                      return (
                        <span key={room.roomId} className={`matrix-status-cell ${room.status === 'EVACUATION_TRANSIT_ONLY' ? 'evac' : 'allowed'}`}>
                          {room.status === 'EVACUATION_TRANSIT_ONLY' ? <Footprints size={12} /> : <CheckCircle2 size={12} />}
                          {roomName}
                        </span>
                      );
                    }) : <span className="muted" style={{ fontSize: '0.82rem' }}>No rooms currently accessible</span>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Lowest-dose evacuation route */}
      <section className="evac-route-box evac-route-compact" aria-labelledby="evac-route-title">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
          <div>
            <h2 id="evac-route-title" style={{ margin: 0, fontSize: '1.1rem' }}>Evacuation Route</h2>
            <p className="muted" style={{ margin: '3px 0 0', fontSize: '0.82rem' }}>Follow the lowest-dose route to the Central Storm Shelter.</p>
          </div>
          <div className="evac-crew-picker">
            <label htmlFor="evac-crew-select" className="muted" style={{ fontSize: '0.82rem', marginRight: '0.4rem' }}>Crew member</label>
            <select id="evac-crew-select" value={selectedCrewId} onChange={(e) => setSelectedCrewId(e.target.value)} className="button button-secondary button-sm" style={{ colorScheme: 'dark' }}>
              {crewProfiles.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crew.displayName} — {SPACECRAFT_COMPARTMENTS.find((room) => room.id === crew.lastBeaconLocation)?.name ?? 'Unknown'}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-raised)', borderRadius: '8px' }}>
          <span><strong>From:</strong> {SPACECRAFT_COMPARTMENTS.find((room) => room.id === evacuationRoute.startRoomId)?.name ?? 'Unknown'}</span>
          <ArrowRight size={15} aria-hidden="true" />
          <span><strong>To:</strong> Central Storm Shelter</span>
          <span style={{ marginLeft: 'auto', color: shelterSafe ? 'var(--status-steady)' : 'var(--nasa-red)', fontWeight: 700 }}>
            {evacuationRoute.estimatedTransitDoseMsv.toFixed(4)} mSv estimated exposure
          </span>
        </div>
        {evacuationRoute.avoidedHotzones.length > 0 && (
          <p className="muted" style={{ margin: '0.6rem 0 0', fontSize: '0.8rem' }}>Avoiding: {evacuationRoute.avoidedHotzones.join(', ')}</p>
        )}
        <ol className="evac-steps-list" style={{ marginTop: '0.75rem' }}>
          {evacuationRoute.turnByTurn.map((step) => (
            <li key={step.step} className={`evac-step-item${step.isHotzone ? ' is-hotzone' : ''}`}>
              <span className="step-num-badge">{step.step}</span>
              <div>
                <p className="step-instruction" style={{ margin: 0 }}>
                  <Footprints size={14} style={{ display: 'inline', marginRight: '6px', color: 'var(--accent)' }} />
                  {step.instruction}
                </p>
                <span className="muted" style={{ fontSize: '0.78rem' }}>{step.roomName}</span>
              </div>
              <span className="step-rate-badge">{step.doseRateMsvH.toFixed(2)} mSv/h</span>
            </li>
          ))}
        </ol>
        {vehicleAssessment.status === 'RED' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(255, 105, 77, 0.15)', border: '1px solid var(--nasa-red)', borderRadius: '8px' }}>
            <strong style={{ color: 'var(--nasa-red)' }}>5-minute crew accountability</strong>
            <button type="button" className={`button ${accountabilityChecked ? 'button-secondary' : 'button-warning'}`} onClick={() => setAccountabilityChecked(true)}>
              {accountabilityChecked ? 'Crew accounted for' : 'Confirm crew in shelter'}
            </button>
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
    </div>
  );
}
