import type { ActionCard, MetricId, SourceRecord } from '../contracts';
import { RADLAB_SOURCE } from '../data/nasa';

const retrievedOn = '2026-11-12';

export const SOURCES: Record<string, SourceRecord> = {
  [RADLAB_SOURCE.id]: RADLAB_SOURCE,
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
  typicalRange: 'Adults on Earth: under 120/80 mmHg is classed as normal; 130/80 mmHg or higher is classed as high.',
  watchFor: 'Light-headedness when moving upright, headache, blurred vision, or a reading far from your usual values.',
  sourceId: 'aha-pressure',
};

export const MEASUREMENT_GUIDES: Record<MetricId, MeasurementGuide> = {
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
};
