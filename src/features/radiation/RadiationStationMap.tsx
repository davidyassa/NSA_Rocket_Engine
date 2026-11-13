import { useId } from 'react';
import { Radiation, Shield, ShieldCheck, ShieldAlert, Thermometer, Users, Wind } from 'lucide-react';
import { InteractiveStation } from '../media/StationModel';
import type { StationAnchor, StationProjection } from '../media/stationViewport';
import { SPACECRAFT_COMPARTMENTS } from './radiationData';
import {
  CARN_RATES, type CrewRadiationProfile, type DirectionalEventLocalization,
} from './radiationEngine';
import type { CompartmentSnapshot, EventLocalization } from './compartmentEnvironmentEngine';

// These ISS nodes place the simulated transit compartments on visible model geometry.
const ROOM_ANCHORS: Record<string, Pick<StationAnchor, 'node' | 'offset'>> = {
  'flight-deck': { node: '26 Harmony Node 2', offset: [0, 2.5, 7] },
  airlock: { node: '12 Quest Airlock', offset: [-2, 2.5, 0] },
  habitation: { node: '05 Zvezda (SM) Service Module', offset: [0, 2.5, -3] },
  'storm-shelter': { node: '02 Unity Node 1', offset: [0, 2.7, -1] },
  galley: { node: '37 Tranquility Node 3', offset: [4, 2.5, 1] },
  'equipment-bay': { node: '30 Kibo Space Laboratory (PSM) Pressurized Module', offset: [6, 2.5, 0] },
};

const ANCHORS: StationAnchor[] = SPACECRAFT_COMPARTMENTS.map(({ id, adjacentRooms }) => ({
  id, ...ROOM_ANCHORS[id], neighbors: adjacentRooms,
}));

const LABELS = [
  { id: 'habitation', label: 'Habitation', side: 'left', y: 16 },
  { id: 'airlock', label: 'Science / EVA', side: 'left', y: 42 },
  { id: 'flight-deck', label: 'Flight Deck', side: 'left', y: 68 },
  { id: 'storm-shelter', label: 'Storm Shelter', side: 'right', y: 16 },
  { id: 'galley', label: 'Galley', side: 'right', y: 42 },
  { id: 'equipment-bay', label: 'Equipment Bay', side: 'right', y: 68 },
] as const;

function fmt(value: number | null | undefined, digits: number, unit: string) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(digits)} ${unit}`
    : '—';
}

/** Average screen position of the visible first-hit nodes, in 0..1 overlay coords. */
function incidentCentroid(points: StationProjection[], firstHitRoomIds: string[]) {
  const hit = points.filter((point) => firstHitRoomIds.includes(point.id) && point.visible);
  if (!hit.length) return null;
  return {
    x: hit.reduce((sum, point) => sum + point.x, 0) / hit.length,
    y: hit.reduce((sum, point) => sum + point.y, 0) / hit.length,
  };
}

export function RadiationStationMap({
  snapshotByRoom, crew, directionalEvent, localization, shelterSafe, selectedRoomId, onSelectRoom,
}: {
  snapshotByRoom: Record<string, CompartmentSnapshot>;
  crew: readonly CrewRadiationProfile[];
  directionalEvent: DirectionalEventLocalization;
  localization: EventLocalization;
  shelterSafe: boolean;
  selectedRoomId: string;
  onSelectRoom: (id: string) => void;
}) {
  const hintId = useId();
  const { severity, primaryExposedModuleId, bearingDegrees } = directionalEvent;
  const alarm = localization.state === 'ALERT';
  const showWaves = alarm && localization.confidence !== 'insufficient';

  return (
    <div className="radiation-station">
      <div className="iss-stage radiation-station-stage">
        <InteractiveStation
          describedBy={hintId}
          anchors={ANCHORS}
          incident={severity === 'NOMINAL' ? null : { roomId: primaryExposedModuleId, bearingDegrees }}
          renderOverlay={(points, focusAnchor) => {
            function selectSensor(id: string) {
              onSelectRoom(id);
              focusAnchor(id);
            }

            const centroid = incidentCentroid(points, localization.firstHitRoomIds);
            // Outward direction = from the screen centre toward the affected nodes.
            const waveAngleDeg = centroid
              ? (Math.atan2(centroid.y - 0.5, centroid.x - 0.5) * 180) / Math.PI
              : 0;
            const shelterPoint = points.find((point) => point.id === 'storm-shelter');

            return (
              <div className="radiation-station-overlay" role="group" aria-label="Simulated compartment sensors">
                <svg className="radiation-station-leaders" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {LABELS.map(({ id, side, y }) => {
                    const point = points.find((item) => item.id === id);
                    if (!point?.visible) return null;
                    const x = point.x * 100;
                    const end = point.y * 100;
                    return (
                      <g key={id} data-anchor={id} className={id === selectedRoomId ? 'is-selected' : undefined}>
                        <line x1={side === 'left' ? 28 : 72} y1={y} x2={x} y2={end} vectorEffect="non-scaling-stroke" />
                        <ellipse cx={x} cy={end} rx="0.55" ry="0.9" vectorEffect="non-scaling-stroke" />
                        <ellipse className="radiation-station-pin-hit" cx={x} cy={end} rx="0.55" ry="0.9"
                          vectorEffect="non-scaling-stroke" onClick={() => selectSensor(id)} />
                      </g>
                    );
                  })}
                </svg>

                {/* Three incoming-wave arcs anchored to the estimated incident side. */}
                {showWaves && centroid && (
                  <div
                    className="radiation-wavefront"
                    style={{
                      left: `${centroid.x * 100}%`,
                      top: `${centroid.y * 100}%`,
                      transform: `translate(-50%, -50%) rotate(${waveAngleDeg}deg)`,
                    }}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 120 120">
                      <path className="wave-arc wave-arc-1" d="M 44 34 A 34 34 0 0 1 44 86" />
                      <path className="wave-arc wave-arc-2" d="M 58 26 A 46 46 0 0 1 58 94" />
                      <path className="wave-arc wave-arc-3" d="M 72 18 A 58 58 0 0 1 72 102" />
                    </svg>
                  </div>
                )}

                {/* Bright-green shelter beacon pinned to the storm-shelter anchor. */}
                {shelterPoint?.visible && (
                  <div
                    className={`radiation-shelter-beacon${alarm ? ' is-active' : ''}${shelterSafe ? '' : ' is-unverified'}`}
                    style={{ left: `${shelterPoint.x * 100}%`, top: `${shelterPoint.y * 100}%` }}
                  >
                    {shelterSafe
                      ? <ShieldCheck size={13} aria-hidden="true" />
                      : <ShieldAlert size={13} aria-hidden="true" />}
                    <span>{shelterSafe ? 'SAFETY SHELTER' : 'SHELTER — VERIFY'}</span>
                  </div>
                )}

                {LABELS.map(({ id, label, side, y }) => {
                  const room = SPACECRAFT_COMPARTMENTS.find((compartment) => compartment.id === id)!;
                  const reading = snapshotByRoom[id];
                  const rate = reading?.radiationDoseRateMsvH;
                  const level = typeof rate === 'number'
                    ? rate > CARN_RATES.ACUTE_BREACH_HOURLY ? 'acute'
                      : rate > CARN_RATES.SAFE_BASELINE_HOURLY ? 'elevated' : 'baseline'
                    : 'baseline';
                  const crewHere = crew.filter((member) => member.lastBeaconLocation === id);
                  const beaconLabel = crewHere.map((member) => member.displayName).join(', ');
                  const isFirstHit = localization.firstHitRoomIds.includes(id);
                  const isAffected = localization.affectedRoomIds.includes(id);
                  const marker = isFirstHit ? 'first' : isAffected && alarm ? 'affected' : undefined;

                  return (
                    <button
                      key={id}
                      type="button"
                      className="radiation-station-marker"
                      data-side={side}
                      data-marker={marker}
                      style={{ top: `${y}%` }}
                      aria-pressed={selectedRoomId === id}
                      aria-label={
                        `${room.name}. Temperature ${fmt(reading?.temperatureC, 1, 'degrees Celsius')}. `
                        + `Radiation ${fmt(rate, 2, 'millisieverts per hour')}. `
                        + `CO2 ${fmt(reading?.co2Mmhg, 1, 'millimetres of mercury')}. `
                        + `Shielding ${room.shieldingFactor} grams per square centimetre.`
                        + (isFirstHit ? ' First hit by the radiation event.' : '')
                        + (beaconLabel ? ` Crew present: ${beaconLabel}.` : '')
                      }
                      onClick={() => selectSensor(id)}
                    >
                      <span className="marker-head">
                        <strong>{label}</strong>
                        {marker === 'first' && <span className="marker-flag marker-flag-first">FIRST</span>}
                        {marker === 'affected' && <span className="marker-flag marker-flag-affected">HIT</span>}
                      </span>
                      <span className="marker-metrics">
                        <span className="marker-metric">
                          <Thermometer size={10} aria-hidden="true" />{fmt(reading?.temperatureC, 1, '°C')}
                        </span>
                        <span className="marker-metric" data-level={level}>
                          <Radiation size={10} aria-hidden="true" />{fmt(rate, 2, 'mSv/h')}
                        </span>
                        <span className="marker-metric">
                          <Wind size={10} aria-hidden="true" />CO₂ {fmt(reading?.co2Mmhg, 1, 'mmHg')}
                        </span>
                      </span>
                      <span className="radiation-station-shielding">
                        {room.isStormShelter && <Shield size={11} aria-hidden="true" />}
                        {room.shieldingFactor} g/cm²
                        {beaconLabel && <span title={beaconLabel}><Users size={12} aria-hidden="true" /></span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          }}
        />
      </div>
      <p id={hintId} className="muted radiation-station-caption">
        Simulated transit compartments on the ISS model — each node shows temperature, radiation and CO₂.
        Select a sensor to zoom in. Drag or use the arrow keys to rotate.
      </p>
    </div>
  );
}
