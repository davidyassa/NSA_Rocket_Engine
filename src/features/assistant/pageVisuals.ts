/**
 * How to read the charts, maps and models on each tab. Sol gives the quick sense first;
 * each "next" adds one more detail. Written from the components themselves (legends,
 * scales, thresholds), so every detail matches the screen. Pure data + lookup (tested).
 */
import { guideFor } from './pageGuides';

export interface PageVisual {
  name: string;
  /** words people use for it */
  pattern: RegExp;
  /** first: the quick sense; then one detail per "next" */
  parts: string[];
}

export const PAGE_VISUALS: Record<string, PageVisual[]> = {
  '/': [
    { name: 'Crew digital twin', pattern: /\b(?:digital twin|twin|astronaut|body|figure|model|3d)\b/i, parts: [
      'The astronaut figure shows today’s check-in on six body areas. Each area’s colour is its status.',
      'Head: mind and mood. Visor: sleep. Chest: heart and blood pressure. Torso: core temperature. Abdomen: blood glucose. Limbs: reported symptoms.',
      'Green: like your usual. Yellow: different today. Orange: changing for several days. Purple: a number to check. Grey: no reading, or not enough days yet.',
      'Tap an area to open its trend.',
    ] },
    { name: 'Radiation card', pattern: /\bradiation (?:card|status|panel|banner)\b/i, parts: [
      'The radiation card shows the habitat’s radiation state right now.',
      'Green: safe. Yellow: elevated or recovering. Orange: solar particle event. Red: storm, go to the shelter.',
    ] },
    { name: 'Recent readings', pattern: /\b(?:recent readings|bar chart|bars?)\b/i, parts: [
      'Recent readings: one bar per sol for the reading you choose.',
      'Pick the reading in the menu. The arrow opens its full trend.',
    ] },
  ],
  '/hazards/radiation': [
    { name: '3D station map', pattern: /\b(?:map|3d|station|model|compartments?|rooms?|habitat)\b/i, parts: [
      'The 3D map shows the habitat’s six compartments with their radiation, temperature and CO2.',
      'Select a compartment, or ask me to, to see its dose rate in millisieverts per hour and today’s projection.',
      'Up to 0.15 per hour is safe. Over 2.1 is an acute breach, and the room becomes restricted.',
      'In a storm, the central storm shelter is the best-shielded room. The evacuation route shows the dose picked up on the way.',
    ] },
    { name: 'Career dose bar', pattern: /\b(?:career|lifetime)\b/i, parts: [
      'The career bar fills toward NASA’s lifetime limit of 600 millisieverts.',
      'Its marks at 150, 300 and 450 are a quarter, half and three quarters of the limit.',
    ] },
    { name: '30-day dose bar', pattern: /\b(?:30[- ]?day|thirty[- ]day|monthly|rolling)\b/i, parts: [
      'The 30-day bar fills toward the 250 millisievert limit for any 30 days.',
      'The 105 mark is the safe cap; 250 is the breach line.',
    ] },
  ],
  '/timeline': [
    { name: 'Crew readings', pattern: /\b(?:crew readings|sleep|mood)\b/i, parts: [
      'Crew readings: your sleep and mood on each sol.',
      'Solid line: sleep in hours, left scale. Dashed line: mood from 1 to 5, right scale.',
      'Each marker is one check-in. Hollow markers are values you entered. Gaps are sols with no reading.',
    ] },
    { name: 'Mission events', pattern: /\b(?:mission )?events?\b/i, parts: [
      'Mission events: what happened on each sol, lined up with your readings above.',
    ] },
    { name: 'Habitat air', pattern: /\b(?:habitat air|co2|co₂|carbon dioxide|air)\b/i, parts: [
      'Habitat air: cabin CO2 on each sol, in mmHg.',
      'The dotted line is NASA’s 1-hour limit of 3. Values above the chart are drawn at its top edge.',
    ] },
    { name: 'Curiosity radiation', pattern: /\b(?:curiosity|rover|rad|archive|radiation)\b/i, parts: [
      'Curiosity radiation: real readings from NASA’s rover on Mars, as hourly medians in microgray per hour.',
      'The Sol 41 spike is the real September 2017 solar storm. Gaps are hours with no data.',
    ] },
  ],
  '/trends': [
    { name: 'Trend chart', pattern: /\b(?:trend|chart|graph|line|plot)\b/i, parts: [
      'The trend chart shows one reading across recent sols.',
      'Solid line: your readings. Dashed line: your personal baseline, the middle of your last 14 sols.',
      'Circles are recorded readings; diamonds are readings you entered by hand.',
      'Points far from the dashed line are what Sol Check flags. Tap a point for its value and baseline.',
    ] },
  ],
  '/cognitive': [
    { name: 'Result cards', pattern: /\b(?:results?|cards?|scores?)\b/i, parts: [
      'The result cards show your last vigilance test.',
      'Mean reaction time: under 300 ms is sharp, over 500 is slowed. Lapses: slow or missed taps; zero is best. Early responses: taps before the signal.',
    ] },
  ],
};

/** "explain this chart", "what am I looking at", "how do I read the map" */
export const ASKS_VISUAL = /\b(?:what am i looking at|what (?:is|does) (?:this|the) (?:chart|graph|plot|map|model|visual\w*) (?:show|mean)|(?:explain|describe|walk me through|how (?:do i|to) read|tell me about)\s+(?:this|the|these|those|all the)?\s*.*\b(?:charts?|graphs?|plots?|visuali[sz]ations?|visuals?|maps?|models?|diagrams?|twin|bars?|lanes?))\b/i;

/** The explanation to give: one visual by name, or all of the tab's visuals in order. */
export function visualTour(question: string, page: string): { parts: string[] } | null {
  const guide = guideFor(page);
  const visuals = PAGE_VISUALS[guide.route];
  if (!visuals?.length) return null;
  const named = visuals.length > 1 ? visuals.find((v) => v.pattern.test(question)) : visuals[0];
  if (named) return { parts: named.parts };
  // Several visuals, none named: the quick sense of the whole tab first, then each one.
  const name = guide.name.replace(/^the /, '');
  const overview = `${name[0].toUpperCase()}${name.slice(1)} has ${visuals.length === 2 ? 'two' : visuals.length === 3 ? 'three' : visuals.length === 4 ? 'four' : visuals.length} visuals: ${visuals.map((v) => v.name.toLowerCase()).join(', ')}.`;
  return { parts: [overview, ...visuals.flatMap((v) => v.parts)] };
}
