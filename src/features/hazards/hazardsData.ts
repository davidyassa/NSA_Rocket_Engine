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
    solCheckMetrics: ['msl_rad_curiosity', 'hourly_median_radiation', 'peak_event_radiation'],
    sol43Status: {
      state: 'active_monitoring',
      summary:
        'Sol 41 coronal mass ejection event verified via Curiosity RAD (15.38 µGy/h raw at 08:01 UTC; peak 23.18 µGy/h). Post-storm recovery monitored on Sols 42–43.',
    },
    clinicalImpacts: [
      'Acute Radiation Syndrome (prodromal nausea, fatigue, hemopoietic suppression)',
      'Central Nervous System decrements (neuro-inflammation and cognitive slowing)',
      'Micro-vascular endothelial damage and elevated lifetime carcinogenesis risk',
    ],
    operationalCountermeasures: [
      'Habitat water/polyethylene storm shelter shielding',
      'Continuous Curiosity MSL RAD dosimetry and active threshold alerts',
      'Daily physiological monitoring for prodromal radiation symptoms',
    ],
    officialReferences: [
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
      'Living in a small, closed habitat with a 6-person crew for 900+ sols causes circadian drift (Mars sol = 24h 39m), sensory monotony, and cumulative sleep debt.',
    solCheckMetrics: ['sleep_duration', 'mood', 'pvt_reaction_time', 'lapses_count'],
    sol43Status: {
      state: 'elevated',
      summary:
        'Sol 43 check-in records reduced sleep (4.5 hours vs 7.8h baseline) and mood 2/5 following storm operations. PVT-B cognitive evaluation recommended.',
    },
    clinicalImpacts: [
      'Cumulative neurobehavioral fatigue and involuntary cognitive lapses (>500 ms)',
      'Circadian misalignment, insomnia, and altered cortisol rhythms',
      'Interpersonal tension, reduced morale, and performance degradation during critical tasks',
    ],
    operationalCountermeasures: [
      'NASA Brief Psychomotor Vigilance Task (PVT-B) daily readiness verification',
      'Dynamic solid-state lighting (blue-depleted 2700K presleep, blue-enriched 6500K morning)',
      'Scheduled Earth communication exchanges and structured sleep hygiene protocol',
    ],
    officialReferences: [
      {
        title: 'Evidence Report: Risk of Adverse Cognitive or Behavioral Conditions and Psychiatric Disorders',
        publisher: 'NASA Human Research Program (HRP) Behavioral Health & Performance',
      },
      {
        title: 'Brief Psychomotor Vigilance Test on the International Space Station',
        publisher: 'Dinges DF et al., NASA Technical Reports Server',
      },
    ],
  },
  {
    id: 'distance',
    name: '3. Distance from Earth',
    hrpRiskId: 'SC-EXMC-01',
    hrpElement: 'Exploration Medical Capability (ExMC)',
    tagline: '20-Minute Light-Speed Delay & Autonomous Medical Care',
    spaceflightMechanism:
      'Mars orbital distance creates a one-way communication latency of 4 to 22 minutes (Sol 43 simulation: 20 min one-way, 40 min round-trip). Immediate telemedicine is physically impossible.',
    solCheckMetrics: ['simulated_delay_sec', 'autonomous_assessment_tier', 'handoff_package'],
    sol43Status: {
      state: 'active_monitoring',
      summary:
        '40-minute round-trip latency active. Local Sol Check decision support evaluates check-in autonomously; formatted Flight Surgeon handoff generated.',
    },
    clinicalImpacts: [
      'Total crew reliance on onboard medical expertise and clinical software during emergencies',
      'Zero real-time tele-robotic surgical support from terrestrial specialists',
      'Critical need for explainable, deterministic diagnostic logic with full audit trails',
    ],
    operationalCountermeasures: [
      'Sol Check 100% offline-first client architecture with zero remote CDN dependencies',
      'Evidence-grounded deterministic rule engine with tiered triage recommendations',
      'Automated Clinical Evidence Passport and Flight Surgeon Handoff Package generation',
    ],
    officialReferences: [
      {
        title: 'Evidence Report: Risk of Unacceptable Health and Mission Outcomes Due to Limitations of In-flight Medical Capabilities',
        publisher: 'NASA Exploration Medical Capability (ExMC)',
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
    solCheckMetrics: ['bp_systolic', 'bp_diastolic', 'muscle_symptoms', 'body_temp'],
    sol43Status: {
      state: 'nominal',
      summary:
        'Blood pressure 116/74 mmHg and core body temp 36.7 °C remain within normal physiological ranges. Crew body map indicates no localized musculoskeletal symptoms.',
    },
    clinicalImpacts: [
      'Cephalad fluid shift causing venous engorgement, facial edema, and intracranial pressure alterations (SANS)',
      'Orthostatic intolerance upon gravitational transition (impaired baroreflex regulation)',
      'Bone mineral density loss (1–1.5% monthly in weight-bearing bones) and muscle fiber atrophy',
    ],
    operationalCountermeasures: [
      'Daily 2.5-hour countermeasure exercise regimen (resistive exercise + cycle ergometer)',
      'Validated blood pressure pair verification (systolic > diastolic gating) and trend monitoring',
      'Pre-EVA hydration and electrolyte loading protocols',
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
    solCheckMetrics: ['headache_symptom', 'nausea_symptom', 'respiratory_symptoms'],
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
