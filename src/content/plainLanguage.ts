/**
 * Plain-language layer. Sol Check must work for crew members with no medical
 * training ("Do not assume astronauts know everything"), so every technical
 * label has an everyday wording here. Keep sentences short (about grade 6
 * reading level), avoid jargon, and always say what to do next.
 */
import type { DomainStatus, EscalationTier, Finding, HealthDomain, MetricId } from '../contracts';

/** Everyday names for the six body areas. */
export const PLAIN_DOMAIN: Record<HealthDomain, string> = {
  cardiovascular: 'Heart & blood pressure',
  metabolic: 'Blood sugar',
  temperature: 'Body temperature',
  sleep: 'Sleep',
  behavioral: 'Mood',
  symptoms: 'How you feel',
};

/** What each status means, in one short sentence. */
export const PLAIN_STATUS: Record<DomainStatus, string> = {
  no_change_detected: 'Looks like your usual.',
  change_from_baseline: 'Different from your usual today.',
  sustained_trend: 'Has been changing for several days.',
  baseline_not_established: 'Not enough days yet to know your usual.',
  check_entry: 'This number looks unusual. Please check it.',
  not_measured: 'No reading today.',
};

/** Short hint shown under each check-in field. */
export const FIELD_HINTS: Record<MetricId, string> = {
  heart_rate: 'Beats per minute while sitting still.',
  bp_systolic: 'The top (bigger) number on the cuff screen.',
  bp_diastolic: 'The bottom (smaller) number on the cuff screen.',
  body_temp: 'From the thermometer, in °C.',
  blood_glucose: 'Sugar level from the finger-prick meter, in mg/dL.',
  sleep_duration: 'Hours you actually slept last night.',
  mood: 'How you feel right now: 1 = very low, 5 = very good.',
  heart_rate_standing: 'Your pulse after 3 minutes standing.',
  bp_systolic_standing: 'Top number after 3 minutes standing.',
  bp_diastolic_standing: 'Bottom number after 3 minutes standing.',
  fluid_intake: 'Water and drinks since your last check-in, in litres.',
  exercise_minutes: 'Minutes of actual exercise today (not set-up time).',
};

/** Field labels in everyday words (the technical name stays in brackets). */
export const PLAIN_FIELD_LABEL: Partial<Record<MetricId, string>> = {
  bp_systolic: 'Top number (systolic)',
  bp_diastolic: 'Bottom number (diastolic)',
  blood_glucose: 'Blood sugar (glucose)',
  heart_rate_standing: 'Standing pulse',
  bp_systolic_standing: 'Standing top number (systolic)',
  bp_diastolic_standing: 'Standing bottom number (diastolic)',
  fluid_intake: 'Water and drinks',
  exercise_minutes: 'Exercise today',
};

const METRIC_WORDS: Record<MetricId, string> = {
  heart_rate: 'heart rate',
  bp_systolic: 'blood pressure (top number)',
  bp_diastolic: 'blood pressure (bottom number)',
  body_temp: 'body temperature',
  blood_glucose: 'blood sugar',
  sleep_duration: 'sleep',
  mood: 'mood',
  heart_rate_standing: 'standing pulse',
  bp_systolic_standing: 'standing blood pressure (top number)',
  bp_diastolic_standing: 'standing blood pressure (bottom number)',
  fluid_intake: 'fluid intake',
  exercise_minutes: 'exercise',
};

function direction(summary: string): 'lower' | 'higher' | null {
  if (/\b(below|lower|decrease|down)\b/i.test(summary)) return 'lower';
  if (/\b(above|higher|increase|up)\b/i.test(summary)) return 'higher';
  return null;
}

/** One plain sentence explaining a finding, keyed on the engine's rule IDs. */
export function plainFinding(finding: Pick<Finding, 'ruleId' | 'summary' | 'baselineUsed'>): string {
  const metrics = finding.baselineUsed.map((baseline) => METRIC_WORDS[baseline.metric]);
  const what = metrics.length ? metrics.join(' and ') : 'this reading';
  const dir = direction(finding.summary);
  const way = dir === 'lower' ? 'lower than' : dir === 'higher' ? 'higher than' : 'different from';
  switch (finding.ruleId) {
    case 'combined-sleep-mood':
      return 'Your sleep and your mood have both been lower than usual for several days. Together, these are worth a chat with your crew medical officer.';
    case 'sustained-trend':
      return `Your ${what} has been ${way} your usual on most of the last 5 days.`;
    case 'baseline-change':
      return `Today your ${what} is ${way} your usual.`;
    case 'urgent-symptoms':
      return 'You reported a symptom that your crew medical officer should check today.';
    case 'reported-symptoms':
      return 'You reported how you feel. Keep an eye on it and note any changes.';
    case 'entry-quality':
      return 'One number you entered looks unusual. Please measure again and check it.';
    case 'archive-replay-context':
      return 'A solar storm hit Mars on nearby days (real NASA Curiosity rover data). It may or may not be related; the timing alone does not prove a cause.';
    case 'data-unavailable':
      return 'Some readings were not taken, so they could not be checked.';
    case 'orthostatic-check':
      return 'When you stood up, your blood pressure dropped or your pulse jumped more than it should. Show your crew medical officer, and stand up slowly.';
    case 'hydration-low':
      return 'You have been drinking less than 2 litres a day. Low gravity dulls thirst, so drink regularly.';
    case 'countermeasure-adherence':
      return 'You exercised less than the target on most of the last 5 days. Regular exercise is what protects your muscles and bones in low gravity.';
    case 'motion-sickness-pattern':
      return 'Your symptoms look like space motion sickness (dizziness, nausea or balance problems). It usually eases as your body adapts; tell your crew medical officer if you are vomiting.';
    case 'sans-screen':
      return 'You reported a vision change or a puffy, full-feeling head. Fluid shift can affect the eyes, so ask your crew medical officer for an eye check.';
    case 'co2-headache-context':
      return 'Your headaches came on days when the habitat air had more carbon dioxide than NASA’s limit. Report it to the life-support crew. CO2 may be part of the cause, but the timing alone does not prove it.';
    default:
      return finding.summary;
  }
}

/** What to do next, by recommended route. */
export const PLAIN_NEXT_STEP: Record<EscalationTier, { title: string; action: string }> = {
  self_care: {
    title: 'You can look after this yourself',
    action: 'Keep doing your daily check-in. Nothing needs a doctor right now.',
  },
  crew_medical_officer: {
    title: 'Talk to your crew medical officer today',
    action: 'Show them this page. They are the crew member trained to help with health questions.',
  },
  ground_flight_surgeon: {
    title: 'Ask your medical officer to contact Earth',
    action: 'They can send a summary to the doctors on Earth. A reply takes at least 40 minutes.',
  },
};

/** Glossary for the "Words explained" dialog. */
export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: 'Sol', meaning: 'One day on Mars. It is about 40 minutes longer than an Earth day.' },
  { term: 'Your usual (baseline)', meaning: 'The middle value of your own readings over the last 14 sols. Sol Check compares today with you, not with other people.' },
  { term: 'Change', meaning: 'Today’s reading is noticeably different from your usual.' },
  { term: 'Trend', meaning: 'A reading has moved the same way (up or down) on most of the last 5 sols.' },
  { term: 'Heart rate (bpm)', meaning: 'How many times your heart beats in one minute.' },
  { term: 'Blood pressure', meaning: 'Two numbers from the arm cuff. Top number (systolic) is the push when the heart beats; bottom number (diastolic) is between beats. Units: mmHg.' },
  { term: 'Blood sugar (glucose)', meaning: 'How much sugar is in your blood, from a finger-prick meter. Units: mg/dL.' },
  { term: 'Symptom', meaning: 'Something you feel, such as a headache, dizziness or tiredness.' },
  { term: 'Crew medical officer (CMO)', meaning: 'The crew member trained to handle health questions on the mission.' },
  { term: 'Flight surgeon', meaning: 'A doctor on Earth who supports the crew. Messages take about 20 minutes each way.' },
  { term: 'Signal quality', meaning: 'How clear the camera’s view of your pulse is. Good light and holding still make it better.' },
  { term: 'Synthetic', meaning: 'Made-up demo data used to show how the app works. It is not a real person.' },
  { term: 'NASA archive', meaning: 'Real measurements from NASA missions, such as the Curiosity rover on Mars.' },
  { term: 'Radiation (µGy/h)', meaning: 'Energy from space that passes through the body. µGy/h measures how much per hour.' },
  { term: 'PVT', meaning: 'A short reaction-time game that shows how alert or tired you are.' },
  { term: 'Orthostatic intolerance', meaning: 'Feeling faint or dizzy when you stand up, because blood pressure does not adjust fast enough. Common after time in low gravity.' },
  { term: 'Stand-up test', meaning: 'Blood pressure and pulse sitting, then again after 3 minutes standing, to check for orthostatic intolerance.' },
  { term: 'SANS', meaning: 'Spaceflight-associated neuro-ocular syndrome: eye and vision changes linked to fluids shifting toward the head. Needs eye imaging to assess.' },
  { term: 'Space motion sickness', meaning: 'Dizziness, nausea and balance problems while the inner ear adapts to a new gravity level.' },
  { term: 'CO2 (mmHg)', meaning: 'Carbon dioxide in the habitat air. NASA keeps the 1-hour average at or below 3 mmHg because higher levels cause headaches and tiredness.' },
  { term: 'Countermeasure', meaning: 'Something you do to protect your body in space, such as daily exercise against muscle and bone loss.' },
];
