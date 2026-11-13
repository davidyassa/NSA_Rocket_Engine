/**
 * NASA Human Research Program (HRP) Five Hazards Matrix & Evidence Catalog
 *
 * Grounded in the official NASA Human Research Program Architecture:
 * - HRP Evidence Books: https://humanresearchroadmap.nasa.gov/
 * - Human System Risk Board (HSRB) Master Risk List
 * - NASA Open Science Data Repository (OSDR) & GeneLab
 */

export interface NasaHazard {
  id: string;
  name: string;
  /**
   * Sol Check internal reference (SC-…). NASA does not publish risk codes in
   * this form; the official link is the HRP element and hazard name below.
   */
  hrpRiskId: string;
  /** Current NASA HRP research element that owns this area. */
  hrpElement: string;
  tagline: string;
  spaceflightMechanism: string;
  solCheckMetrics: string[];
  /** What Sol Check measures or tracks today for this hazard. */
  measuredBy: string[];
  /** What a full flight system would add: specialist medical hardware or habitat sensors. */
  needsHardware: string[];
  sol43Status: {
    state: 'nominal' | 'elevated' | 'active_monitoring';
    summary: string;
  };
  clinicalImpacts: string[];
  operationalCountermeasures: string[];
  officialReferences: {
    title: string;
    publisher: string;
    link?: string;
  }[];
}

export const NASA_FIVE_HAZARDS: NasaHazard[] = [
  {
    id: 'radiation',
    name: '1. Space Radiation',
    hrpRiskId: 'SC-RAD-01',
    hrpElement: 'Space Radiation (SR)',
    tagline: 'Galactic Cosmic Rays (GCR) & Solar Particle Events (SPE)',
    spaceflightMechanism:
      'Mars lacks a global geomagnetic field and dense atmosphere. Energetic protons and heavy HZE ions penetrate spacecraft walls, causing continuous cellular ionizations.',
    solCheckMetrics: [
      'msl_rad_curiosity',
      'hourly_median_radiation',
      'peak_event_radiation',
      'carn_sensor_mSv_h',
      'rolling_30day_mSv',
      'career_effective_dose_mSv',
    ],
    measuredBy: [
      'Real Curiosity RAD dose-rate readings replayed on the mission timeline (Sol 41 solar particle event)',
      '1-minute CARN (Cosmic & Ambient Radiation Node) sensor streams per spacecraft compartment',
      'Rolling 30-day (250 mSv limit) and cumulative career dose tracking against NASA-STD-3001 600 mSv universal ceiling',
      'Personalized room access & dynamic lockdown matrix based on individual permissible dose budgets',
      'Nausea and fatigue symptoms reported in the daily check-in',
    ],
    needsHardware: [
      'Personal radiation dosimeter for each crew member (15-minute polling intervals)',
      'Compartment-bound CARN dosimeters with 1-minute streaming telemetry',
      'Finger-prick blood/saliva automated lymphocyte assay kits (24h and 48h post-event)',
    ],
    sol43Status: {
      state: 'active_monitoring',
      summary:
        'Sol 41 coronal mass ejection event verified via Curiosity RAD (15.38 µGy/h raw at 08:01 UTC; peak 23.18 µGy/h). Post-storm recovery monitored on Sols 42–43 with CARN telemetry and 6-hour hysteresis verification.',
    },
    clinicalImpacts: [
      'Acute Radiation Syndrome (prodromal nausea, fatigue, hemopoietic suppression)',
      'Central Nervous System decrements (neuro-inflammation and cognitive slowing)',
      'Micro-vascular endothelial damage and elevated lifetime carcinogenesis risk',
      'Radiation-induced cataracts (eye lens) and circulatory stiffness (Tier 2 warning >= 300 mSv)',
    ],
    operationalCountermeasures: [
      'Central Storm Shelter maximum shielding (surrounded by potable water tanks and food stores)',
      'Dynamic compartment lockdown matrix (acute rate breach > 2.1 mSv/h, personalized 8h shift budget threats, career ceiling lockouts)',
      'Automated turn-by-turn lowest-dose crew evacuation routing avoiding active CARN hotzones',
      'Antioxidant dietary protocol and radioprotective supplementation (Vitamins C/E, Selenium, NAC, Omega-3)',
      '6-hour hysteresis de-escalation gate and mandatory 24h/48h lymphocyte biometric assays',
    ],
    officialReferences: [
      {
        title: 'NASA-STD-3001: Universal 600 mSv Career Effective Dose Limit for Astronauts',
        publisher: 'National Aeronautics and Space Administration (NASA)',
      },
      {
        title: 'MSL-RAD Surface Radiation Measurements at Gale Crater',
        publisher: 'NASA Planetary Data System (PDS) / Southwest Research Institute',
        link: 'https://pds-ppi.igpp.ucla.edu/',
      },
      {
        title: 'Evidence Report: Risk of Cardiovascular Disease and other Degenerative Tissue Effects from Radiation',
        publisher: 'NASA Human Research Program (HRP)',
      },
    ],
  },
  {
    id: 'isolation',
    name: '2. Isolation and Confinement',
    hrpRiskId: 'SC-BHP-01',
    hrpElement: 'Human Factors and Behavioral Performance (HFBP)',
    tagline: 'Circadian Disruption, Sleep Restriction & Sensory Monotony',
    spaceflightMechanism:
      'Limited contact outside the crew and long periods in a shared habitat can reduce social contact and sensory variety. Irregular schedules, workload, and light exposure can also disrupt sleep and circadian timing.',
    solCheckMetrics: ['sleep_duration', 'mood', 'pvt_reaction_time', 'lapses_count', 'hrv_rmssd', 'behavioral_crisis'],
    measuredBy: [
      'Sleep hours and mood compared with your own 14-sol baseline, with a combined sleep-and-mood trend rule',
      'Saved vigilance checks for reaction time and attention lapses, with a personal baseline when enough comparable sessions are available',
      'Fatigue reported in the daily check-in',
      'Camera heart rate variability (HRV) compared with your own usual, as a recovery and stress cue',
      '“Feeling hopeless or unable to cope” goes straight to the Crew Medical Officer: with a 40-minute round trip, a crisis is handled onboard',
    ],
    needsHardware: ['Wearable sleep tracker (actigraphy) and ECG chest strap for clinical-grade HRV', 'Camera-based drowsiness and eye-closure monitoring'],
    sol43Status: {
      state: 'elevated',
      summary:
        'The after-storm demo follows shorter sleep and lower mood. Open Hazard 2 to see recorded values, personal baselines, and follow-up actions.',
    },
    clinicalImpacts: [
      'Short sleep can slow responses and reduce alertness during sustained tasks.',
      'Irregular lighting and schedules can shift sleep timing and increase sleepiness on duty.',
      'Limited social contact and variety can affect mood, motivation, and crew coordination.',
    ],
    operationalCountermeasures: [
      'Check vigilance when sleep and mood trend lower or fatigue is reported.',
      'Plan protected sleep and wake times, with alertness lighting after waking and lower-intensity lighting before sleep.',
      'Set aside time for delayed Earth contact and activities that add sensory variety.',
    ],
    officialReferences: [
      {
        title: 'Evidence Report: Risk of Adverse Cognitive or Behavioral Conditions and Psychiatric Disorders',
        publisher: 'NASA Human Research Program (HRP) Behavioral Health & Performance',
        link: 'https://humanresearchroadmap.nasa.gov/evidence/reports/HRP-ER-BMED-HFBP-20250210.pdf',
      },
      {
        title: 'Vigilance testing and sleep deficiency aboard the ISS',
        publisher: 'Jones et al., Sleep (2022)',
        link: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8919197/',
      },
      { title: 'Sleep loss, circadian desynchronization, and work overload', publisher: 'NASA HRP', link: 'https://humanresearchroadmap.nasa.gov/evidence/reports/Sleep.pdf' },
      { title: 'ISS dynamic lighting schedule', publisher: 'NASA TechPort', link: 'https://techport.nasa.gov/projects/23237' },
      { title: 'Can space gardening help astronauts cope with isolation?', publisher: 'NASA', link: 'https://www.nasa.gov/humans-in-space/can-space-gardening-help-astronauts-cope-with-isolation/' },
      { title: 'Hazard 2: Isolation', publisher: 'NASA podcast', link: 'https://www.nasa.gov/podcasts/houston-we-have-a-podcast/hazard-2-isolation/' },
      { title: 'About NEK and SIRIUS', publisher: 'NASA', link: 'https://www.nasa.gov/about-nek-sirius/' },
    ],
  },
  {
    id: 'distance',
    name: '3. Distance from Earth',
    hrpRiskId: 'SC-EXMC-01',
    hrpElement: 'Exploration Medical Capability (ExMC)',
    tagline: 'Onboard health monitoring and delayed ground support',
    spaceflightMechanism:
      'NASA describes a Mars communication delay of up to 20 minutes one way (40 minutes round-trip). In Sol Check, the simulated earliest reply is 40 minutes after sending. Real-time telemedicine is physically impossible.',
    solCheckMetrics: [
      'simulated_delay_sec',
      'autonomous_assessment_tier',
      'handoff_package',
      'heart_rate',
      'bp_systolic',
      'bp_diastolic',
      'body_temp',
      'blood_glucose',
      'sleep_duration',
      'mood',
    ],
    measuredBy: [
      'Daily 60-second check-in covering 7 frozen metrics and 8 fixed symptoms on this offline device',
      'Personal baseline comparisons (median of previous 14 sols with at least 5 readings; otherwise baseline_not_established)',
      'Deterministic, explainable rules engine with transparent "Why this finding?" drawer',
      'Three-tier escalation ladder: self_care -> crew_medical_officer -> ground_flight_surgeon',
      'Local store-and-forward telemetry handoff draft with simulated 20-minute countdown and FNV-1a-32 checksum (zero runtime network calls)',
      'Curiosity MSL-RAD surface radiation archive mapped contextually with separate provenance badges (nasa_archive vs synthetic_demo)',
    ],
    needsHardware: [
      'Mission communications equipment for a store-and-forward link to Earth',
      'Clinical diagnostic laboratory hardware and calibrated spaceflight sensors',
    ],
    sol43Status: {
      state: 'active_monitoring',
      summary:
        'The Sol 43 demo models a 20-minute one-way delay. Maya Chen exhibits lower sleep and mood on 4 of the last 5 sols, escalating to onboard Crew Medical Officer review.',
    },
    clinicalImpacts: [
      'Up to 20-minute one-way (40-minute round-trip) communication latency precludes real-time emergency guidance from ground flight surgeons.',
      'Non-physician crew must independently detect health shifts without published definitive spaceflight clinical cutoffs.',
      'Strict resource and supply constraints require conservative self-care without unvalidated medications or clinical therapies.',
      'Compounded environmental stress and isolation interact with vital parameters without immediate ground diagnostic triage.',
    ],
    operationalCountermeasures: [
      'Offline-first on-device evaluation using deterministic, explainable rules and an inspectable "Why?" drawer.',
      'Entry-error guards and impossible-value filtering (check_entry status, omitted fields stored as not_measured).',
      '3-tier escalation protocol: self-care guidance -> Crew Medical Officer review -> Ground Flight Surgeon handoff.',
      'Standardized, zero-network-call telemetry handoff draft with cryptographic change detection (FNV-1a-32).',
    ],
    officialReferences: [
      {
        title: 'Hazard: Distance from Earth',
        publisher: 'NASA Human Research Program',
        link: 'https://www.nasa.gov/hrp/hazard-distance-from-earth/',
      },
      {
        title: 'NASA-STD-3001 Vol 1 Rev C: Space Flight Human-System Standard',
        publisher: 'NASA Office of the Chief Health and Medical Officer',
        link: 'https://www.nasa.gov/reference/3-0-health-and-medical-care/',
      },
      {
        title: 'Human System Risks: Evidence Reports',
        publisher: 'NASA Human Research Program',
        link: 'https://humanresearchroadmap.nasa.gov/evidence/',
      },
      {
        title: 'Earth-Independent Medical Operations (EIMO) Concept of Operations (2024)',
        publisher: 'NASA Technical Reports Server',
        link: 'https://ntrs.nasa.gov/citations/20240001402',
      },
      {
        title: 'MSL-RAD Surface Radiation Measurements at Gale Crater',
        publisher: 'NASA Planetary Data System (PDS) / Southwest Research Institute',
        link: 'https://pds-ppi.igpp.ucla.edu/',
      },
    ],
  },
  {
    id: 'gravity',
    name: '4. Altered Gravity Fields',
    hrpRiskId: 'SC-HHC-01',
    hrpElement: 'Human Health Countermeasures (HHC)',
    tagline: 'Microgravity Transit (0g) & Martian Surface Gravity (0.38g)',
    spaceflightMechanism:
      'Transition between 0g (transit), 0.38g (Mars), and 1g (Earth) alters hydrostatic pressure gradients, vestibular perception, and mechanical bone/muscle loading.',
    solCheckMetrics: ['bp_systolic', 'bp_diastolic', 'stand_test', 'exercise_minutes', 'fluid_intake', 'motion_sickness_symptoms', 'vision_changes', 'muscle_symptoms', 'kidney_symptoms'],
    measuredBy: [
      'Stand-up test: blood pressure and pulse sitting, then after 3 minutes standing (orthostatic intolerance)',
      'Daily exercise minutes against a target (the countermeasure for muscle and bone loss)',
      'Fluid intake (hydration before gravity changes)',
      'Dizziness, vertigo, nausea, vomiting and balance problems (space motion sickness)',
      'Vision changes and puffy face or head fullness (SANS screening, prompts an eye check)',
      'Kidney-stone warning signs (side or back pain, blood in urine) sent to the Crew Medical Officer, with recent low fluid named',
    ],
    needsHardware: [
      'Urine and blood chemistry (calcium, electrolytes) and ultrasound for kidney-stone risk',
      'OCT, fundus imaging or eye ultrasound for SANS',
      'DXA scan and blood/urine biomarkers for bone density',
      'Ultrasound, EMG and force sensors for muscle mass and strength',
      'Eye-tracking camera and motion sensors (IMU) for balance and nystagmus',
    ],
    sol43Status: {
      state: 'nominal',
      summary:
        'Blood pressure 116/74 mmHg and core body temp 36.7 °C remain within normal physiological ranges. Crew body map indicates no localized musculoskeletal symptoms. Normal blood pressure and temperature do not rule out muscle or bone loss, which need dedicated measurements (ultrasound, DXA, biomarkers).',
    },
    clinicalImpacts: [
      'Headward fluid shift causing facial swelling and eye/vision changes (SANS, spaceflight-associated neuro-ocular syndrome); the role of intracranial pressure is not established and the mechanism is still being researched',
      'Orthostatic intolerance upon gravitational transition (impaired baroreflex regulation)',
      'Bone mineral density loss (1–1.5% monthly in weight-bearing bones) and muscle fiber atrophy',
      'Kidney stones: calcium released from bone plus low fluid intake raises urine saturation of stone-forming salts',
    ],
    operationalCountermeasures: [
      'Daily exercise block of about 2.5 hours on the ISS schedule, including equipment setup and cleanup (roughly 2 hours of actual resistive, treadmill and cycle exercise)',
      'Validated blood pressure pair verification (systolic > diastolic gating) and trend monitoring',
      'Fluid and salt loading in the hours before returning to gravity (re-entry/landing) to reduce orthostatic intolerance; not the same as drinking water during EVA',
    ],
    officialReferences: [
      {
        title: 'Evidence Report: Risk of Orthostatic Intolerance During and Following Spaceflight',
        publisher: 'NASA Human Research Program Human Health Countermeasures (HHC)',
      },
    ],
  },
  {
    id: 'environment',
    name: '5. Hostile / Closed Environments',
    hrpRiskId: 'SC-ENV-01',
    hrpElement: 'Human Factors and Behavioral Performance (HFBP), habitability',
    tagline: 'Cabin Atmosphere, Trace Gases & Toxic Martian Perchlorates',
    spaceflightMechanism:
      'A completely closed life support system concentrates carbon dioxide, particulate matter, off-gassed VOCs, and fine reactive Martian regolith dust tracked into the airlock.',
    solCheckMetrics: ['habitat_co2', 'cabin_temperature', 'headache_symptom', 'nausea_symptom', 'respiratory_symptoms'],
    measuredBy: [
      'Habitat CO2 and cabin temperature per sol (simulated life-support feed) against NASA’s 3 mmHg CO2 limit',
      'Headaches linked to high-CO2 sols, with the caveat that timing alone does not prove a cause',
      'Headache, nausea and breathing symptoms reported in the daily check-in',
    ],
    needsHardware: ['Real habitat CO2, O2, humidity and trace-gas sensors connected to Sol Check', 'Core-temperature sensor and urine monitoring for heat strain and dehydration'],
    sol43Status: {
      state: 'nominal',
      summary:
        'No acute respiratory or environmental toxic symptoms reported. Habitat environmental scrubbers operating nominally after dust-filtration cycle.',
    },
    clinicalImpacts: [
      'Hypercapnia from localized CO2 pocketing (headaches, visual disturbances, lethargy)',
      'Respiratory irritation and pulmonary inflammation from sharp microscopic Martian dust',
      'Microbiome alterations and immune system dysregulation in confined habitats',
    ],
    operationalCountermeasures: [
      'Airlock electrostatic and vacuum dust-mitigation suits-off protocols',
      'Symptom-cluster screening (headache + shortness of breath + nausea trigger environmental review)',
      'Catalytic air scrubbers and continuous trace contaminant monitoring',
    ],
    officialReferences: [
      {
        title: 'Evidence Report: Risk of Adverse Health Effects from Inadequate Food and Environmental Contamination',
        publisher: 'NASA Space Human Factors and Habitability (SHFH)',
      },
    ],
  },
];
