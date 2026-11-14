import { describe, expect, it } from 'vitest';
import {
  CAREER_LIMIT_MSV,
  ROLLING_30_DAY_LIMIT_MSV,
  calculateCrewDose,
  evaluateRoomAccess,
  localizeDirectionalEvent,
  evaluateVehicleRadiationStatus,
  computeLowestDosePath,
  checkHysteresisCompletion,
  type CrewRadiationProfile,
  type CompartmentNode,
  type CARNSensorTelemetry,
} from './radiationEngine';
import { SPACECRAFT_COMPARTMENTS, TELEMETRY_PRESETS } from './radiationData';

describe('Space Radiation Health Monitoring Engine (NASA-STD-3001 Specification)', () => {
  describe('1. Career Effective Dose & Rolling 30-Day Calculations', () => {
    it('enforces 600 mSv universal career limit and 250 mSv rolling 30-day limit', () => {
      expect(CAREER_LIMIT_MSV).toBe(600);
      expect(ROLLING_30_DAY_LIMIT_MSV).toBe(250);
    });

    it('correctly computes career dose, remaining career budget, and 30-day rolling sum', () => {
      const profile: CrewRadiationProfile = {
        id: 'crew-test-1',
        displayName: 'Test Astronaut',
        role: 'Mission Specialist',
        preMissionBaselineMsv: 100,
        // 35 daily records: first 5 are 1.0 mSv, last 30 are 2.0 mSv
        missionDailyDosesMsv: Array(5).fill(1.0).concat(Array(30).fill(2.0)),
        lastBeaconLocation: 'habitation',
      };

      const calculated = calculateCrewDose(profile);
      expect(calculated.preMissionBaselineMsv).toBe(100);
      expect(calculated.missionTotalDoseMsv).toBe(65); // 5*1 + 30*2
      expect(calculated.totalCareerDoseMsv).toBe(165); // 100 + 65
      expect(calculated.remainingCareerBudgetMsv).toBe(435); // 600 - 165
      expect(calculated.rolling30DayDoseMsv).toBe(60); // 30 * 2
      expect(calculated.remaining30DayBudgetMsv).toBe(190); // 250 - 60
      expect(calculated.tier.id).toBe('tier_1'); // 165 >= 150 mSv (Tier 1 25%)
    });
  });

  describe('2. Milestone Tiers & Health Risk Rules', () => {
    it('categorizes Baseline (< 150 mSv)', () => {
      const profile: CrewRadiationProfile = {
        id: 'astronaut-01',
        displayName: 'Rookie',
        role: 'Specialist',
        preMissionBaselineMsv: 50,
        missionDailyDosesMsv: [10, 20],
        lastBeaconLocation: 'habitation',
      };
      const res = calculateCrewDose(profile);
      expect(res.tier.id).toBe('baseline');
      expect(res.tier.warningMessage('astronaut-01')).toContain('STATUS NORMAL');
      expect(res.isLockedOutFromOuterHull).toBe(false);
    });

    it('categorizes Tier 1 Warning (>= 150 mSv, 25%)', () => {
      const profile: CrewRadiationProfile = {
        id: 'astronaut-02',
        displayName: 'Mid-Career',
        role: 'Specialist',
        preMissionBaselineMsv: 140,
        missionDailyDosesMsv: [15],
        lastBeaconLocation: 'habitation',
      };
      const res = calculateCrewDose(profile);
      expect(res.tier.id).toBe('tier_1');
      expect(res.tier.warningMessage('astronaut-02')).toContain('CAUTION [25% LIMIT]');
      expect(res.tier.automatedActions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('antioxidant dietary protocol'),
        ]),
      );
      expect(res.isLockedOutFromOuterHull).toBe(false);
    });

    it('categorizes Tier 2 Warning (>= 300 mSv, 50%)', () => {
      const profile: CrewRadiationProfile = {
        id: 'astronaut-03',
        displayName: 'Senior',
        role: 'Flight Engineer',
        preMissionBaselineMsv: 290,
        missionDailyDosesMsv: [15],
        lastBeaconLocation: 'habitation',
      };
      const res = calculateCrewDose(profile);
      expect(res.tier.id).toBe('tier_2');
      expect(res.tier.warningMessage('astronaut-03')).toContain('WARNING [50% LIMIT]');
      expect(res.tier.potentialHealthRisks).toEqual(
        expect.arrayContaining([
          expect.stringContaining('radiation-induced cataracts'),
        ]),
      );
      expect(res.isLockedOutFromOuterHull).toBe(false);
    });

    it('categorizes Tier 3 Critical (>= 450 mSv, 75%) and locks out outer compartments', () => {
      const profile: CrewRadiationProfile = {
        id: 'astronaut-04',
        displayName: 'Veteran',
        role: 'Commander',
        preMissionBaselineMsv: 440,
        missionDailyDosesMsv: [15],
        lastBeaconLocation: 'habitation',
      };
      const res = calculateCrewDose(profile);
      expect(res.tier.id).toBe('tier_3');
      expect(res.tier.warningMessage('astronaut-04')).toContain('CRITICAL [75% LIMIT]');
      expect(res.isLockedOutFromOuterHull).toBe(true);
    });

    it('categorizes Hard Limit (>= 600 mSv, 100%)', () => {
      const profile: CrewRadiationProfile = {
        id: 'astronaut-05',
        displayName: 'Max Limit Exceeded',
        role: 'Commander',
        preMissionBaselineMsv: 595,
        missionDailyDosesMsv: [10],
        lastBeaconLocation: 'habitation',
      };
      const res = calculateCrewDose(profile);
      expect(res.tier.id).toBe('hard_limit');
      expect(res.tier.warningMessage('astronaut-05')).toContain('EMERGENCY LIMIT REACHED');
      expect(res.isLockedOutFromOuterHull).toBe(true);
    });
  });

  describe('3. Personalized Room Access & Dynamic Lockdown Rules', () => {
    const flightDeck: CompartmentNode = {
      id: 'flight-deck',
      name: 'Flight Deck',
      shieldingFactor: 10,
      adjacentRooms: ['habitation'],
      isStormShelter: false,
      isOuterHull: true,
      locationLabel: 'Forward Outer Hull',
      coordinates: { x: 100, y: 50 },
      quadrant: 'sunward',
    };

    const coreShelter: CompartmentNode = {
      id: 'storm-shelter',
      name: 'Central Storm Shelter',
      shieldingFactor: 48,
      adjacentRooms: ['habitation'],
      isStormShelter: true,
      isOuterHull: false,
      locationLabel: 'Protected Core',
      coordinates: { x: 200, y: 100 },
      quadrant: 'core',
    };

    it('triggers Acute Rate Breach lockout for all crew when CARN reads > 2.1 mSv/h', () => {
      const profile: CrewRadiationProfile = {
        id: 'crew-fresh',
        displayName: 'Fresh Astronaut',
        role: 'Specialist',
        preMissionBaselineMsv: 20,
        missionDailyDosesMsv: [1, 1],
        lastBeaconLocation: 'habitation',
      };
      const calculated = calculateCrewDose(profile);

      const highCarnTelemetry: CARNSensorTelemetry = {
        roomId: 'flight-deck',
        doseRateMsvH: 2.4, // > 2.1 mSv/h
        projectedDailyMsv: 57.6,
        particleFlux: 3200,
        timestamp: new Date().toISOString(),
      };

      const access = evaluateRoomAccess(flightDeck, highCarnTelemetry, calculated, profile);
      expect(access.isRestricted).toBe(true);
      expect(access.status).toBe('RESTRICTED');
      expect(access.lockoutReasons.some((r) => r.includes('Acute Rate Breach'))).toBe(true);
    });

    it('triggers Personalized Budget Threat when 8h shift > 5% of remaining 30-day budget or > 2% of remaining career budget', () => {
      // Crew member who has used up most of their 30-day budget:
      // remaining 30-day budget = 250 - 240 = 10 mSv. 5% is 0.5 mSv.
      const profile: CrewRadiationProfile = {
        id: 'crew-fatigued',
        displayName: 'Dose-Depleted Astronaut',
        role: 'Specialist',
        preMissionBaselineMsv: 100,
        missionDailyDosesMsv: Array(30).fill(8), // 240 mSv rolling 30-day
        lastBeaconLocation: 'habitation',
      };
      const calculated = calculateCrewDose(profile);
      expect(calculated.remaining30DayBudgetMsv).toBe(10);

      // Moderate CARN: 0.12 mSv/h (under acute breach 2.1 mSv/h, under safe hourly 0.15)
      // 8-hour shift dose = 0.12 * 8 = 0.96 mSv
      // 0.96 mSv > 5% of 10 mSv (0.5 mSv)!
      const moderateTelemetry: CARNSensorTelemetry = {
        roomId: 'flight-deck',
        doseRateMsvH: 0.12,
        projectedDailyMsv: 2.88,
        particleFlux: 160,
        timestamp: new Date().toISOString(),
      };

      const access = evaluateRoomAccess(flightDeck, moderateTelemetry, calculated, profile);
      expect(access.isRestricted).toBe(true);
      expect(access.lockoutReasons.some((r) => r.includes('Personalized Budget Threat'))).toBe(true);
      expect(access.lockoutReasons.some((r) => r.includes('5% of remaining 30-day budget'))).toBe(true);
    });

    it('enforces Hard Career Ceiling lockout on outer hull modules when crew reaches >= 450 mSv', () => {
      const profile: CrewRadiationProfile = {
        id: 'crew-senior-eva',
        displayName: 'Veteran EVA Lead',
        role: 'Flight Engineer',
        preMissionBaselineMsv: 460, // >= 450 mSv!
        missionDailyDosesMsv: [5],
        lastBeaconLocation: 'habitation',
      };
      const calculated = calculateCrewDose(profile);

      // Low safe CARN rate: 0.05 mSv/h
      const safeTelemetry: CARNSensorTelemetry = {
        roomId: 'flight-deck',
        doseRateMsvH: 0.05,
        projectedDailyMsv: 1.2,
        particleFlux: 60,
        timestamp: new Date().toISOString(),
      };

      // Flight Deck is outer hull -> locked out
      const accessOuter = evaluateRoomAccess(flightDeck, safeTelemetry, calculated, profile);
      expect(accessOuter.isRestricted).toBe(true);
      expect(accessOuter.lockoutReasons.some((r) => r.includes('Hard Career Ceiling'))).toBe(true);

      // Central Storm Shelter is NOT outer hull -> ALLOWED
      const accessCore = evaluateRoomAccess(coreShelter, safeTelemetry, calculated, profile);
      expect(accessCore.isRestricted).toBe(false);
      expect(accessCore.status).toBe('ALLOWED');
    });

    it('flags beacon alert if crew member is currently inside a restricted room', () => {
      const profile: CrewRadiationProfile = {
        id: 'crew-in-hazard',
        displayName: 'Trapped Astronaut',
        role: 'Specialist',
        preMissionBaselineMsv: 100,
        missionDailyDosesMsv: [1],
        lastBeaconLocation: 'flight-deck', // Currently in flight deck!
      };
      const calculated = calculateCrewDose(profile);

      const spikeTelemetry: CARNSensorTelemetry = {
        roomId: 'flight-deck',
        doseRateMsvH: 3.5,
        projectedDailyMsv: 84.0,
        particleFlux: 4500,
        timestamp: new Date().toISOString(),
      };

      const access = evaluateRoomAccess(flightDeck, spikeTelemetry, calculated, profile);
      expect(access.isRestricted).toBe(true);
      expect(access.beaconAlert).toBe(true);
    });
  });

  describe('4. Vehicle-Wide Alert Classification (GREEN, YELLOW, ORANGE, RED)', () => {
    it('evaluates GREEN status under nominal baseline conditions', () => {
      const preset = TELEMETRY_PRESETS.GREEN;
      const crewDoses = [
        calculateCrewDose({
          id: 'c1',
          displayName: 'C1',
          role: 'Cmd',
          preMissionBaselineMsv: 100,
          missionDailyDosesMsv: [1, 2, 1],
          lastBeaconLocation: 'habitation',
        }),
      ];

      const assessment = evaluateVehicleRadiationStatus(SPACECRAFT_COMPARTMENTS, preset.telemetry, crewDoses);
      expect(assessment.status).toBe('GREEN');
      expect(assessment.statusLabel).toBe('Safe Baseline');
      expect(assessment.countermeasures).toContain('None. Standard transit operations.');
    });

    it('evaluates YELLOW status when CARN reads between 0.15 and 2.1 mSv/h', () => {
      const preset = TELEMETRY_PRESETS.YELLOW;
      const crewDoses = [
        calculateCrewDose({
          id: 'c1',
          displayName: 'C1',
          role: 'Cmd',
          preMissionBaselineMsv: 100,
          missionDailyDosesMsv: [1, 2, 1],
          lastBeaconLocation: 'habitation',
        }),
      ];

      const assessment = evaluateVehicleRadiationStatus(SPACECRAFT_COMPARTMENTS, preset.telemetry, crewDoses);
      expect(assessment.status).toBe('YELLOW');
      expect(assessment.statusLabel).toContain('Elevated Exposure');
      expect(assessment.warningMessage).toContain('exceeds 3.5 mSv/day safe baseline');
      expect(assessment.countermeasures.some((c) => c.includes('antioxidant-rich foods'))).toBe(true);
      expect(assessment.countermeasures.some((c) => c.includes('Vitamin C, Vitamin E, Selenium'))).toBe(true);
    });

    it('evaluates ORANGE status when CARN registers > 2.1 mSv/h (> 50 mSv/day)', () => {
      const preset = TELEMETRY_PRESETS.ORANGE;
      const crewDoses = [
        calculateCrewDose({
          id: 'c1',
          displayName: 'C1',
          role: 'Cmd',
          preMissionBaselineMsv: 100,
          missionDailyDosesMsv: [1, 2, 1],
          lastBeaconLocation: 'habitation',
        }),
      ];

      const assessment = evaluateVehicleRadiationStatus(SPACECRAFT_COMPARTMENTS, preset.telemetry, crewDoses);
      expect(assessment.status).toBe('ORANGE');
      expect(assessment.statusLabel).toContain('Active Solar Particle Event');
      expect(assessment.warningMessage).toContain('WARNING – SOLAR PARTICLE EVENT (SPE)');
      expect(assessment.countermeasures.some((c) => c.includes('Immediate Deep-Space EVA Recall'))).toBe(true);
      expect(assessment.countermeasures.some((c) => c.includes('Automated Crew Routing'))).toBe(true);
    });

    it('evaluates RED status when CARN registers > 4.17 mSv/h (> 100 mSv/day) across multiple modules', () => {
      const preset = TELEMETRY_PRESETS.RED;
      const crewDoses = [
        calculateCrewDose({
          id: 'c1',
          displayName: 'C1',
          role: 'Cmd',
          preMissionBaselineMsv: 100,
          missionDailyDosesMsv: [1, 2, 1],
          lastBeaconLocation: 'habitation',
        }),
      ];

      const assessment = evaluateVehicleRadiationStatus(SPACECRAFT_COMPARTMENTS, preset.telemetry, crewDoses);
      expect(assessment.status).toBe('RED');
      expect(assessment.statusLabel).toContain('Severe Solar Storm');
      expect(assessment.warningMessage).toContain('EMERGENCY – SEVERE SOLAR STORM');
      expect(assessment.countermeasures.some((c) => c.includes('Central Storm Shelter'))).toBe(true);
      expect(assessment.countermeasures.some((c) => c.includes('Crew Accountability Check'))).toBe(true);
    });
  });

  describe('5. Directional Event Localization', () => {
    it('accurately identifies sunward spike, heading, and shielding attenuation ratio', () => {
      const telemetry = TELEMETRY_PRESETS.ORANGE.telemetry;
      const loc = localizeDirectionalEvent(SPACECRAFT_COMPARTMENTS, telemetry);

      expect(loc.severity).toBe('SEVERE');
      expect(loc.highestDoseRateMsvH).toBeGreaterThan(2.1);
      expect(loc.vectorHeading).toContain('Sunward');
      expect(loc.attenuationRatio).toBeGreaterThan(20); // Peak outer rate is much higher than storm shelter
      expect(loc.description).toContain('Attenuation factor');
    });
  });

  describe('6. Automated Lowest-Dose Crew Routing (Dijkstra Pathfinding)', () => {
    it('computes turn-by-turn routing from Flight Deck to Storm Shelter avoiding hotzones', () => {
      // In ORANGE preset, airlock has 3.85 mSv/h spike, flight deck has 2.75 mSv/h
      // Path should go: flight-deck -> habitation -> storm-shelter, avoiding airlock!
      const telemetry = TELEMETRY_PRESETS.ORANGE.telemetry;
      const result = computeLowestDosePath('flight-deck', 'storm-shelter', SPACECRAFT_COMPARTMENTS, telemetry);

      expect(result.path).toEqual(['flight-deck', 'habitation', 'storm-shelter']);
      expect(result.pathNames).toEqual(['Flight Deck', 'Habitation Module', 'Central Storm Shelter']);
      expect(result.turnByTurn.length).toBe(3);
      expect(result.turnByTurn[0].instruction).toContain('Begin evacuation');
      expect(result.turnByTurn[2].instruction).toContain('Central Storm Shelter');
      expect(result.avoidedHotzones.some((h) => h.includes('Airlock'))).toBe(true);
    });
  });

  describe('7. Post-Event Recovery & Hysteresis Rule', () => {
    it('rejects de-escalation if less than 6 hours have elapsed at safe levels', () => {
      const safeSnapshot = SPACECRAFT_COMPARTMENTS.map((c) => ({
        roomId: c.id,
        doseRateMsvH: 0.08,
        projectedDailyMsv: 1.92,
        particleFlux: 100,
        timestamp: new Date().toISOString(),
      }));

      // Only 3 hours of safe data
      const snapshots = Array(3).fill(safeSnapshot);
      const hysteresis = checkHysteresisCompletion(SPACECRAFT_COMPARTMENTS, snapshots, 6);

      expect(hysteresis.isComplete).toBe(false);
      expect(hysteresis.hoursStabilized).toBe(3);
      expect(hysteresis.reasons[0]).toContain('Hysteresis incomplete');
    });

    it('approves de-escalation once 6 consecutive hours at safe levels are verified', () => {
      const safeSnapshot = SPACECRAFT_COMPARTMENTS.map((c) => ({
        roomId: c.id,
        doseRateMsvH: 0.08,
        projectedDailyMsv: 1.92,
        particleFlux: 100,
        timestamp: new Date().toISOString(),
      }));

      // 6 hours of safe data
      const snapshots = Array(6).fill(safeSnapshot);
      const hysteresis = checkHysteresisCompletion(SPACECRAFT_COMPARTMENTS, snapshots, 6);

      expect(hysteresis.isComplete).toBe(true);
      expect(hysteresis.hoursStabilized).toBe(6);
      expect(hysteresis.reasons[0]).toContain('Hysteresis complete');
    });
  });
});
