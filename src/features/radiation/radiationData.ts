import type {
  CompartmentNode,
  CARNSensorTelemetry,
  CrewRadiationProfile,
  PostEventRecoveryState,
} from './radiationEngine';

export const SPACECRAFT_COMPARTMENTS: CompartmentNode[] = [
  {
    id: 'flight-deck',
    name: 'Flight Deck',
    shieldingFactor: 10, // g/cm²
    adjacentRooms: ['habitation', 'airlock'],
    isStormShelter: false,
    isOuterHull: true,
    locationLabel: 'Forward / Sunward Module',
    coordinates: { x: 180, y: 70 },
    quadrant: 'sunward',
  },
  {
    id: 'airlock',
    name: 'Science & EVA Airlock',
    shieldingFactor: 6, // g/cm² - very light outer hull
    adjacentRooms: ['flight-deck', 'habitation'],
    isStormShelter: false,
    isOuterHull: true,
    locationLabel: 'Port Sunward Outer Hull',
    coordinates: { x: 70, y: 170 },
    quadrant: 'sunward',
  },
  {
    id: 'habitation',
    name: 'Habitation Module',
    shieldingFactor: 16, // g/cm²
    adjacentRooms: ['flight-deck', 'airlock', 'storm-shelter', 'galley'],
    isStormShelter: false,
    isOuterHull: false,
    locationLabel: 'Midships Hab Core',
    coordinates: { x: 230, y: 190 },
    quadrant: 'core',
  },
  {
    id: 'storm-shelter',
    name: 'Central Storm Shelter',
    shieldingFactor: 48, // g/cm² - heavily shielded by water tanks & food packs
    adjacentRooms: ['habitation', 'galley'],
    isStormShelter: true,
    isOuterHull: false,
    locationLabel: 'Protected Vehicle Center',
    coordinates: { x: 390, y: 190 },
    quadrant: 'core',
  },
  {
    id: 'galley',
    name: 'Galley & Wardroom',
    shieldingFactor: 14, // g/cm²
    adjacentRooms: ['habitation', 'storm-shelter', 'equipment-bay'],
    isStormShelter: false,
    isOuterHull: false,
    locationLabel: 'Midships Starboard',
    coordinates: { x: 310, y: 310 },
    quadrant: 'leeward',
  },
  {
    id: 'equipment-bay',
    name: 'Service & Equipment Bay',
    shieldingFactor: 22, // g/cm²
    adjacentRooms: ['galley'],
    isStormShelter: false,
    isOuterHull: true,
    locationLabel: 'Aft Propulsion / Reactor Margin',
    coordinates: { x: 480, y: 310 },
    quadrant: 'aft',
  },
];

export const DEFAULT_CREW_ROSTER: CrewRadiationProfile[] = [
  {
    id: 'crew-chen',
    displayName: 'Commander Alex Chen',
    role: 'Mission Commander',
    preMissionBaselineMsv: 280,
    missionDailyDosesMsv: Array(40).fill(0.8).concat([1.2, 1.4, 28.0]), // Sol 41 solar event spike
    lastBeaconLocation: 'flight-deck',
  },
  {
    id: 'crew-lin',
    displayName: 'Dr. Maya Lin',
    role: 'Science Specialist',
    preMissionBaselineMsv: 110,
    missionDailyDosesMsv: Array(40).fill(0.7).concat([0.9, 1.1, 24.5]),
    lastBeaconLocation: 'habitation',
  },
  {
    id: 'crew-vance',
    displayName: 'Marcus Vance',
    role: 'EVA Flight Engineer',
    preMissionBaselineMsv: 425, // Close to 450 mSv 75% limit!
    missionDailyDosesMsv: Array(40).fill(0.9).concat([1.1, 1.3, 31.0]), // High EVA exposure
    lastBeaconLocation: 'airlock',
  },
  {
    id: 'crew-rostova',
    displayName: 'Dr. Elena Rostova',
    role: 'Crew Medical Officer',
    preMissionBaselineMsv: 155, // Reached Tier 1 (150 mSv)
    missionDailyDosesMsv: Array(40).fill(0.6).concat([0.8, 1.0, 18.0]),
    lastBeaconLocation: 'storm-shelter',
  },
];

/**
 * Telemetry presets demonstrating the exact operational scenarios from radiation.md
 */
export const TELEMETRY_PRESETS: Record<
  'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'RECOVERY',
  {
    name: string;
    telemetry: Record<string, CARNSensorTelemetry>;
    recoveryState?: PostEventRecoveryState;
    description: string;
  }
> = {
  GREEN: {
    name: 'Safe Baseline (Green)',
    description: 'All CARN sensors <= 0.15 mSv/h (<= 3.5 mSv/day). Standard transit operations.',
    telemetry: {
      'flight-deck': {
        roomId: 'flight-deck',
        doseRateMsvH: 0.11,
        projectedDailyMsv: 2.64,
        particleFlux: 145,
        timestamp: new Date().toISOString(),
      },
      airlock: {
        roomId: 'airlock',
        doseRateMsvH: 0.13,
        projectedDailyMsv: 3.12,
        particleFlux: 172,
        timestamp: new Date().toISOString(),
      },
      habitation: {
        roomId: 'habitation',
        doseRateMsvH: 0.08,
        projectedDailyMsv: 1.92,
        particleFlux: 104,
        timestamp: new Date().toISOString(),
      },
      'storm-shelter': {
        roomId: 'storm-shelter',
        doseRateMsvH: 0.03,
        projectedDailyMsv: 0.72,
        particleFlux: 38,
        timestamp: new Date().toISOString(),
      },
      galley: {
        roomId: 'galley',
        doseRateMsvH: 0.09,
        projectedDailyMsv: 2.16,
        particleFlux: 118,
        timestamp: new Date().toISOString(),
      },
      'equipment-bay': {
        roomId: 'equipment-bay',
        doseRateMsvH: 0.07,
        projectedDailyMsv: 1.68,
        particleFlux: 92,
        timestamp: new Date().toISOString(),
      },
    },
  },
  YELLOW: {
    name: 'Elevated Exposure (Yellow)',
    description: 'Sunward CARN sensors read 0.15 - 2.1 mSv/h (3.5 - 50 mSv/day). Localized room closure & antioxidant dietary protocol.',
    telemetry: {
      'flight-deck': {
        roomId: 'flight-deck',
        doseRateMsvH: 0.95,
        projectedDailyMsv: 22.8,
        particleFlux: 1120,
        timestamp: new Date().toISOString(),
      },
      airlock: {
        roomId: 'airlock',
        doseRateMsvH: 1.65,
        projectedDailyMsv: 39.6,
        particleFlux: 1890,
        timestamp: new Date().toISOString(),
      },
      habitation: {
        roomId: 'habitation',
        doseRateMsvH: 0.28,
        projectedDailyMsv: 6.72,
        particleFlux: 340,
        timestamp: new Date().toISOString(),
      },
      'storm-shelter': {
        roomId: 'storm-shelter',
        doseRateMsvH: 0.05,
        projectedDailyMsv: 1.2,
        particleFlux: 62,
        timestamp: new Date().toISOString(),
      },
      galley: {
        roomId: 'galley',
        doseRateMsvH: 0.22,
        projectedDailyMsv: 5.28,
        particleFlux: 275,
        timestamp: new Date().toISOString(),
      },
      'equipment-bay': {
        roomId: 'equipment-bay',
        doseRateMsvH: 0.14,
        projectedDailyMsv: 3.36,
        particleFlux: 178,
        timestamp: new Date().toISOString(),
      },
    },
  },
  ORANGE: {
    name: 'Active Solar Particle Event (SPE - Orange)',
    description: 'CARN sensors register > 2.1 mSv/h (> 50 mSv/day). Immediate EVA recall & automated crew routing away from spikes.',
    telemetry: {
      'flight-deck': {
        roomId: 'flight-deck',
        doseRateMsvH: 2.75,
        projectedDailyMsv: 66.0,
        particleFlux: 3600,
        timestamp: new Date().toISOString(),
        sustainedAboveAcuteBreachMinutes: 20,
      },
      airlock: {
        roomId: 'airlock',
        doseRateMsvH: 3.85,
        projectedDailyMsv: 92.4,
        particleFlux: 4950,
        timestamp: new Date().toISOString(),
        sustainedAboveAcuteBreachMinutes: 25,
      },
      habitation: {
        roomId: 'habitation',
        doseRateMsvH: 0.85,
        projectedDailyMsv: 20.4,
        particleFlux: 1100,
        timestamp: new Date().toISOString(),
      },
      'storm-shelter': {
        roomId: 'storm-shelter',
        doseRateMsvH: 0.08,
        projectedDailyMsv: 1.92,
        particleFlux: 95,
        timestamp: new Date().toISOString(),
      },
      galley: {
        roomId: 'galley',
        doseRateMsvH: 0.65,
        projectedDailyMsv: 15.6,
        particleFlux: 820,
        timestamp: new Date().toISOString(),
      },
      'equipment-bay': {
        roomId: 'equipment-bay',
        doseRateMsvH: 0.35,
        projectedDailyMsv: 8.4,
        particleFlux: 440,
        timestamp: new Date().toISOString(),
      },
    },
  },
  RED: {
    name: 'Severe Solar Storm (Red)',
    description: 'Multiple CARN sensors > 4.17 mSv/h (> 100 mSv/day). Full compartment lockdown & 5-minute Storm Shelter evacuation check.',
    telemetry: {
      'flight-deck': {
        roomId: 'flight-deck',
        doseRateMsvH: 6.2,
        projectedDailyMsv: 148.8,
        particleFlux: 8100,
        timestamp: new Date().toISOString(),
        sustainedAboveAcuteBreachMinutes: 45,
      },
      airlock: {
        roomId: 'airlock',
        doseRateMsvH: 8.9,
        projectedDailyMsv: 213.6,
        particleFlux: 11500,
        timestamp: new Date().toISOString(),
        sustainedAboveAcuteBreachMinutes: 45,
      },
      habitation: {
        roomId: 'habitation',
        doseRateMsvH: 4.4,
        projectedDailyMsv: 105.6,
        particleFlux: 5700,
        timestamp: new Date().toISOString(),
        sustainedAboveAcuteBreachMinutes: 30,
      },
      'storm-shelter': {
        roomId: 'storm-shelter',
        doseRateMsvH: 0.12,
        projectedDailyMsv: 2.88,
        particleFlux: 155,
        timestamp: new Date().toISOString(),
      },
      galley: {
        roomId: 'galley',
        doseRateMsvH: 3.1,
        projectedDailyMsv: 74.4,
        particleFlux: 4050,
        timestamp: new Date().toISOString(),
      },
      'equipment-bay': {
        roomId: 'equipment-bay',
        doseRateMsvH: 1.85,
        projectedDailyMsv: 44.4,
        particleFlux: 2400,
        timestamp: new Date().toISOString(),
      },
    },
  },
  RECOVERY: {
    name: 'Post-Event Recovery Mode (Hysteresis Active)',
    description: 'CARN rates back to safe levels (<= 0.15 mSv/h), but 6-hour stabilization window and lymphocyte assay verification underway.',
    telemetry: {
      'flight-deck': {
        roomId: 'flight-deck',
        doseRateMsvH: 0.12,
        projectedDailyMsv: 2.88,
        particleFlux: 155,
        timestamp: new Date().toISOString(),
      },
      airlock: {
        roomId: 'airlock',
        doseRateMsvH: 0.14,
        projectedDailyMsv: 3.36,
        particleFlux: 180,
        timestamp: new Date().toISOString(),
      },
      habitation: {
        roomId: 'habitation',
        doseRateMsvH: 0.08,
        projectedDailyMsv: 1.92,
        particleFlux: 105,
        timestamp: new Date().toISOString(),
      },
      'storm-shelter': {
        roomId: 'storm-shelter',
        doseRateMsvH: 0.03,
        projectedDailyMsv: 0.72,
        particleFlux: 40,
        timestamp: new Date().toISOString(),
      },
      galley: {
        roomId: 'galley',
        doseRateMsvH: 0.09,
        projectedDailyMsv: 2.16,
        particleFlux: 120,
        timestamp: new Date().toISOString(),
      },
      'equipment-bay': {
        roomId: 'equipment-bay',
        doseRateMsvH: 0.07,
        projectedDailyMsv: 1.68,
        particleFlux: 90,
        timestamp: new Date().toISOString(),
      },
    },
    recoveryState: {
      isActive: true,
      hoursBelowThreshold: 3.5, // 3.5 hours into 6 hour requirement
      isHysteresisComplete: false,
      lastReadingTimeUtc: new Date().toISOString(),
      assays: {
        hour24: { completed: true, completedAtUtc: '2026-11-13T12:00:00Z', lymphocyteRecoveryPct: 88 },
        hour48: { completed: false },
      },
    },
  },
};

/**
 * Generates synthetic rolling timeline points for CARN sensor visualization
 * at 1-minute, 1-hour, or 24-hour resolution.
 */
export function generateCARNTimeline(
  baseRateMsvH: number,
  resolution: '1min' | '1hr' | '24hr',
  spikeMagnitude = 1,
): { timeLabel: string; doseRateMsvH: number; particleFlux: number }[] {
  const points: { timeLabel: string; doseRateMsvH: number; particleFlux: number }[] = [];
  const count = resolution === '1min' ? 60 : resolution === '1hr' ? 24 : 30;

  for (let i = 0; i < count; i++) {
    // Generate slight noise + optional flare spike in middle
    const isSpike = i >= Math.floor(count * 0.4) && i <= Math.floor(count * 0.65);
    const multiplier = isSpike ? spikeMagnitude : 1;
    const jitter = (Math.sin(i * 0.5) * 0.08) + 1;
    const rate = Number(Math.max(0.01, baseRateMsvH * multiplier * jitter).toFixed(3));
    const flux = Math.round(rate * 1300);

    let timeLabel = '';
    if (resolution === '1min') {
      timeLabel = `T-${60 - i}m`;
    } else if (resolution === '1hr') {
      timeLabel = `-${24 - i}h`;
    } else {
      timeLabel = `Sol ${i + 14}`;
    }

    points.push({ timeLabel, doseRateMsvH: rate, particleFlux: flux });
  }

  return points;
}
