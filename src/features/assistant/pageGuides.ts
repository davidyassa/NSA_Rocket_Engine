/**
 * What each tab is for, in plain words, so Sol can say "you're on …, here's how to use it"
 * and walk the crew member through the app. Pure data + lookup (tested).
 */
export interface PageGuide {
  route: string;
  name: string;
  /** spoken words people use for this tab ("open the timeline") */
  aliases: string[];
  what: string;
  how: string;
  /** a question Sol suggests asking on this tab */
  tryAsking: string;
}

export const PAGE_GUIDES: PageGuide[] = [
  { route: '/', name: 'the Dashboard', aliases: ['dashboard', 'home', 'main page', 'start'],
    what: 'Your mission at a glance: today’s health status, the crew digital twin, the daily checklist, radiation and habitat air.',
    how: 'Start your day here. Tap a body area on the astronaut to open that reading, or press Start check-in.',
    tryAsking: 'How am I doing today?' },
  { route: '/hazards/radiation', name: 'the Radiation monitor', aliases: ['radiation', 'radiation monitor', 'dose'],
    what: 'Simulated radiation dose for the crew against NASA-STD-3001 limits, with shelter guidance during a solar storm.',
    how: 'Check today’s rate and your 30-day total. If a storm warning appears, follow the shelter instructions on the page.',
    tryAsking: 'What happened on Sol 41?' },
  { route: '/check-in', name: 'the Sol check-in', aliases: ['check in', 'checkin', 'check-in', 'daily check'],
    what: 'Your daily health check-in, one question per page: heart rate, breathing, blood pressure, temperature, sleep, mood, food and symptoms.',
    how: 'Answer each page and press Next. You can let the camera measure your pulse and breathing. Skip anything you did not measure, then save on the last page.',
    tryAsking: 'How do I measure blood pressure?' },
  { route: '/cognitive', name: 'the Cognitive lab', aliases: ['cognitive', 'cognitive lab', 'reaction test', 'vigilance', 'pvt'],
    what: 'A short reaction-time game that shows how alert or tired you are.',
    how: 'Press start, then tap as soon as the signal appears. Do it at about the same time each day so results compare fairly.',
    tryAsking: 'What is PVT?' },
  { route: '/hazards', name: 'the Hazards page', aliases: ['hazards', 'hazard', 'five hazards', 'risks'],
    what: 'NASA’s five hazards of human spaceflight: radiation, isolation, distance from Earth, altered gravity and hostile environments.',
    how: 'Open a hazard to see what it does to the body, what Sol Check tracks, and what still needs flight hardware.',
    tryAsking: 'What is SANS?' },
  { route: '/hazards/isolation', name: 'the Isolation and confinement page', aliases: ['isolation', 'confinement'],
    what: 'How living in a small, closed habitat affects sleep, mood and alertness, with a countermeasure plan.',
    how: 'Compare your sleep, mood and reaction time, choose countermeasures, then check again on a later sol.',
    tryAsking: 'Why does isolation affect mood?' },
  { route: '/hazards/distance', name: 'the Distance from Earth page', aliases: ['distance', 'distance from earth', 'communication delay'],
    what: 'Why being far from Earth changes medical care: the 20-minute delay, the escalation ladder and what the onboard crew must handle.',
    how: 'Read the escalation ladder: you first, then the crew medical officer, then doctors on Earth.',
    tryAsking: 'Why is there a delay talking to Earth?' },
  { route: '/assessment', name: 'the Assessment', aliases: ['assessment', 'results', 'findings', 'my results'],
    what: 'The result of your latest check-in: what changed compared with your own usual, and who should look at it.',
    how: 'Read the plain summary at the top. Open a finding to see the readings, your baseline and the rule behind it. The suggested actions and the ground handoff are further down.',
    tryAsking: 'Why is my sleep flagged?' },
  { route: '/cmo', name: 'the CMO console', aliases: ['cmo', 'medical officer', 'cmo console', 'crew medical officer'],
    what: 'The crew medical officer’s desk: findings to review, sign-off, follow-up tasks, supplies on board and data quality.',
    how: 'Work through the tabs from left to right: triage, actions, supplies, data quality, then telemetry.',
    tryAsking: 'What does the crew medical officer do?' },
  { route: '/trends', name: 'Trends', aliases: ['trends', 'charts', 'graphs', 'history'],
    what: 'Charts of your readings over the last sols against your personal baseline.',
    how: 'Pick a reading to see its line. Points far from the shaded usual range are the ones Sol Check notices.',
    tryAsking: 'What is my usual?' },
  { route: '/timeline', name: 'the Timeline', aliases: ['timeline', 'mission timeline'],
    what: 'One mission clock with your sleep and mood, mission events, habitat air and real NASA Curiosity radiation data.',
    how: 'Press Play, or pick a sol. Sol 41 is the real September 2017 solar storm.',
    tryAsking: 'Why does CO2 cause headaches?' },
  { route: '/assistant', name: 'Ask Sol', aliases: ['ask sol', 'assistant', 'chat'],
    what: 'Talk or type to me about your health, the mission and the NASA research behind Sol Check.',
    how: 'Tap Talk to Sol and speak, or type instead. You can turn on “Hey Sol” to call me from any tab.',
    tryAsking: 'Start a mood check' },
  { route: '/demo', name: 'Demo and data', aliases: ['demo', 'data', 'demo and data', 'real data'],
    what: 'Demo scenarios, Sol Check tested on real Inspiration4 astronaut blood data, record export and the NASA radiation archive.',
    how: 'Load a scenario to try it, or scroll to “Tested on real astronaut data” for the evidence.',
    tryAsking: 'Tell me about the Inspiration4 data' },
];

/** The tour order: the main tabs, in the order a crew member uses them. */
export const TOUR_ROUTES = ['/', '/check-in', '/assessment', '/cmo', '/timeline', '/hazards', '/hazards/radiation', '/cognitive', '/trends', '/demo', '/assistant'];

export function guideFor(pathname: string): PageGuide {
  const exact = PAGE_GUIDES.find((g) => g.route === pathname);
  if (exact) return exact;
  const prefix = PAGE_GUIDES.filter((g) => g.route !== '/' && pathname.startsWith(g.route)).sort((a, b) => b.route.length - a.route.length)[0];
  return prefix ?? PAGE_GUIDES[0];
}

/** "open the timeline", "go to CMO" → route, or null. */
export function routeFromSpeech(text: string): PageGuide | null {
  const lower = text.toLowerCase();
  if (/^(?:what|why|when|where|which|who|how|is|are|does|did)\b/.test(lower.trim())) return null;
  if (!/\b(open|go to|take me to|show( me)?|switch to|navigate to)\b/.test(lower)) return null;
  const matches = PAGE_GUIDES.flatMap((g) => g.aliases.map((alias) => ({ g, alias })))
    .filter(({ alias }) => new RegExp(`\\b${alias.replace(/[-]/g, '[- ]?')}\\b`).test(lower))
    .sort((a, b) => b.alias.length - a.alias.length);
  return matches[0]?.g ?? null;
}

export function describePage(guide: PageGuide): string {
  return `You’re on ${guide.name}. ${guide.what} ${guide.how} You could ask me: “${guide.tryAsking}”`;
}
