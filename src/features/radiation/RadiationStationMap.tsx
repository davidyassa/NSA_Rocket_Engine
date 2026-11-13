import { useId } from 'react';
import { Shield, Users } from 'lucide-react';
import { InteractiveStation } from '../media/StationModel';
import type { StationAnchor } from '../media/stationViewport';
import { SPACECRAFT_COMPARTMENTS } from './radiationData';
import {
  CARN_RATES, type CARNSensorTelemetry, type CrewRadiationProfile, type DirectionalEventLocalization,
} from './radiationEngine';

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
  { id: 'habitation', label: 'Habitation', side: 'left', y: 18 },
  { id: 'airlock', label: 'Science / EVA', side: 'left', y: 42 },
  { id: 'flight-deck', label: 'Flight Deck', side: 'left', y: 66 },
  { id: 'storm-shelter', label: 'Storm Shelter', side: 'right', y: 18 },
  { id: 'galley', label: 'Galley', side: 'right', y: 42 },
  { id: 'equipment-bay', label: 'Equipment Bay', side: 'right', y: 66 },
] as const;

export function RadiationStationMap({
  telemetry, crew, directionalEvent, selectedRoomId, onSelectRoom,
}: {
  telemetry: Record<string, CARNSensorTelemetry>;
  crew: readonly CrewRadiationProfile[];
  directionalEvent: DirectionalEventLocalization;
  selectedRoomId: string;
  onSelectRoom: (id: string) => void;
}) {
  const hintId = useId();
  const { severity, primaryExposedModuleId, bearingDegrees } = directionalEvent;

  return (
    <div className="radiation-station">
      <div className="iss-stage radiation-station-stage">
        <InteractiveStation
          describedBy={hintId}
          anchors={ANCHORS}
          incident={severity === 'NOMINAL' ? null : { roomId: primaryExposedModuleId, bearingDegrees }}
          renderOverlay={(points) => (
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
                    </g>
                  );
                })}
              </svg>
              {LABELS.map(({ id, label, side, y }) => {
                const room = SPACECRAFT_COMPARTMENTS.find((compartment) => compartment.id === id)!;
                const rate = telemetry[id]?.doseRateMsvH ?? 0.08;
                const level = rate > CARN_RATES.ACUTE_BREACH_HOURLY ? 'acute'
                  : rate > CARN_RATES.SAFE_BASELINE_HOURLY ? 'elevated' : 'baseline';
                const crewHere = crew.filter((member) => member.lastBeaconLocation === id);
                const beaconLabel = crewHere.map((member) => member.displayName).join(', ');

                return (
                  <button
                    key={id}
                    type="button"
                    className="radiation-station-marker"
                    data-side={side}
                    style={{ top: `${y}%` }}
                    aria-pressed={selectedRoomId === id}
                    aria-label={`${room.name}, ${rate.toFixed(2)} mSv/h, ${room.shieldingFactor} g/cm²${beaconLabel ? `, crew: ${beaconLabel}` : ''}`}
                    onClick={() => onSelectRoom(id)}
                  >
                    <strong>{label}</strong>
                    <span className="radiation-room-rate" data-level={level}>{rate.toFixed(2)} mSv/h</span>
                    <span className="radiation-station-shielding">
                      {room.isStormShelter && <Shield size={11} aria-hidden="true" />}
                      {room.shieldingFactor} g/cm²
                      {beaconLabel && <span title={beaconLabel}><Users size={12} aria-hidden="true" /></span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        />
      </div>
      <p id={hintId} className="muted radiation-station-caption">
        Simulated transit compartments on the ISS model. Drag or use the arrow keys to rotate. Select a sensor to see its readings.
      </p>
    </div>
  );
}
