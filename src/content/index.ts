import type { ActionCard, MetricId, SourceRecord } from '../contracts';
import { RADLAB_SOURCE } from '../data/nasa';

const retrievedOn = '2026-11-12';

export const SOURCES: Record<string, SourceRecord> = {
  [RADLAB_SOURCE.id]: RADLAB_SOURCE,
  'orthostatic-consensus': {
    id: 'orthostatic-consensus',
    title: 'Consensus statement on the definition of orthostatic hypotension (Freeman et al., 2011)',
    publisher: 'Clinical Autonomic Research · PubMed',
    url: 'https://pubmed.ncbi.nlm.nih.gov/21431947/',
    retrievedOn: '2026-11-13',
    supports: 'A sustained fall of at least 20 mmHg systolic or 10 mmHg diastolic within 3 minutes of standing defines orthostatic hypotension.',
    doesNotSupport: 'Diagnosing a cause, or how a spaceflight medical team should act on the result.',
  },
  'orthostatic-hr-review': {
    id: 'orthostatic-hr-review',
    title: 'Postural tachycardia syndrome: a review (heart-rate rise on standing)',
    publisher: 'PubMed Central',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4978226/',
    retrievedOn: '2026-11-13',
    supports: 'In adults the heart rate normally rises by no more than about 30 bpm on standing.',
    doesNotSupport: 'A diagnosis of postural tachycardia syndrome from a single stand test.',
  },
  'nasa-co2-brief': {
    id: 'nasa-co2-brief',
    title: 'Carbon Dioxide technical brief (OCHMO-TB-004)',
    publisher: 'NASA Office of the Chief Health & Medical Officer',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf',
    retrievedOn: '2026-11-13',
    supports: 'Headaches linked to cabin CO2 around 2.8–4.5 mmHg; NASA-STD-3001 limits the 1-hour average to 3 mmHg; a 7-day average under 2.5 mmHg keeps headache risk below 1%.',
    doesNotSupport: 'That a particular headache was caused by CO2; fluid shifts can cause similar headaches.',
  },
  'ppg-respiratory-fusion': {
    id: 'ppg-respiratory-fusion',
    title: 'Multiparameter respiratory rate estimation from the photoplethysmogram (Karlen et al., IEEE TBME 2013)',
    publisher: 'IEEE Transactions on Biomedical Engineering',
    url: 'https://doi.org/10.1109/TBME.2013.2246160',
    retrievedOn: '2026-11-13',
    supports: 'Breathing changes the pulse wave in three ways (baseline, amplitude, beat timing). Fusing all three and discarding estimates that disagree gave about 3 breaths/min error, better than any single method.',
    doesNotSupport: 'That a webcam pulse wave is as accurate as a fingertip pulse oximeter; the study used contact sensors.',
  },
  'hrv-norms': {
    id: 'hrv-norms',
    title: 'An overview of heart rate variability metrics and norms (Shaffer & Ginsberg, 2017)',
    publisher: 'Frontiers in Public Health',
    url: 'https://pubmed.ncbi.nlm.nih.gov/29034226/',
    retrievedOn: '2026-11-13',
    supports: 'RMSSD is a short-term time-domain HRV measure; baseline values depend on age, sex and recording length, so norms are not interchangeable and personal comparison matters.',
    doesNotSupport: 'A diagnosis from a single camera HRV reading.',
  },
  'iss-body-mass': {
    id: 'iss-body-mass',
    title: 'Body mass changes during long-duration spaceflight (Zwart et al., 2014)',
    publisher: 'Aviation, Space, and Environmental Medicine',
    url: 'https://pubmed.ncbi.nlm.nih.gov/25197887/',
    retrievedOn: '2026-11-13',
    supports: 'Crew members have often eaten less than they need in flight and lost body mass; regular body-mass monitoring is important for crew health. NASA reports losses of about 2–5% in the first month.',
    doesNotSupport: 'A clinical cut-off: the 3% and 5% thresholds in Sol Check are demo values.',
  },
  'renal-stones-astronauts': {
    id: 'renal-stones-astronauts',
    title: 'Renal stone formation among astronauts (Pietrzyk et al., 2007)',
    publisher: 'Aviation, Space, and Environmental Medicine',
    url: 'https://pubmed.ncbi.nlm.nih.gov/17511294/',
    retrievedOn: '2026-11-13',
    supports: 'Spaceflight raises the urine saturation of stone-forming salts; drinking more fluid lowers the risk, and screening helps find crew at higher risk.',
    doesNotSupport: 'Diagnosing a kidney stone from symptoms alone; that needs urine tests and imaging.',
  },
  'nasa-bmed-risk': {
    id: 'nasa-bmed-risk',
    title: 'Risk of adverse cognitive or behavioral conditions and psychiatric disorders',
    publisher: 'NASA Human Health and Performance',
    url: 'https://www.nasa.gov/directorates/esdmd/hhp/risk-of-adverse-cognitive-or-behavioral-conditions-and-psychiatric-disorders',
    retrievedOn: '2026-11-13',
    supports: 'Behavioral-health risk grows with mission length and isolation; validated countermeasures for exploration missions are not yet available, so the crew must handle problems onboard.',
    doesNotSupport: 'A psychiatric diagnosis from a self-report checkbox.',
  },
  'sans-review': {
    id: 'sans-review',
    title: 'Spaceflight-associated neuro-ocular syndrome (systematic review)',
    publisher: 'PubMed Central',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8956714/',
    retrievedOn: '2026-11-13',
    supports: 'Headward fluid shift is the leading hypothesis; the role of raised intracranial pressure is unproven; vision and eye changes need specialist eye imaging to assess.',
    doesNotSupport: 'Detecting SANS from symptoms alone.',
  },
  'nasa-exercise': {
    id: 'nasa-exercise',
    title: 'Exercise, research and computer upgrades keep crew busy (ISS blog, 2025)',
    publisher: 'NASA',
    url: 'https://www.nasa.gov/blogs/spacestation/2025/09/23/exercise-research-and-computer-upgrades-keep-crew-busy-on-tuesday',
    retrievedOn: '2026-11-13',
    supports: 'ISS crews exercise about two hours a day to counter muscle and bone loss.',
    doesNotSupport: 'A specific exercise target for a Mars surface crew, or that logged minutes measure muscle or bone health.',
  },
  'shuttle-fluid-loading': {
    id: 'shuttle-fluid-loading',
    title: 'Fluid loading with salt tablets before landing (NASA technical paper, 1994)',
    publisher: 'NASA Technical Reports Server',
    url: 'https://ntrs.nasa.gov/api/citations/19940019071/downloads/19940019071.pdf',
    retrievedOn: '2026-11-13',
    supports: 'Crews drank water with salt tablets in the 1–2 hours before touchdown to reduce orthostatic intolerance.',
    doesNotSupport: 'Daily drinking targets during a surface mission.',
  },
  'nasa-monitoring': {
    id: 'nasa-monitoring',
    title: 'NASA-STD-3001 Volume 1 · Health and Medical Care',
    publisher: 'NASA',
    url: 'https://www.nasa.gov/reference/3-0-health-and-medical-care/',
    retrievedOn,
    supports: 'Monitoring sleep, vital signs and behavioral health in-mission (§3.4–3.5) and the Crew Medical Officer role (§3.1).',
    doesNotSupport: 'The prototype’s alert thresholds, timing or recommendations as a clinical protocol.',
  },
  'nasa-eimo': {
    id: 'nasa-eimo',
    title: 'Earth-Independent Medical Operations Concept of Operations',
    publisher: 'NASA Technical Reports Server',
    url: 'https://ntrs.nasa.gov/citations/20240001402',
    retrievedOn,
    supports: 'Crew autonomy and onboard decision support when communications are delayed.',
    doesNotSupport: 'Endorsement or clinical validation of Sol Check or its routing rules.',
  },
  'nasa-human-system-risks': {
    id: 'nasa-human-system-risks',
    title: 'Human System Risks · Human Research Roadmap',
    publisher: 'NASA Human Research Program',
    url: 'https://humanresearchroadmap.nasa.gov/evidence/',
    retrievedOn: '2026-11-13',
    supports: 'NASA tracks sleep loss, behavioral health, cardiovascular changes and nutrition as human spaceflight risks.',
    doesNotSupport: 'Individual clinical thresholds or interpretation of Sol Check readings.',
  },
  'demo-method': {
    id: 'demo-method',
    title: 'Sol Check prototype method',
    publisher: 'Sol Check team',
    url: null,
    retrievedOn,
    supports: 'The demo’s prior-reading baseline, trend window, input checks and self-reported mood scale.',
    doesNotSupport: 'Clinical interpretation, a diagnosis or treatment decisions.',
  },
  'nasa-delay': {
    id: 'nasa-delay',
    title: 'Human Spaceflight Hazards · Distance from Earth',
    publisher: 'NASA Human Research Program',
    url: 'https://www.nasa.gov/hrp/hazard-distance-from-earth/',
    retrievedOn,
    supports: 'A Mars communication delay of up to 20 minutes one way, used for the simulated scenario.',
    doesNotSupport: 'A fixed Mars latency or a guaranteed response time.',
  },
  'aha-pressure': {
    id: 'aha-pressure',
    title: 'Home Blood Pressure Monitoring',
    publisher: 'American Heart Association',
    url: 'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home',
    retrievedOn,
    supports: 'Seated measurement with an upper-arm cuff and the arm supported at heart level.',
    doesNotSupport: 'An in-mission procedure or interpretation of the demo readings.',
  },
  'medline-pulse': {
    id: 'medline-pulse',
    title: 'Pulse',
    publisher: 'MedlinePlus',
    url: 'https://medlineplus.gov/ency/article/003399.htm',
    retrievedOn,
    supports: 'Counting the wrist pulse for one minute while at rest.',
    doesNotSupport: 'An alert cutoff for Sol Check.',
  },
  'medline-temperature': {
    id: 'medline-temperature',
    title: 'Temperature Measurement',
    publisher: 'MedlinePlus',
    url: 'https://medlineplus.gov/ency/article/003400.htm',
    retrievedOn,
    supports: 'Using a thermometer and recording the measurement method consistently.',
    doesNotSupport: 'An alert cutoff for Sol Check.',
  },
  'fda-glucose': {
    id: 'fda-glucose',
    title: 'How to Use Glucose Meters and Test Strips',
    publisher: 'U.S. Food and Drug Administration',
    url: 'https://www.fda.gov/consumers/consumer-updates/how-safely-use-glucose-meters-and-test-strips-diabetes',
    retrievedOn,
    supports: 'Following the meter and test strip instructions and checking what the display means.',
    doesNotSupport: 'A reason to test or a glucose alert cutoff for Sol Check.',
  },
  'nih-sleep': {
    id: 'nih-sleep',
    title: 'Sleep Diary',
    publisher: 'National Heart, Lung, and Blood Institute',
    url: 'https://www.nhlbi.nih.gov/resources/sleep-diary',
    retrievedOn,
    supports: 'Tracking the amount of sleep over time.',
    doesNotSupport: 'A sleep alert cutoff for Sol Check.',
  },
};

export interface MeasurementGuide {
  /** One-line summary kept for exports and compact views. */
  text: string;
  /** Three concise procedural steps. */
  steps: [string, string, string];
  /** Why the indicator matters in microgravity / on a deep-space mission. */
  whyInSpace: string;
  /** General adult reference range (not a spaceflight standard, not personal advice). */
  typicalRange: string;
  /** Symptoms that commonly go with readings outside the range. */
  watchFor: string;
  sourceId: string;
}

const bloodPressureGuide: MeasurementGuide = {
  text: 'Sit quietly before measuring. Use an upper-arm cuff on bare skin with your arm supported at heart level. Enter both numbers from the same reading.',
  steps: [
    'Sit still for 5 minutes with your back supported, feet anchored and the cuff arm resting at heart level.',
    'Wrap the upper-arm cuff on bare skin and stay silent while it inflates and deflates.',
    'Enter the top number as systolic and the bottom number as diastolic, both from the same reading.',
  ],
  whyInSpace: 'Without gravity, body fluids shift toward the head and the cardiovascular system adapts to a lighter workload. Tracking pressure against your own baseline shows how that adaptation is going and supports readiness for standing and walking in partial gravity.',
  typicalRange: 'Blood pressure varies by person and measurement conditions. Compare readings taken with the same method.',
  watchFor: 'Light-headedness when moving upright, headache, blurred vision, or a reading far from your usual values.',
  sourceId: 'aha-pressure',
};

export const MEASUREMENT_GUIDES = {
  heart_rate: {
    text: 'Measure after resting. For a manual reading, feel your wrist pulse with two fingers and count the beats for one minute.',
    steps: [
      'Rest quietly for 5 minutes before measuring, ideally at the same time each sol.',
      'Place two fingers on the thumb side of your inner wrist until you feel the pulse.',
      'Count the beats for a full 60 seconds (or use the optional camera estimate) and enter the number.',
    ],
    whyInSpace: 'Fluid shifts and lower physical workload in reduced gravity change how the heart works. A resting rate that drifts from your personal baseline can reflect deconditioning, poor sleep, stress or illness.',
    typicalRange: 'Adults at rest: about 60 to 100 beats per minute. Trained individuals can be lower.',
    watchFor: 'A racing, pounding or irregular pulse, dizziness, chest discomfort or shortness of breath.',
    sourceId: 'medline-pulse',
  },
  bp_systolic: bloodPressureGuide,
  bp_diastolic: bloodPressureGuide,
  body_temp: {
    text: 'Follow the thermometer instructions. Use the same measurement site each time when possible and enter the reading in °C.',
    steps: [
      'Wait 15 minutes after eating, drinking or exercise.',
      'Measure at the same site each time (for example, under the tongue) following the thermometer instructions.',
      'Read the display once it signals completion and enter the value in °C.',
    ],
    whyInSpace: 'In a closed habitat, heat leaves the body less easily, and exercise, suits and infection all change core temperature. A rise from your own baseline is an early signal worth checking.',
    typicalRange: 'Adults: about 36.1 to 37.2 °C. A reading of 38.0 °C or higher is usually treated as fever.',
    watchFor: 'Chills, sweating, unusual tiredness, aching muscles or feeling hot or cold for no reason.',
    sourceId: 'medline-temperature',
  },
  blood_glucose: {
    text: 'Follow the glucose meter and test strip instructions. Check that the display is in mg/dL before entering the result.',
    steps: [
      'Wash and dry your hands, then insert a new test strip into the meter.',
      'Prick the side of a fingertip and touch the drop of blood to the strip.',
      'Check that the display reads mg/dL, note whether you have eaten, and enter the value.',
    ],
    whyInSpace: 'Less physical loading, changed diet and disrupted sleep can affect how the body handles sugar. Regular readings show whether energy intake and activity are in balance.',
    typicalRange: 'Adults, fasting: about 70 to 99 mg/dL. Below 70 mg/dL is low.',
    watchFor: 'Shakiness, sweating, confusion or hunger (low); strong thirst, frequent urination or blurred vision (high).',
    sourceId: 'fda-glucose',
  },
  sleep_duration: {
    text: 'Estimate the hours actually spent asleep during your last sleep period. Leave time spent awake out of the total.',
    steps: [
      'Note when you fell asleep and when you finally woke at the end of your last sleep period.',
      'Subtract any time you lay awake or got up during the night.',
      'Enter the remaining hours of actual sleep, rounded to the nearest quarter hour.',
    ],
    whyInSpace: 'Missing daylight cues, noise, workload and schedule shifts (a Mars sol is about 24 hours 40 minutes) disrupt sleep. Short sleep slows reaction time and raises error risk on demanding tasks.',
    typicalRange: 'Adults: 7 hours or more per night is recommended.',
    watchFor: 'Daytime sleepiness, slower reactions, irritability, headaches or trouble concentrating.',
    sourceId: 'nih-sleep',
  },
  mood: {
    text: 'Choose the number closest to how you feel right now. Use 1 for very low and 5 for very positive.',
    steps: [
      'Pause for a moment and notice how you feel overall right now.',
      'Pick 1 for very low, 3 for neutral and 5 for very positive.',
      'Answer honestly; the value is compared only with your own recent sols.',
    ],
    whyInSpace: 'Isolation, confinement and distance from Earth are recognized behavioral-health hazards. Several low sols in a row are easier to notice and act on when tracked daily.',
    typicalRange: 'No clinical range for this demo scale; what matters is change from your own baseline.',
    watchFor: 'Several low sols in a row, withdrawing from crewmates, irritability, or loss of interest in usual tasks.',
    sourceId: 'demo-method',
  },
} as Record<MetricId, MeasurementGuide>;

const standingGuide: MeasurementGuide = {
  text: 'After your seated blood pressure and pulse, stand up and measure again after 3 minutes.',
  steps: [
    'Take your seated blood pressure and pulse first (the earlier pages).',
    'Stand up with the cuff still on. Stand still near something to hold on to.',
    'After 3 minutes of standing, measure again and type the standing numbers here. Sit down at once if you feel faint.',
  ],
  whyInSpace: 'After time in low gravity, the body is slow to keep blood flowing to the brain when you stand (orthostatic intolerance). It matters most when moving from microgravity to Mars or Earth gravity.',
  typicalRange: 'A drop of 20 mmHg or more in the top number, 10 mmHg or more in the bottom number, or a pulse rise of 30 bpm or more within 3 minutes of standing is a warning sign.',
  watchFor: 'Light-headedness, blurred or greying vision, nausea or feeling faint when you stand.',
  sourceId: 'orthostatic-consensus',
};

MEASUREMENT_GUIDES.heart_rate_standing = standingGuide;
MEASUREMENT_GUIDES.bp_systolic_standing = standingGuide;
MEASUREMENT_GUIDES.bp_diastolic_standing = standingGuide;
MEASUREMENT_GUIDES.fluid_intake = {
  text: 'Add up the water and drinks you had since the last check-in, in litres.',
  steps: [
    'Count each drink pouch or bottle you finished since your last check-in.',
    'Add them up in litres (1 litre = 1000 mL).',
    'Type the total. Include water used to rehydrate food only if you drank it.',
  ],
  whyInSpace: 'In low gravity you feel less thirsty, and fluid shifts toward the head. Low intake raises the risk of dehydration, headaches, kidney stones and feeling faint.',
  typicalRange: 'Sol Check uses 2 litres a day as a demo minimum. Your medical team sets your real target.',
  watchFor: 'Thirst, dark urine, headache, dizziness or tiredness.',
  sourceId: 'demo-method',
};
MEASUREMENT_GUIDES.exercise_minutes = {
  text: 'Log the minutes you actually exercised today (resistance, treadmill or cycle), not set-up time.',
  steps: [
    'Count only the time you were actually exercising, not setting up or cleaning the equipment.',
    'Add resistance training, treadmill and cycling together.',
    'Type the total minutes for today.',
  ],
  whyInSpace: 'Without regular loading, muscles shrink and bones lose density (about 1–1.5% a month in weight-bearing bones). Daily exercise is the main countermeasure.',
  typicalRange: 'ISS crews exercise about 2 hours a day. Sol Check uses 90 minutes as a demo target.',
  watchFor: 'Weakness, back pain, or feeling less steady on your feet. Logged minutes do not measure muscle or bone; that needs ultrasound, DXA or blood tests.',
  sourceId: 'nasa-exercise',
};

MEASUREMENT_GUIDES.respiratory_rate = {
  text: 'Measured by the camera from tiny changes in your pulse as you breathe. Or count breaths for 60 seconds.',
  steps: [
    'Tap "Measure breathing & HRV" and keep your face in the oval for about 45 seconds.',
    'Breathe normally through your nose. Do not slow down or speed up on purpose.',
    'No camera? Ask a crewmate to count how many times your chest rises in 60 seconds.',
  ],
  whyInSpace: 'A fast breathing rate at rest is an early sign of illness, high cabin CO2, anxiety or a lung problem. Fluid shifts in low gravity also change how you breathe.',
  typicalRange: 'Adults at rest usually breathe 12–20 times a minute.',
  watchFor: 'Breathing faster than usual at rest, feeling short of breath, or breathing faster on days the habitat CO2 is high.',
  sourceId: 'ppg-respiratory-fusion',
};
MEASUREMENT_GUIDES.hrv_rmssd = {
  text: 'Heart rate variability: how much the gap between heartbeats changes. Measured by the camera together with breathing rate.',
  steps: [
    'Use the same camera check as breathing rate (about 45 seconds, sitting still).',
    'Measure at the same time each day, before exercise or coffee, so readings compare fairly.',
    'Sol Check compares HRV only with your own usual, never with other people.',
  ],
  whyInSpace: 'HRV often drops with poor sleep, stress, illness or overtraining, sometimes before you feel it. It helps spot a tough few days early.',
  typicalRange: 'Varies by person. The prototype flags a drop below 70% of your own median.',
  watchFor: 'Several low readings in a row, especially together with poor sleep or low mood.',
  sourceId: 'hrv-norms',
};

MEASUREMENT_GUIDES.calorie_intake = {
  text: 'Add up the food energy you ate today. Every space-food package lists its calories (kcal).',
  steps: [
    'Look at the label of each food pouch, bar or drink you finished today.',
    'Add up the kcal numbers. Count only what you actually ate, not what you opened.',
    'Type the total. A rough number is fine; consistency matters more than precision.',
  ],
  whyInSpace: 'Months of the same menu (menu fatigue) and low appetite make crew eat less. Too few calories speeds up muscle and bone loss and weakens immunity, and there is no resupply.',
  typicalRange: 'Sol Check uses 2,000 kcal a day as a demo minimum. Your real target comes from your medical team (it depends on your size and exercise).',
  watchFor: 'Skipping meals, food tasting bland, losing weight, or feeling weak.',
  sourceId: 'iss-body-mass',
};
MEASUREMENT_GUIDES.body_mass = {
  text: 'Weigh yourself with the habitat body-mass device, at the same time each day.',
  steps: [
    'Measure before breakfast, after using the toilet, in the same clothing each time.',
    'In low gravity use the body-mass measuring device (a normal scale does not work in weightlessness).',
    'Type the reading in kilograms. Sol Check compares it with your own usual.',
  ],
  whyInSpace: 'Crew often lose 2–5% of body mass early in a mission because they eat less than they need. Losing weight without trying is an early sign that nutrition is falling behind.',
  typicalRange: 'Sol Check flags 3% below your usual, and 5% below it for the crew medical officer. These are demo values.',
  watchFor: 'Weight dropping several sols in a row, especially with poor appetite or low exercise.',
  sourceId: 'iss-body-mass',
};

export const ACTION_CARDS: Record<string, ActionCard> = {
  'record-and-monitor': {
    id: 'record-and-monitor',
    title: 'Keep a consistent record',
    tier: 'self_care',
    steps: [
      'Record each measurement you took and any symptoms you noticed.',
      'Use the same measurement method at your next scheduled check-in so the readings can be compared.',
    ],
    sourceRefs: ['nasa-monitoring', 'demo-method'],
    reviewStatus: 'sourced',
  },
  'recheck-entry': {
    id: 'recheck-entry',
    title: 'Check the reading and units',
    tier: 'self_care',
    steps: [
      'Compare the entry and its unit with the device display or your log.',
      'If you cannot verify the reading, leave it unmeasured or repeat it using your equipment instructions.',
    ],
    sourceRefs: ['demo-method', 'fda-glucose', 'aha-pressure'],
    reviewStatus: 'demo_heuristic',
  },
  'crew-review': {
    id: 'crew-review',
    title: 'Ask the Crew Medical Officer to review',
    tier: 'crew_medical_officer',
    steps: [
      'Share the check-in, relevant readings and any recorded symptoms with the Crew Medical Officer.',
      'If they request ground input, prepare a summary for the flight surgeon.',
    ],
    sourceRefs: ['nasa-monitoring', 'nasa-eimo'],
    reviewStatus: 'sourced',
  },
  'orthostatic-care': {
    id: 'orthostatic-care',
    title: 'Stand up slowly and get your stand test reviewed',
    tier: 'crew_medical_officer',
    steps: [
      'Sit or lie down if you feel light-headed. Rise slowly in stages.',
      'Show the seated and standing readings to the Crew Medical Officer.',
      'Repeat the stand test at your next check-in.',
    ],
    sourceRefs: ['orthostatic-consensus', 'shuttle-fluid-loading'],
    reviewStatus: 'needs_clinical_review',
  },
  'hydrate': {
    id: 'hydrate',
    kitItemIds: ['drink_pouches'],
    title: 'Drink more through the day',
    tier: 'self_care',
    steps: [
      'Keep a drink pouch within reach and sip regularly; thirst is weaker in low gravity.',
      'Log your fluid intake again at the next check-in.',
    ],
    sourceRefs: ['demo-method'],
    reviewStatus: 'demo_heuristic',
  },
  'exercise-plan': {
    id: 'exercise-plan',
    title: 'Get your exercise back on schedule',
    tier: 'self_care',
    steps: [
      'Plan today’s resistance and aerobic sessions into the timeline.',
      'If schedule or fatigue keeps blocking exercise, raise it with the Crew Medical Officer.',
    ],
    sourceRefs: ['nasa-exercise'],
    reviewStatus: 'sourced',
  },
  'motion-sickness-care': {
    id: 'motion-sickness-care',
    kitItemIds: ['sickness_bags'],
    title: 'Manage motion sickness symptoms',
    tier: 'self_care',
    steps: [
      'Keep your head still, fix your eyes on a stable reference and avoid fast head turns.',
      'Record any vomiting and tell the Crew Medical Officer.',
    ],
    sourceRefs: ['nasa-monitoring'],
    reviewStatus: 'needs_clinical_review',
  },
  'eye-check': {
    id: 'eye-check',
    title: 'Ask for an eye check',
    tier: 'crew_medical_officer',
    steps: [
      'Tell the Crew Medical Officer about the vision change and when it started.',
      'Eye changes from fluid shift (SANS) need eye imaging such as OCT or ultrasound to assess.',
    ],
    sourceRefs: ['sans-review'],
    reviewStatus: 'needs_clinical_review',
    kitItemIds: ['eye_chart'],
  },
  'breathing-recheck': {
    id: 'breathing-recheck',
    title: 'Rest and measure your breathing again',
    tier: 'self_care',
    steps: [
      'Sit quietly for 5 minutes, then repeat the camera check or count breaths for 60 seconds.',
      'If it is still outside 12–20 a minute, or you feel short of breath, tell your crew medical officer.',
      'If several crew breathe faster at once, ask life support to check cabin CO2.',
    ],
    sourceRefs: ['ppg-respiratory-fusion'],
    reviewStatus: 'demo_heuristic',
  },
  'recovery-day': {
    id: 'recovery-day',
    title: 'Plan an easier, well-rested day',
    tier: 'self_care',
    steps: [
      'Protect your next sleep period and keep a regular bedtime.',
      'Keep exercise light today if you feel run-down, and drink regularly.',
      'Measure HRV again tomorrow at the same time; tell your crew medical officer if it stays low for 3 days.',
    ],
    sourceRefs: ['hrv-norms'],
    reviewStatus: 'demo_heuristic',
  },
  'nutrition-plan': {
    id: 'nutrition-plan',
    kitItemIds: ['energy_bars', 'drink_pouches'],
    title: 'Eat enough, even when food feels boring',
    tier: 'self_care',
    steps: [
      'Add a snack between meals; high-energy food bars are in the supplies on board.',
      'Swap pouches with crewmates or add sauces and spices to fight menu fatigue.',
      'Log food energy and body mass daily for a week so the trend is clear.',
    ],
    sourceRefs: ['iss-body-mass'],
    reviewStatus: 'demo_heuristic',
  },
  'kidney-stone-care': {
    id: 'kidney-stone-care',
    kitItemIds: ['urine_strips', 'drink_pouches'],
    title: 'Ask the Crew Medical Officer to review these symptoms',
    tier: 'crew_medical_officer',
    steps: [
      'Tell the Crew Medical Officer about any side or lower-back pain or blood in urine.',
      'Share when the symptoms started and any recorded fluid intake.',
    ],
    sourceRefs: ['renal-stones-astronauts'],
    reviewStatus: 'demo_heuristic',
  },
  'behavioral-support': {
    id: 'behavioral-support',
    title: 'Talk to someone now',
    tier: 'crew_medical_officer',
    steps: [
      'Tell your crew medical officer or a crewmate you trust right now. You do not have to wait for Earth.',
      'Stay with a crewmate and take a break from critical tasks until you feel steadier.',
      'The Crew Medical Officer can decide whether to prepare a private draft for ground review.',
    ],
    sourceRefs: ['nasa-bmed-risk'],
    reviewStatus: 'demo_heuristic',
  },
  'protect-bones-kidneys': {
    id: 'protect-bones-kidneys',
    title: 'Review your exercise, fluid and food logs',
    tier: 'self_care',
    steps: [
      'Record your exercise, fluid intake and food intake at the next check-in.',
      'Share recurring gaps or difficulties keeping to your mission routine with the Crew Medical Officer.',
    ],
    sourceRefs: ['nasa-exercise', 'renal-stones-astronauts', 'iss-body-mass'],
    reviewStatus: 'demo_heuristic',
  },
  'co2-check': {
    id: 'co2-check',
    title: 'Check the habitat air',
    tier: 'self_care',
    steps: [
      'Report the headaches and the CO2 readings to the crew member responsible for life support.',
      'Spend time in better-ventilated areas until CO2 is back under the limit.',
    ],
    sourceRefs: ['nasa-co2-brief'],
    reviewStatus: 'sourced',
  },
};
