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

const bloodPressureGuide = {
  text: 'Sit quietly before measuring. Use an upper-arm cuff on bare skin with your arm supported at heart level. Enter both numbers from the same reading.',
  sourceId: 'aha-pressure',
};

export const MEASUREMENT_GUIDES: Record<MetricId, { text: string; sourceId: string }> = {
  heart_rate: {
    text: 'Measure after resting. For a manual reading, feel your wrist pulse with two fingers and count the beats for one minute.',
    sourceId: 'medline-pulse',
  },
  bp_systolic: bloodPressureGuide,
  bp_diastolic: bloodPressureGuide,
  body_temp: {
    text: 'Follow the thermometer instructions. Use the same measurement site each time when possible and enter the reading in °C.',
    sourceId: 'medline-temperature',
  },
  blood_glucose: {
    text: 'Follow the glucose meter and test strip instructions. Check that the display is in mg/dL before entering the result.',
    sourceId: 'fda-glucose',
  },
  sleep_duration: {
    text: 'Estimate the hours actually spent asleep during your last sleep period. Leave time spent awake out of the total.',
    sourceId: 'nih-sleep',
  },
  mood: {
    text: 'Choose the number closest to how you feel right now. Use 1 for very low and 5 for very positive.',
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
