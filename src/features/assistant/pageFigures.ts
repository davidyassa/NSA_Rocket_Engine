/**
 * What the numbers on each tab mean, in as few words as possible: the unit, what is
 * normal, and which value matters. Thresholds come from the app's own rules
 * (engine/rules.ts, the radiation engine, the vigilance test). Pure data + lookup (tested).
 */
import { guideFor } from './pageGuides';

export interface PageFigure {
  name: string;
  /** words people use for it */
  pattern: RegExp;
  /** one short sentence: unit, normal range, what matters */
  means: string;
}

const HEART = { name: 'Heart rate', pattern: /\b(?:heart ?rate|pulse|bpm)\b/i, means: 'Beats per minute at rest. Sol Check compares it with your usual, the middle of your last 14 sols.' };
const BP = { name: 'Blood pressure', pattern: /\b(?:blood pressure|bp|systolic|diastolic|mmhg)\b/i, means: 'Top over bottom number, in mmHg. Standing up, a drop of 20 top or 10 bottom is flagged.' };
const HRV = { name: 'HRV', pattern: /\b(?:hrv|heart rate variability)\b/i, means: 'Beat-to-beat variation, in milliseconds. Higher is better rested. Flagged below 70% of your usual.' };
const BREATHING = { name: 'Breathing rate', pattern: /\b(?:breathing|respiratory) rate|\bbreaths?\b/i, means: 'Breaths per minute. Normal at rest is 12 to 20.' };
const BASELINE = { name: 'Your usual', pattern: /\b(?:usual|baseline|median|shaded (?:band|range)|normal range)\b/i, means: 'The middle of your last 14 sols of readings. It needs at least 5 readings.' };

export const PAGE_FIGURES: Record<string, PageFigure[]> = {
  '/': [
    { name: 'Radiation status', pattern: /\b(?:radiation (?:status|colou?r|level)|green|yellow|orange|red)\b/i, means: 'Green: safe. Yellow: elevated or recovering. Orange: solar particle event. Red: storm, go to the shelter.' },
    HEART, BP, HRV, BREATHING,
    { name: 'Daily checklist', pattern: /\b(?:checklist|routine|ticks?)\b/i, means: 'Today’s measurements. Items from your saved check-in tick themselves.' },
  ],
  '/hazards/radiation': [
    { name: 'Dose rate', pattern: /\b(?:dose rate|msv ?\/ ?h|msv per hour|rate)\b/i, means: 'Radiation right now, in millisieverts per hour. Up to 0.15 is safe; over 2.1 is an acute breach.' },
    { name: 'Projected daily dose', pattern: /\b(?:projected|daily dose|per day|msv ?\/ ?d)\b/i, means: 'Today’s total if the current rate holds, in millisieverts.' },
    { name: '30-day dose', pattern: /\b(?:30[- ]?day|thirty[- ]day|rolling|30d|105|250)\b/i, means: 'Dose over the last 30 days. NASA limit 250 millisieverts; 105 is the safe-cap line.' },
    { name: 'Career dose', pattern: /\b(?:career|lifetime|600|car)\b/i, means: 'Lifetime total, before plus during the mission. NASA limit 600 millisieverts.' },
    { name: 'Remaining budget', pattern: /\b(?:remaining|budget|left)\b/i, means: 'Dose still allowed before the 30-day or career limit.' },
    { name: 'Restricted room', pattern: /\b(?:restricted|lock ?down|locked)\b/i, means: 'Over 2.1 per hour, or an 8-hour shift would use over 5% of your 30-day or 2% of your career budget.' },
    { name: 'All-clear', pattern: /\b(?:all[- ]clear|leave the shelter|six hours|6 hours)\b/i, means: 'Every room at or below 0.15 per hour for 6 hours in a row.' },
    { name: 'Shelter muster', pattern: /\b(?:muster|accounted|4 ?\/ ?4|beacon)\b/i, means: 'All crew inside the shelter within 5 minutes of the alarm.' },
    { name: 'Transit dose', pattern: /\b(?:transit|route|evacuation)\b/i, means: 'Dose picked up on the way to the shelter.' },
    { name: 'Lymphocyte assay', pattern: /\b(?:assay|lymphocytes?|finger[- ]prick|recovery %|96|88)\b/i, means: 'Blood-cell count against your baseline. 96% means nominal recovery.' },
  ],
  '/cognitive': [
    { name: 'Mean reaction time', pattern: /\b(?:mean|reaction time|rt|ms|milliseconds?)\b/i, means: 'Average tap speed. Under 300 ms is sharp, up to 500 is normal, over 500 is slowed.' },
    { name: 'Attention lapses', pattern: /\blapses?\b/i, means: 'Taps of 500 ms or slower, or missed (355 ms in timed mode). Zero is best.' },
    { name: 'False starts', pattern: /\b(?:false starts?|early|too soon)\b/i, means: 'Taps before the signal. Many means you are rushing.' },
  ],
  '/check-in': [
    HEART, BP, BREATHING,
    { name: 'Temperature', pattern: /\b(?:temperature|temp|fever)\b/i, means: 'Body temperature in degrees Celsius, compared with your usual.' },
    { name: 'Fluid', pattern: /\b(?:fluid|water|drink|litres?|liters?)\b/i, means: 'Litres drunk today. Target 2.' },
    { name: 'Exercise', pattern: /\b(?:exercise|workout|minutes)\b/i, means: 'Minutes today. Target 90.' },
    { name: 'Calories', pattern: /\b(?:calories|kcal|food|energy)\b/i, means: 'Energy eaten today. Below 2000 kilocalories is flagged.' },
    { name: 'Body mass', pattern: /\b(?:body mass|weight|kg)\b/i, means: 'A 3% drop is flagged; 5% goes to the medical officer.' },
    { name: 'Mood', pattern: /\bmood\b/i, means: '1 to 5, from low to good, compared with your usual.' },
  ],
  '/assessment': [
    { name: 'Next step', pattern: /\b(?:next step|tier|who should|escalat\w*)\b/i, means: 'Self-care, talk to the medical officer today, or flight surgeon review on Earth.' },
    { name: 'Finding', pattern: /\b(?:finding|flag(?:ged)?|warning)\b/i, means: 'A reading away from your usual. Open it to see the reading, your usual and the rule.' },
    { name: 'Trend', pattern: /\btrend\b/i, means: 'A reading moving one way over your last 5 sols, needing at least 3 readings.' },
    BASELINE,
  ],
  '/trends': [
    { name: 'Line', pattern: /\b(?:line|points?|dots?)\b/i, means: 'Your reading on each sol.' },
    { name: 'Dashed line', pattern: /\b(?:dashed|dotted|baseline line|band|range)\b/i, means: 'Your personal baseline: the middle of your last 14 sols. Points far from it are flagged.' },
    { name: 'Markers', pattern: /\b(?:diamonds?|circles?|markers?)\b/i, means: 'Circles are recorded readings; diamonds are readings you entered by hand.' },
    BASELINE,
  ],
  '/timeline': [
    { name: 'CO2', pattern: /\b(?:co2|co₂|carbon dioxide|mmhg)\b/i, means: 'Cabin carbon dioxide in mmHg. NASA 1-hour limit 3; 2.5 and up is elevated.' },
    { name: 'Absorbed dose rate', pattern: /\b(?:dose|µgy|ugy|microgray|curiosity|rad)\b/i, means: 'Real Curiosity rover readings, in microgray per hour. The Sol 41 spike is the September 2017 solar storm.' },
    { name: 'Cabin temperature', pattern: /\b(?:cabin )?temperature\b/i, means: 'Habitat air temperature in degrees Celsius.' },
  ],
  '/hazards/distance': [
    { name: 'One-way delay', pattern: /\b(?:delay|minutes?|one[- ]way|round[- ]trip)\b/i, means: 'Minutes for a message to reach Earth. A reply takes twice that, so the crew acts first.' },
  ],
  '/hazards/isolation': [
    { name: 'Mood', pattern: /\bmood\b/i, means: '1 to 5, from low to good, against your personal baseline.' },
    { name: 'Sleep', pattern: /\bsleep|hours\b/i, means: 'Hours slept, against your personal baseline.' },
    { name: 'Reaction time', pattern: /\b(?:reaction|vigilance|ms)\b/i, means: 'From the Cognitive lab: slower than your usual can mean fatigue.' },
    BASELINE,
  ],
  '/cmo': [
    { name: 'Supplies status', pattern: /\b(?:supplies|expired|low|expir\w*|stock)\b/i, means: 'Expired first, then low stock, then expiring soon.' },
    { name: 'Data quality', pattern: /\b(?:data quality|quality|usable|missing)\b/i, means: 'Which readings are usable, missing or out of range, so findings can be trusted.' },
    { name: 'Sign-off', pattern: /\b(?:sign[- ]?off|signed)\b/i, means: 'The medical officer has reviewed today’s findings.' },
  ],
};

/** "explain the numbers on this page", "what do these figures mean" */
export const ALL_FIGURES = /\b(?:(?:numbers?|figures?|values?|stats|metrics|readings?|data) (?:on|in) (?:this|the) (?:page|tab|screen)|(?:explain|what (?:do|are)|tell me) (?:these|the|all the|those) (?:numbers|figures|values|stats|metrics)|what do (?:these|the|those) (?:numbers|figures|values) mean)\b/i;

/** A question about a value: "what does the 30-day dose mean", "is 2.3 high", "what is HRV here". */
const ASKS_MEANING = /\b(?:what(?:'s| is| are| does| do)|meaning|mean|means|explain|define|significan\w*|stand for|important|is (?:it|that|this) (?:good|bad|ok|okay|safe|high|low|normal))\b/i;

/** The figure the question is about, on the given page (or null). */
export function figureFor(question: string, page: string): PageFigure | null {
  if (!ASKS_MEANING.test(question)) return null;
  const figures = PAGE_FIGURES[guideFor(page).route] ?? [];
  return figures.find((figure) => figure.pattern.test(question)) ?? null;
}

/** All the figures on a page, shortest useful form. */
export function describeFigures(page: string): { text: string; speech: string; figures: PageFigure[] } | null {
  const guide = guideFor(page);
  const figures = PAGE_FIGURES[guide.route];
  if (!figures?.length) return null;
  const name = guide.name.replace(/^the /, '');
  const Name = `${name[0].toUpperCase()}${name.slice(1)}`;
  const [first, ...rest] = figures;
  return {
    text: `${Name}: ${figures.map((f) => `${f.name}: ${f.means}`).join(' ')}`,
    // Spoken: the first figure in full, then the names of the rest. All meanings are on screen.
    speech: `${first.name}: ${first.means}${rest.length ? ` Also on this tab: ${rest.map((f) => f.name.toLowerCase()).join(', ')}. Ask about any of them.` : ''}`,
    figures,
  };
}
