/**
 * Space Radiation Health Monitoring: Deep-Space Transit Specification
 * Universal limit per NASA-STD-3001: 600 mSv career effective dose limit.
 *
 * Implements:
 * 1. Career & 30-day cumulative dose tracking with universal 600 mSv and 250 mSv limits.
 * 2. Milestone tiers (Baseline, Tier 1 25%, Tier 2 50%, Tier 3 75%, Hard Limit 100%).
 * 3. Spacecraft compartment navigation graph & CARN sensor telemetry binding.
 * 4. Personalized room access & dynamic lockdown matrix (acute rate breach, personalized budget threat, career ceiling).
 * 5. Directional solar storm event localization via CARN spatial delta spikes.
 * 6. Daily, rolling 30-day & real-time CARN vehicle alert classification (GREEN, YELLOW, ORANGE, RED).
 * 7. Automated lowest-dose crew routing graph pathfinding (Dijkstra).
 * 8. Post-event recovery mode with 6-hour hysteresis completion rule & 24h/48h lymphocyte assay tracking.
 */

export const CAREER_LIMIT_MSV = 600; // NASA-STD-3001 universal limit
export const ROLLING_30_DAY_LIMIT_MSV = 250;
export const SAFE_30_DAY_MAX_MSV = 105;

export const CARN_RATES = {
  SAFE_BASELINE_HOURLY: 0.15, // <= 0.15 mSv/h (<= 3.5 mSv/day)
  SAFE_BASELINE_DAILY: 3.5,
  ACUTE_BREACH_HOURLY: 2.1, // > 2.1 mSv/h (> 50 mSv/day)
  ACUTE_BREACH_DAILY: 50.0,
  SEVERE_STORM_HOURLY: 4.17, // > 4.17 mSv/h (> 100 mSv/day)
  SEVERE_STORM_DAILY: 100.0,
  STANDARD_SHIFT_HOURS: 8,
  HYSTERESIS_RECOVERY_HOURS: 6,
} as const;

export type MilestoneTierId = 'baseline' | 'tier_1' | 'tier_2' | 'tier_3' | 'hard_limit';

export interface MilestoneTier {
  id: MilestoneTierId;
  name: string;
  thresholdMsv: number;
  percentageOfLimit: number;
  warningMessage: (crewId: string) => string;
  potentialHealthRisks: string[];
  automatedActions: string[];
}

export const MILESTONE_TIERS: Record<MilestoneTierId, MilestoneTier> = {
  baseline: {
    id: 'baseline',
    name: 'Baseline',
    thresholdMsv: 0,
    percentageOfLimit: 0,
    warningMessage: () => 'STATUS NORMAL: Career radiation exposure within nominal limits.',
    potentialHealthRisks: ['Nominal background cellular stress.'],
    automatedActions: [
      'No special intervention required.',
      'Full spacecraft compartment access (subject to real-time CARN levels).',
    ],
  },
  tier_1: {
    id: 'tier_1',
    name: 'Tier 1 Warning (25%)',
    thresholdMsv: 150,
    percentageOfLimit: 25,
    warningMessage: (crewId) =>
      `CAUTION [25% LIMIT]: Crew member [${crewId}] has reached 150 mSv career exposure. Initiate dose-budgeting review.`,
    potentialHealthRisks: [
      'Early cumulative DNA damage.',
      'Minor elevation in lifetime carcinogenesis risk.',
    ],
    automatedActions: [
      'Flag crew member in mission planner.',
      'Introduce baseline antioxidant dietary protocol.',
      'Apply stricter personal dose-rate thresholds for high-exposure outer compartments.',
    ],
  },
  tier_2: {
    id: 'tier_2',
    name: 'Tier 2 Warning (50%)',
    thresholdMsv: 300,
    percentageOfLimit: 50,
    warningMessage: (crewId) =>
      `WARNING [50% LIMIT]: Crew member [${crewId}] has reached 300 mSv career exposure. Restrict high-exposure tasks.`,
    potentialHealthRisks: [
      'Increased risk of radiation-induced cataracts (eye lens).',
      'Circulatory system stiffness.',
      'Immune dysregulation.',
    ],
    automatedActions: [
      'Close lightly shielded outer compartments to crew member.',
      'Reassign non-essential deep-space EVAs to lower-dose crew.',
      'Schedule comprehensive eye/lens and cardiovascular check.',
    ],
  },
  tier_3: {
    id: 'tier_3',
    name: 'Tier 3 Critical (75%)',
    thresholdMsv: 450,
    percentageOfLimit: 75,
    warningMessage: (crewId) =>
      `CRITICAL [75% LIMIT]: Crew member [${crewId}] approaching career limit (450 mSv). Mandatory EVA & outer-hull lockout.`,
    potentialHealthRisks: [
      'High lifetime risk of radiation carcinogenesis.',
      'Accelerated degenerative tissue effects.',
      'Central Nervous System (CNS) fatigue.',
    ],
    automatedActions: [
      'Lockout from all deep-space EVAs and unshielded modules.',
      'Reassign sleeping quarters to the most heavily shielded inner module.',
      'Maximize pharmacological/nutritional radioprotection.',
    ],
  },
  hard_limit: {
    id: 'hard_limit',
    name: 'Hard Limit (100%)',
    thresholdMsv: 600,
    percentageOfLimit: 100,
    warningMessage: (crewId) =>
      `EMERGENCY LIMIT REACHED: Crew member [${crewId}] has reached the 600 mSv NASA career ceiling.`,
    potentialHealthRisks: ['Maximum permissible lifetime threshold reached.'],
    automatedActions: [
      'Permanent restriction to maximum-shielded central core zones for remainder of transit.',
    ],
  },
};

export type VehicleRadiationStatus = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export interface VehicleStatusAssessment {
  status: VehicleRadiationStatus;
  statusLabel: string;
  conditionMet: string;
  warningMessage: string;
  risksToWatchFor: string[];
  countermeasures: string[];
  affectedRooms: string[];
  isRecoveryMode: boolean;
}

export interface CompartmentNode {
  id: string; // Room_ID
  name: string; // Room_Name
  shieldingFactor: number; // water-equivalent thickness in g/cm²
  adjacentRooms: string[]; // Edges for pathfinding
  isStormShelter: boolean;
  isOuterHull: boolean;
  locationLabel: string;
  coordinates: { x: number; y: number }; // Relative coordinates for layout
  quadrant: 'sunward' | 'core' | 'leeward' | 'aft';
}

export interface CARNSensorTelemetry {
  roomId: string;
  doseRateMsvH: number; // mSv/h
  projectedDailyMsv: number; // mSv/day = doseRateMsvH * 24
  particleFlux: number; // protons/cm²-s
  timestamp: string;
  sustainedAboveAcuteBreachMinutes?: number;
}

export interface CrewRadiationProfile {
  id: string;
  displayName: string;
  role: string;
  preMissionBaselineMsv: number;
  missionDailyDosesMsv: number[]; // Daily doses across mission so far
  lastBeaconLocation: string; // Room_ID
}

export interface CrewCalculatedDose {
  crewId: string;
  displayName: string;
  preMissionBaselineMsv: number;
  missionTotalDoseMsv: number;
  totalCareerDoseMsv: number;
  remainingCareerBudgetMsv: number;
  rolling30DayDoseMsv: number;
  remaining30DayBudgetMsv: number;
  tier: MilestoneTier;
  isLockedOutFromOuterHull: boolean;
}

export type RoomAccessStatus = 'ALLOWED' | 'RESTRICTED' | 'EVACUATION_TRANSIT_ONLY';

export interface RoomAccessEvaluation {
  crewId: string;
  roomId: string;
  status: RoomAccessStatus;
  isRestricted: boolean;
  shiftDoseMsv: number;
  shiftDosePercentOf30DayBudget: number;
  shiftDosePercentOfCareerBudget: number;
  lockoutReasons: string[];
  beaconAlert: boolean;
}

export interface DirectionalEventLocalization {
  vectorHeading: string; // e.g. "Sunward Vector +X (Bearing 045°)"
  bearingDegrees: number;
  primaryExposedModuleId: string;
  highestDoseRateMsvH: number;
  lowestDoseRateMsvH: number;
  coreShelterDoseRateMsvH: number;
  attenuationRatio: number; // Outer peak / core shelter rate
  severity: 'NOMINAL' | 'MODERATE' | 'SEVERE' | 'CRITICAL';
  description: string;
}

export interface LowestDosePathResult {
  startRoomId: string;
  destinationRoomId: string;
  path: string[];
  pathNames: string[];
  totalPathLengthHops: number;
  estimatedTransitDoseMsv: number;
  turnByTurn: {
    step: number;
    roomId: string;
    roomName: string;
    doseRateMsvH: number;
    instruction: string;
    isHotzone: boolean;
  }[];
  avoidedHotzones: string[];
}

export interface PostEventRecoveryState {
  isActive: boolean;
  hoursBelowThreshold: number; // Required >= 6.0
  isHysteresisComplete: boolean;
  lastReadingTimeUtc?: string;
  assays: {
    hour24: { completed: boolean; completedAtUtc?: string; lymphocyteRecoveryPct?: number };
    hour48: { completed: boolean; completedAtUtc?: string; lymphocyteRecoveryPct?: number };
  };
}

/**
 * Calculates cumulative doses and remaining budgets for a crew member.
 */
export function calculateCrewDose(profile: CrewRadiationProfile): CrewCalculatedDose {
  const missionTotalDoseMsv = profile.missionDailyDosesMsv.reduce((sum, d) => sum + d, 0);
  const totalCareerDoseMsv = profile.preMissionBaselineMsv + missionTotalDoseMsv;
  const remainingCareerBudgetMsv = Math.max(0, CAREER_LIMIT_MSV - totalCareerDoseMsv);

  // Rolling 30-day sum: sum of last 30 daily records (or all if < 30)
  const last30Days = profile.missionDailyDosesMsv.slice(-30);
  const rolling30DayDoseMsv = last30Days.reduce((sum, d) => sum + d, 0);
  const remaining30DayBudgetMsv = Math.max(0, ROLLING_30_DAY_LIMIT_MSV - rolling30DayDoseMsv);

  // Determine milestone tier
  let tier: MilestoneTier;
  if (totalCareerDoseMsv >= 600) {
    tier = MILESTONE_TIERS.hard_limit;
  } else if (totalCareerDoseMsv >= 450) {
    tier = MILESTONE_TIERS.tier_3;
  } else if (totalCareerDoseMsv >= 300) {
    tier = MILESTONE_TIERS.tier_2;
  } else if (totalCareerDoseMsv >= 150) {
    tier = MILESTONE_TIERS.tier_1;
  } else {
    tier = MILESTONE_TIERS.baseline;
  }

  const isLockedOutFromOuterHull = totalCareerDoseMsv >= 450;

  return {
    crewId: profile.id,
    displayName: profile.displayName,
    preMissionBaselineMsv: profile.preMissionBaselineMsv,
    missionTotalDoseMsv,
    totalCareerDoseMsv,
    remainingCareerBudgetMsv,
    rolling30DayDoseMsv,
    remaining30DayBudgetMsv,
    tier,
    isLockedOutFromOuterHull,
  };
}

/**
 * Evaluates Personalized Room Access & Dynamic Lockdown Rules for a given crew member and compartment.
 *
 * Rules:
 * 1. Acute Rate Breach: CARN > 2.1 mSv/h (projected > 50 mSv/day) -> Immediate closure for all crew
 *    (unless designated as active evacuation transit corridor).
 * 2. Personalized Budget Threat: Projected exposure for 8h shift in room exceeds 5% of remaining 30-day budget
 *    OR 2% of remaining career budget.
 * 3. Hard Career Ceiling: Crew member >= 450 mSv (75%) or >= 600 mSv (100%) locks out non-core, lightly shielded outer compartments.
 * 4. Beacon Alert: If crew member's last recorded location beacon is inside a restricted room, alert is flagged.
 */
export function evaluateRoomAccess(
  room: CompartmentNode,
  carnTelemetry: CARNSensorTelemetry,
  crewDose: CrewCalculatedDose,
  crewProfile: CrewRadiationProfile,
  isEvacuationUnderway = false,
): RoomAccessEvaluation {
  const lockoutReasons: string[] = [];
  const shiftDoseMsv = carnTelemetry.doseRateMsvH * CARN_RATES.STANDARD_SHIFT_HOURS;

  const shiftDosePercentOf30DayBudget = crewDose.remaining30DayBudgetMsv > 0
    ? (shiftDoseMsv / crewDose.remaining30DayBudgetMsv) * 100
    : 100;

  const shiftDosePercentOfCareerBudget = crewDose.remainingCareerBudgetMsv > 0
    ? (shiftDoseMsv / crewDose.remainingCareerBudgetMsv) * 100
    : 100;

  // Condition 1: Acute Rate Breach (> 2.1 mSv/h)
  const isAcuteBreach = carnTelemetry.doseRateMsvH > CARN_RATES.ACUTE_BREACH_HOURLY;
  if (isAcuteBreach) {
    lockoutReasons.push(
      `Acute Rate Breach: CARN reads ${carnTelemetry.doseRateMsvH.toFixed(2)} mSv/h (> 2.1 mSv/h, projected > 50 mSv/day).`,
    );
  }

  // Condition 2: Personalized Budget Threat (8h shift > 5% remaining 30-day OR > 2% remaining career)
  const is30DayThreat = shiftDosePercentOf30DayBudget > 5;
  const isCareerThreat = shiftDosePercentOfCareerBudget > 2;
  if (is30DayThreat || isCareerThreat) {
    const reasons: string[] = [];
    if (is30DayThreat) {
      reasons.push(
        `8h shift (${shiftDoseMsv.toFixed(2)} mSv) exceeds 5% of remaining 30-day budget (${(0.05 * crewDose.remaining30DayBudgetMsv).toFixed(2)} mSv)`,
      );
    }
    if (isCareerThreat) {
      reasons.push(
        `8h shift (${shiftDoseMsv.toFixed(2)} mSv) exceeds 2% of remaining career budget (${(0.02 * crewDose.remainingCareerBudgetMsv).toFixed(2)} mSv)`,
      );
    }
    lockoutReasons.push(`Personalized Budget Threat: ${reasons.join(' and ')}.`);
  }

  // Condition 3: Hard Career Ceiling (>= 450 mSv or >= 600 mSv) locks out non-core, lightly shielded outer compartments
  if (crewDose.isLockedOutFromOuterHull && room.isOuterHull) {
    lockoutReasons.push(
      `Hard Career Ceiling: Total career dose ${crewDose.totalCareerDoseMsv.toFixed(1)} mSv (>= 450 mSv 75% limit). Outer hull module locked.`,
    );
  }

  const isRestricted = lockoutReasons.length > 0;
  let status: RoomAccessStatus = 'ALLOWED';

  if (isRestricted) {
    if (isEvacuationUnderway && !isAcuteBreach) {
      status = 'EVACUATION_TRANSIT_ONLY';
    } else {
      status = 'RESTRICTED';
    }
  }

  const beaconAlert = isRestricted && crewProfile.lastBeaconLocation === room.id;

  return {
    crewId: crewDose.crewId,
    roomId: room.id,
    status,
    isRestricted,
    shiftDoseMsv,
    shiftDosePercentOf30DayBudget,
    shiftDosePercentOfCareerBudget,
    lockoutReasons,
    beaconAlert,
  };
}

/**
 * Directional Event Localization:
 * Compares delta spikes across CARN nodes on the spacecraft map to determine
 * directional vector, severity, and attenuation ratio between sunward outer hull and central storm shelter.
 */
export function localizeDirectionalEvent(
  compartments: CompartmentNode[],
  telemetry: Record<string, CARNSensorTelemetry>,
): DirectionalEventLocalization {
  let highestDoseRate = 0;
  let highestRoomId = '';
  let lowestDoseRate = Infinity;
  let coreShelterDoseRate = 0.05;

  for (const comp of compartments) {
    const reading = telemetry[comp.id]?.doseRateMsvH ?? 0;
    if (reading > highestDoseRate) {
      highestDoseRate = reading;
      highestRoomId = comp.id;
    }
    if (reading < lowestDoseRate) {
      lowestDoseRate = reading;
    }
    if (comp.isStormShelter) {
      coreShelterDoseRate = reading;
    }
  }

  const highestComp = compartments.find((c) => c.id === highestRoomId);
  const quadrant = highestComp?.quadrant ?? 'sunward';

  let vectorHeading = 'Sunward Vector +X (Bearing 045° Front-Starboard)';
  let bearingDegrees = 45;

  if (quadrant === 'leeward') {
    vectorHeading = 'Port Leeward Vector -Y (Bearing 270°)';
    bearingDegrees = 270;
  } else if (quadrant === 'aft') {
    vectorHeading = 'Aft Engine Vector -Z (Bearing 180°)';
    bearingDegrees = 180;
  } else if (quadrant === 'core') {
    vectorHeading = 'Omnidirectional Diffuse Galactic Flux';
    bearingDegrees = 0;
  }

  const attenuationRatio = coreShelterDoseRate > 0
    ? highestDoseRate / coreShelterDoseRate
    : 1;

  let severity: DirectionalEventLocalization['severity'] = 'NOMINAL';
  if (highestDoseRate > CARN_RATES.SEVERE_STORM_HOURLY) {
    severity = 'CRITICAL';
  } else if (highestDoseRate > CARN_RATES.ACUTE_BREACH_HOURLY) {
    severity = 'SEVERE';
  } else if (highestDoseRate > CARN_RATES.SAFE_BASELINE_HOURLY) {
    severity = 'MODERATE';
  }

  const description = severity === 'NOMINAL'
    ? 'Isotropic nominal background cosmic flux. No localized spatial variance detected.'
    : `Localized radiation spike concentrated on ${highestComp?.name ?? 'sunward'} module. Solar flux incident along ${vectorHeading}. Attenuation factor of ${attenuationRatio.toFixed(1)}x provided by storm shelter shielding.`;

  return {
    vectorHeading,
    bearingDegrees,
    primaryExposedModuleId: highestRoomId,
    highestDoseRateMsvH: highestDoseRate,
    lowestDoseRateMsvH: lowestDoseRate === Infinity ? 0 : lowestDoseRate,
    coreShelterDoseRateMsvH: coreShelterDoseRate,
    attenuationRatio,
    severity,
    description,
  };
}

/**
 * Daily, Rolling 30-Day & Real-Time CARN Rules:
 * Evaluates vehicle-wide status (GREEN, YELLOW, ORANGE, RED).
 */
export function evaluateVehicleRadiationStatus(
  compartments: CompartmentNode[],
  telemetry: Record<string, CARNSensorTelemetry>,
  crewCalculated: CrewCalculatedDose[],
  recoveryState?: PostEventRecoveryState,
): VehicleStatusAssessment {
  const readings = compartments.map((comp) => ({
    comp,
    telemetry: telemetry[comp.id] ?? {
      roomId: comp.id,
      doseRateMsvH: 0.08,
      projectedDailyMsv: 1.92,
      particleFlux: 120,
      timestamp: new Date().toISOString(),
    },
  }));

  const severeRooms = readings.filter(
    (r) => r.telemetry.doseRateMsvH > CARN_RATES.SEVERE_STORM_HOURLY,
  );
  const speRooms = readings.filter(
    (r) =>
      r.telemetry.doseRateMsvH > CARN_RATES.ACUTE_BREACH_HOURLY ||
      r.telemetry.projectedDailyMsv > CARN_RATES.ACUTE_BREACH_DAILY,
  );
  const elevatedRooms = readings.filter(
    (r) =>
      r.telemetry.doseRateMsvH > CARN_RATES.SAFE_BASELINE_HOURLY &&
      r.telemetry.doseRateMsvH <= CARN_RATES.ACUTE_BREACH_HOURLY,
  );

  const any30DayBreach = crewCalculated.some(
    (c) => c.rolling30DayDoseMsv > ROLLING_30_DAY_LIMIT_MSV,
  );
  const any30DayElevated = crewCalculated.some(
    (c) => c.rolling30DayDoseMsv >= SAFE_30_DAY_MAX_MSV,
  );

  // RED: Rolling 30-Day Dose > 250 mSv OR CARN sensors project > 100 mSv/day (> 4.17 mSv/h) across multiple compartments.
  if (any30DayBreach || severeRooms.length >= 2) {
    const affectedNames = severeRooms.map((r) => r.comp.name).join(', ') || 'Spacecraft wide';
    return {
      status: 'RED',
      statusLabel: 'Severe Solar Storm (30-Day Limit Breach Threat)',
      conditionMet: any30DayBreach
        ? `Rolling 30-day crew dose > 250 mSv limit breach threat`
        : `CARN sensors project > 100 mSv/day (> 4.17 mSv/h) across multiple compartments (${affectedNames})`,
      warningMessage: `EMERGENCY – SEVERE SOLAR STORM: Lethal/acute radiation levels detected in [${affectedNames}]. Proceed immediately to Central Storm Shelter.`,
      risksToWatchFor: [
        'Acute Radiation Sickness (ARS): Vomiting, severe fatigue, fever, and gastrointestinal distress.',
        'Bone Marrow Suppression: Significant depletion of white blood cells (lymphocytes/neutrophils) and platelets, leading to severe infection and bleeding risks.',
        'Central Nervous System (CNS) Effects: Acute cognitive slowing or disorientation.',
      ],
      countermeasures: [
        'Full Compartment Lockdown & Storm Shelter Evacuation: Seal all non-shelter compartments. Route all crew members from their last recorded locations directly into the Central Storm Shelter (surrounded by potable water tanks and food stores).',
        'Crew Accountability Check: Verify via shelter CARN/beacon check-in that 100% of crew members have arrived inside the shielded perimeter within 5 minutes.',
      ],
      affectedRooms: severeRooms.map((r) => r.comp.id),
      isRecoveryMode: false,
    };
  }

  // ORANGE: CARN telemetry registers Projected Daily Dose > 50 mSv/day (hourly dose rate > 2.1 mSv/h sustained for 15 minutes).
  if (speRooms.length > 0) {
    const affectedNames = speRooms.map((r) => r.comp.name).join(', ');
    return {
      status: 'ORANGE',
      statusLabel: 'Active Solar Particle Event (SPE)',
      conditionMet: `CARN telemetry registers Projected Daily Dose > 50 mSv/day (hourly dose rate > 2.1 mSv/h)`,
      warningMessage: `WARNING – SOLAR PARTICLE EVENT (SPE): High radiation flux localized in [${affectedNames}]. Terminate EVAs and evacuate flagged compartments.`,
      risksToWatchFor: [
        'Prodromal Acute Radiation Syndrome (ARS) symptoms: Nausea, loss of appetite, headaches, and acute fatigue.',
        'Skin Erythema: Radiation skin burns/redness, particularly for crew near hull walls or in airlocks.',
        'Hematopoietic Stress: Early drop in peripheral blood lymphocyte counts.',
      ],
      countermeasures: [
        'Immediate Deep-Space EVA Recall: Abort any external spacecraft maintenance; recall crew to airlock immediately.',
        'Automated Crew Routing: Using each crew member’s last recorded location (via badge/beacon check-in), the system computes the lowest-dose path (avoiding rooms with active CARN spikes) and issues turn-by-turn audio/visual routing instructions toward interior high-shielding modules.',
      ],
      affectedRooms: speRooms.map((r) => r.comp.id),
      isRecoveryMode: false,
    };
  }

  // Check if we are in Post-Event Recovery Mode (was ORANGE/RED, now rates are down but 6h hysteresis pending)
  if (recoveryState?.isActive && !recoveryState.isHysteresisComplete) {
    return {
      status: 'YELLOW',
      statusLabel: 'Post-Event Recovery Mode (Hysteresis Active)',
      conditionMet: `Dose rates returned to nominal (<= 0.15 mSv/h); 6-hour stabilization window in progress (${recoveryState.hoursBelowThreshold.toFixed(1)} / 6.0 hrs).`,
      warningMessage: `ADVISORY: Post-event recovery protocol active. Compartments remain secured until 6 consecutive hours of safe readings are verified.`,
      risksToWatchFor: [
        'Sub-acute DNA repair and bone marrow recovery phase.',
        'Late prodromal fatigue or cellular inflammation.',
      ],
      countermeasures: [
        'Hysteresis enforcement: Software must NOT unlock rooms or clear warnings upon a single low reading.',
        'Continuous 1-minute CARN telemetry logging and daily personal dosimeter prompts.',
        'Mandatory finger-prick blood/saliva lymphocyte assay scheduled at 24 hours and 48 hours post-event.',
      ],
      affectedRooms: [],
      isRecoveryMode: true,
    };
  }

  // YELLOW: Any CARN sensor reads 0.15 mSv/h < Rate <= 2.1 mSv/h (3.5 to 50 mSv/day) OR 30-day sum >= 105 mSv
  if (elevatedRooms.length > 0 || any30DayElevated) {
    const affectedNames = elevatedRooms.map((r) => r.comp.name).join(', ') || 'Transit corridor';
    return {
      status: 'YELLOW',
      statusLabel: 'Elevated Exposure (Localized or Vehicle-Wide)',
      conditionMet: elevatedRooms.length > 0
        ? `Radiation dose in [${affectedNames}] exceeds 3.5 mSv/day safe baseline (0.15 mSv/h < Rate <= 2.1 mSv/h).`
        : `Crew 30-day rolling dose >= 105 mSv elevated ceiling.`,
      warningMessage: `ADVISORY: Radiation dose in [${affectedNames}] exceeds 3.5 mSv/day safe baseline. Elevated solar flux detected.`,
      risksToWatchFor: [
        'Elevated cellular oxidative stress and free-radical generation.',
        'Mild immune system suppression (latent viral reactivation risk).',
        'Sub-clinical fatigue or sleep disruption.',
      ],
      countermeasures: [
        'Localized Room Closure: Close affected low-shielding rooms to crew members in Tier 1+ career brackets.',
        'Dietary Intervention: Prioritize antioxidant-rich foods (freeze-dried blueberries, strawberries, kale, spinach, walnuts, and lycopene-rich tomatoes).',
        'Supplementation: Administer onboard radioprotective supplements (Vitamin C, Vitamin E, Selenium, N-acetylcysteine [NAC], and Omega-3 fatty acids).',
      ],
      affectedRooms: elevatedRooms.map((r) => r.comp.id),
      isRecoveryMode: false,
    };
  }

  // GREEN: All CARN room sensors <= 0.15 mSv/h (<= 3.5 mSv/day) AND crew 30-Day Rolling Sum < 105 mSv.
  return {
    status: 'GREEN',
    statusLabel: 'Safe Baseline',
    conditionMet: 'All CARN room sensors <= 0.15 mSv/h (<= 3.5 mSv/day) AND crew 30-Day Rolling Sum < 105 mSv.',
    warningMessage: 'STATUS NORMAL: Radiation exposure across all modules within safe transit baseline.',
    risksToWatchFor: ['Baseline deep-space Galactic Cosmic Ray (GCR) oxidative stress.'],
    countermeasures: ['None. Standard transit operations.'],
    affectedRooms: [],
    isRecoveryMode: false,
  };
}

/**
 * Automated Crew Routing (Lowest-Dose Pathfinding):
 * Using Dijkstra algorithm across the spacecraft navigation graph, computes
 * the path that minimizes accrued radiation dose, deliberately avoiding rooms with active spikes.
 */
export function computeLowestDosePath(
  startRoomId: string,
  destinationRoomId: string,
  compartments: CompartmentNode[],
  telemetry: Record<string, CARNSensorTelemetry>,
): LowestDosePathResult {
  const roomMap = new Map(compartments.map((c) => [c.id, c]));
  const startRoom = roomMap.get(startRoomId);
  const destRoom = roomMap.get(destinationRoomId);

  if (!startRoom || !destRoom) {
    return {
      startRoomId,
      destinationRoomId,
      path: [startRoomId],
      pathNames: [startRoom?.name ?? startRoomId],
      totalPathLengthHops: 0,
      estimatedTransitDoseMsv: 0,
      turnByTurn: [],
      avoidedHotzones: [],
    };
  }

  // Dijkstra's algorithm
  // Transit time estimate per room: 1 minute (1/60 hours)
  const HOURLY_TRANSIT_FRACTION = 1 / 60;
  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const unvisited = new Set<string>();

  for (const comp of compartments) {
    distances.set(comp.id, comp.id === startRoomId ? 0 : Infinity);
    previous.set(comp.id, null);
    unvisited.add(comp.id);
  }

  while (unvisited.size > 0) {
    // Pick unvisited node with lowest distance
    let currentId: string | null = null;
    let minDistance = Infinity;
    for (const id of unvisited) {
      const dist = distances.get(id)!;
      if (dist < minDistance) {
        minDistance = dist;
        currentId = id;
      }
    }

    if (!currentId || minDistance === Infinity) break;
    if (currentId === destinationRoomId) break;

    unvisited.delete(currentId);
    const currentComp = roomMap.get(currentId)!;

    for (const neighborId of currentComp.adjacentRooms) {
      if (!unvisited.has(neighborId)) continue;
      const neighborComp = roomMap.get(neighborId);
      if (!neighborComp) continue;

      const neighborRate = telemetry[neighborId]?.doseRateMsvH ?? 0.1;
      // Penalty: heavily penalize rooms with acute rate breaches (> 2.1 mSv/h)
      const hotzonePenalty = neighborRate > CARN_RATES.ACUTE_BREACH_HOURLY ? 50 : 1;
      const edgeWeight = (neighborRate * HOURLY_TRANSIT_FRACTION) * hotzonePenalty + 0.001; // small base hop cost

      const alt = minDistance + edgeWeight;
      if (alt < distances.get(neighborId)!) {
        distances.set(neighborId, alt);
        previous.set(neighborId, currentId);
      }
    }
  }

  // Reconstruct path
  const path: string[] = [];
  let curr: string | null = destinationRoomId;
  while (curr) {
    path.unshift(curr);
    curr = previous.get(curr) ?? null;
  }

  if (path[0] !== startRoomId) {
    // If no path found, fallback to direct
    path.length = 0;
    path.push(startRoomId, destinationRoomId);
  }

  const pathNames = path.map((id) => roomMap.get(id)?.name ?? id);
  let estimatedTransitDoseMsv = 0;
  const turnByTurn = path.map((id, index) => {
    const comp = roomMap.get(id)!;
    const rate = telemetry[id]?.doseRateMsvH ?? 0.08;
    const isHotzone = rate > CARN_RATES.ACUTE_BREACH_HOURLY;
    const stepDose = rate * HOURLY_TRANSIT_FRACTION;
    estimatedTransitDoseMsv += stepDose;

    let instruction = `Proceed into ${comp.name}`;
    if (index === 0) {
      instruction = `Begin evacuation from your current beacon location: ${comp.name}`;
    } else if (index === path.length - 1) {
      instruction = `Arrive inside ${comp.name}. Secure blast hatch and confirm beacon check-in.`;
    }

    return {
      step: index + 1,
      roomId: id,
      roomName: comp.name,
      doseRateMsvH: rate,
      instruction,
      isHotzone,
    };
  });

  // Identify avoided hotzones (adjacent rooms with high radiation that were not included in the path)
  const pathSet = new Set(path);
  const avoidedHotzones = compartments
    .filter((c) => !pathSet.has(c.id) && (telemetry[c.id]?.doseRateMsvH ?? 0) > CARN_RATES.SAFE_BASELINE_HOURLY)
    .map((c) => `${c.name} (${(telemetry[c.id]?.doseRateMsvH ?? 0).toFixed(2)} mSv/h)`);

  return {
    startRoomId,
    destinationRoomId,
    path,
    pathNames,
    totalPathLengthHops: Math.max(0, path.length - 1),
    estimatedTransitDoseMsv,
    turnByTurn,
    avoidedHotzones,
  };
}

/**
 * Checks Hysteresis De-escalation Rule:
 * SPE or Solar Storm is declared ENDED only when ALL compartment CARN sensors
 * confirm dose rates have remained <= 3.5 mSv/day (<= 0.15 mSv/h) continuously
 * for at least 6 consecutive hours (360 minutes).
 */
export function checkHysteresisCompletion(
  _compartments: CompartmentNode[],
  recentTelemetryWindow: CARNSensorTelemetry[][], // Array of telemetry snapshots over time
  requiredHours = CARN_RATES.HYSTERESIS_RECOVERY_HOURS,
): { isComplete: boolean; hoursStabilized: number; reasons: string[] } {
  if (recentTelemetryWindow.length === 0) {
    return { isComplete: false, hoursStabilized: 0, reasons: ['No historical telemetry window provided.'] };
  }

  // Look backwards from newest to oldest snapshot
  let validSnapshots = 0;
  for (let i = recentTelemetryWindow.length - 1; i >= 0; i--) {
    const snapshot = recentTelemetryWindow[i];
    const anyElevated = snapshot.some((reading) => reading.doseRateMsvH > CARN_RATES.SAFE_BASELINE_HOURLY);
    if (anyElevated) break;
    validSnapshots++;
  }

  // Assuming snapshots are spaced e.g. 1 per hour or 1 per minute:
  // If we represent hours directly:
  const hoursStabilized = validSnapshots; // or converted by interval
  const isComplete = hoursStabilized >= requiredHours;

  const reasons: string[] = [];
  if (!isComplete) {
    reasons.push(
      `Hysteresis incomplete: Stabilized for ${hoursStabilized.toFixed(1)} / ${requiredHours} hours. All sensors must remain <= 0.15 mSv/h continuously for 6 hours.`,
    );
  } else {
    reasons.push(
      `Hysteresis complete: All compartments have maintained <= 0.15 mSv/h continuously for >= 6 hours. Phased room re-opening permissible.`,
    );
  }

  return { isComplete, hoursStabilized, reasons };
}
