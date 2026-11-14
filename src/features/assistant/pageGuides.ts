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

/** Spoken: the tab's name and how to use it (what it is for stays on screen). */
export function speakPage(guide: PageGuide): string {
  const name = guide.name.replace(/^the /, '');
  return `${name[0].toUpperCase()}${name.slice(1)}. ${guide.how}`;
}

/** What a tab is for and how to use it, in two short parts. */
export function describePage(guide: PageGuide, here = true): string {
  const name = guide.name.replace(/^the /, '');
  return here
    ? `You’re on ${guide.name}. ${guide.what} How to use it: ${guide.how}`
    : `${name[0].toUpperCase()}${name.slice(1)}: ${guide.what} How to use it: ${guide.how}`;
}

/** Subpages, categories, modes or tabs of a page that Sol Computer use can navigate to. */
export interface SubpageGuide {
  route: string;
  name: string;
  parentName: string;
  parentRoute: string;
  aliases: string[];
}

export const SUBPAGE_GUIDES: SubpageGuide[] = [
  // Trends categories
  {
    route: '/trends?category=cardiovascular&metric=heart_rate',
    name: 'Cardiovascular trends',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'cardiovascular trends on the trends page',
      'cardiovascular trends on trends',
      'cardiovascular trends on the trends',
      'cardiovascular on the trends page',
      'cardiovascular on trends',
      'cardiovascular category on the trends page',
      'cardiovascular category on trends',
      'cardiovascular category',
      'cardiovascular trends',
      'cardiovascular trend',
      'cardiovascular',
      'cardio trends on the trends page',
      'cardio trends on trends',
      'cardio trends',
      'cardio',
      'my cardio',
      'my cardiovascular',
      'my cardio trends',
      'heart trends on the trends page',
      'heart trends on trends',
      'heart trends',
      'heart trend',
    ],
  },
  {
    route: '/trends?category=metabolic&metric=blood_glucose',
    name: 'Metabolic & physical trends',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'metabolic and physical trends on the trends page',
      'metabolic & physical trends on the trends page',
      'metabolic and physical trends on trends',
      'metabolic & physical trends on trends',
      'metabolic trends on the trends page',
      'metabolic trends on trends',
      'metabolic on the trends page',
      'metabolic on trends',
      'metabolic and physical trends',
      'metabolic & physical trends',
      'metabolic category on the trends page',
      'metabolic category on trends',
      'metabolic category',
      'metabolic trends',
      'metabolic trend',
      'metabolic',
      'physical trends on the trends page',
      'physical trends on trends',
      'physical trends',
      'physical trend',
    ],
  },
  {
    route: '/trends?category=wellbeing&metric=sleep_duration',
    name: 'Sleep & wellbeing trends',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'sleep and wellbeing trends on the trends page',
      'sleep & wellbeing trends on the trends page',
      'sleep and wellbeing trends on trends',
      'sleep & wellbeing trends on trends',
      'sleep and wellbeing on the trends page',
      'sleep and wellbeing on trends',
      'sleep and wellbeing trends',
      'sleep & wellbeing trends',
      'sleep trends on the trends page',
      'sleep trends on trends',
      'sleep trends',
      'sleep trend',
      'sleep',
      'my sleep',
      'my sleep trends',
      'sleep category on the trends page',
      'sleep category on trends',
      'sleep category',
      'wellbeing trends on the trends page',
      'wellbeing trends on trends',
      'wellbeing on the trends page',
      'wellbeing on trends',
      'wellbeing category on the trends page',
      'wellbeing category on trends',
      'wellbeing category',
      'wellbeing trends',
      'well-being trends',
      'wellbeing trend',
      'wellbeing',
    ],
  },
  // Trends individual indicators
  {
    route: '/trends?metric=heart_rate',
    name: 'Heart rate trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'heart rate trend on the trends page',
      'heart rate trend on trends',
      'heart rate on the trends page',
      'heart rate on trends',
      'pulse trend on the trends page',
      'pulse trend on trends',
      'pulse on the trends page',
      'pulse on trends',
      'resting pulse trend on the trends page',
      'resting pulse trend on trends',
      'heart rate trend',
      'resting pulse trend',
      'pulse trend',
    ],
  },
  {
    route: '/trends?metric=bp_systolic',
    name: 'Blood pressure trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'blood pressure trend on the trends page',
      'blood pressure trend on trends',
      'blood pressure on the trends page',
      'blood pressure on trends',
      'systolic blood pressure trend on the trends page',
      'systolic blood pressure trend on trends',
      'systolic on the trends page',
      'systolic on trends',
      'blood pressure trend',
      'systolic blood pressure trend',
      'systolic trend',
    ],
  },
  {
    route: '/trends?metric=bp_diastolic',
    name: 'Diastolic blood pressure trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'diastolic blood pressure trend on the trends page',
      'diastolic blood pressure trend on trends',
      'diastolic on the trends page',
      'diastolic on trends',
      'diastolic blood pressure trend',
      'diastolic trend',
    ],
  },
  {
    route: '/trends?metric=hrv_rmssd',
    name: 'Heart rate variability trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'heart rate variability trend on the trends page',
      'heart rate variability trend on trends',
      'hrv trend on the trends page',
      'hrv trend on trends',
      'hrv on the trends page',
      'hrv on trends',
      'heart rate variability trend',
      'hrv trend',
      'rmssd trend',
    ],
  },
  {
    route: '/trends?metric=sleep_duration',
    name: 'Sleep duration trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'sleep duration trend on the trends page',
      'sleep duration trend on trends',
      'sleep trend on the trends page',
      'sleep trend on trends',
      'sleep on the trends page',
      'sleep on trends',
      'sleep duration trend',
      'sleep trend',
    ],
  },
  {
    route: '/trends?metric=mood',
    name: 'Mood trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'mood trend on the trends page',
      'mood trend on trends',
      'mood on the trends page',
      'mood on trends',
      'mood trend',
    ],
  },
  {
    route: '/trends?metric=blood_glucose',
    name: 'Blood glucose trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'blood glucose trend on the trends page',
      'blood glucose trend on trends',
      'blood sugar trend on the trends page',
      'blood sugar trend on trends',
      'glucose on the trends page',
      'glucose on trends',
      'blood glucose trend',
      'blood sugar trend',
      'glucose trend',
    ],
  },
  {
    route: '/trends?metric=body_temp',
    name: 'Body temperature trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'body temperature trend on the trends page',
      'body temperature trend on trends',
      'temperature trend on the trends page',
      'temperature trend on trends',
      'temp on the trends page',
      'temp on trends',
      'body temperature trend',
      'temperature trend',
      'temp trend',
    ],
  },
  {
    route: '/trends?metric=body_mass',
    name: 'Body mass trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'body mass trend on the trends page',
      'body mass trend on trends',
      'weight trend on the trends page',
      'weight trend on trends',
      'body mass on the trends page',
      'weight on the trends page',
      'body mass trend',
      'weight trend',
    ],
  },
  {
    route: '/trends?metric=food_energy',
    name: 'Food energy trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'food energy trend on the trends page',
      'food energy trend on trends',
      'nutrition trend on the trends page',
      'calorie trend on the trends page',
      'nutrition on trends',
      'food energy trend',
      'nutrition trend',
      'calorie trend',
    ],
  },
  {
    route: '/trends?metric=fluid_intake',
    name: 'Fluid intake trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'fluid intake trend on the trends page',
      'fluid intake trend on trends',
      'hydration trend on the trends page',
      'water trend on trends',
      'hydration on trends',
      'fluid intake trend',
      'hydration trend',
      'water intake trend',
    ],
  },
  {
    route: '/trends?metric=exercise_duration',
    name: 'Exercise duration trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'exercise duration trend on the trends page',
      'exercise duration trend on trends',
      'exercise trend on the trends page',
      'workout trend on the trends page',
      'exercise on trends',
      'exercise duration trend',
      'exercise trend',
      'workout trend',
    ],
  },
  {
    route: '/trends?metric=symptoms',
    name: 'Reported symptoms trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'symptoms trend on the trends page',
      'symptoms trend on trends',
      'symptoms on the trends page',
      'symptoms on trends',
      'symptom trend on the trends page',
      'symptoms trend',
      'symptom trend',
      'reported symptoms trend',
    ],
  },
  {
    route: '/trends?metric=vigilance',
    name: 'Vigilance reaction trend',
    parentName: 'the Trends page',
    parentRoute: '/trends',
    aliases: [
      'vigilance trend on the trends page',
      'vigilance trend on trends',
      'reaction time trend on the trends page',
      'reaction time trend on trends',
      'vigilance on the trends page',
      'vigilance on trends',
      'vigilance trend',
      'reaction time trend',
      'pvt trend',
    ],
  },
  // CMO Console tabs
  {
    route: '/cmo?tab=triage',
    name: 'Triage',
    parentName: 'the CMO console',
    parentRoute: '/cmo',
    aliases: [
      'triage on the cmo page',
      'triage on the cmo console',
      'triage on cmo',
      'triage tab on the cmo page',
      'triage tab on cmo',
      'triage tab',
      'triage',
    ],
  },
  {
    route: '/cmo?tab=actions',
    name: 'Follow-up tasks',
    parentName: 'the CMO console',
    parentRoute: '/cmo',
    aliases: [
      'follow-up tasks on the cmo page',
      'follow up tasks on the cmo page',
      'follow-up tasks on cmo',
      'follow up tasks on cmo',
      'actions on the cmo console',
      'actions on the cmo page',
      'actions on cmo',
      'follow-up tasks tab',
      'follow up tasks tab',
      'actions tab on cmo',
      'actions tab',
    ],
  },
  {
    route: '/cmo?tab=kit',
    name: 'Supplies and inventory',
    parentName: 'the CMO console',
    parentRoute: '/cmo',
    aliases: [
      'supplies on the cmo page',
      'supplies on the cmo console',
      'supplies on cmo',
      'inventory on the cmo page',
      'inventory on the cmo console',
      'inventory on cmo',
      'medical kit on the cmo page',
      'medical kit on cmo',
      'supplies tab on cmo',
      'inventory tab on cmo',
      'supplies tab',
      'inventory tab',
      'supplies',
      'inventory',
    ],
  },
  {
    route: '/cmo?tab=quality',
    name: 'Data quality',
    parentName: 'the CMO console',
    parentRoute: '/cmo',
    aliases: [
      'data quality on the cmo page',
      'data quality on the cmo console',
      'data quality on cmo',
      'sensor quality on cmo',
      'sensors on cmo',
      'data quality tab on cmo',
      'data quality tab',
      'data quality',
    ],
  },
  {
    route: '/cmo?tab=telemetry',
    name: 'Interplanetary telemetry',
    parentName: 'the CMO console',
    parentRoute: '/cmo',
    aliases: [
      'telemetry on the cmo page',
      'telemetry on the cmo console',
      'telemetry on cmo',
      'interplanetary telemetry on cmo',
      'telemetry tab on cmo',
      'telemetry tab',
      'telemetry',
    ],
  },
  // Hazards subpages
  {
    route: '/hazards/radiation',
    name: 'the Radiation monitor',
    parentName: 'the Hazards page',
    parentRoute: '/hazards',
    aliases: [
      'radiation on the hazards page',
      'radiation on hazards',
      'space radiation on the hazards page',
      'space radiation on hazards',
      'radiation monitor on hazards',
    ],
  },
  {
    route: '/hazards/isolation',
    name: 'the Isolation and confinement page',
    parentName: 'the Hazards page',
    parentRoute: '/hazards',
    aliases: [
      'isolation on the hazards page',
      'isolation on hazards',
      'confinement on the hazards page',
      'confinement on hazards',
      'isolation and confinement on the hazards page',
      'isolation and confinement on hazards',
    ],
  },
  {
    route: '/hazards/distance',
    name: 'the Distance from Earth page',
    parentName: 'the Hazards page',
    parentRoute: '/hazards',
    aliases: [
      'distance from earth on the hazards page',
      'distance from earth on hazards',
      'distance on the hazards page',
      'distance on hazards',
      'communication delay on the hazards page',
      'communication delay on hazards',
    ],
  },
  // Cognitive Lab modes
  {
    route: '/cognitive?mode=quick',
    name: 'Quick vigilance check',
    parentName: 'the Cognitive lab',
    parentRoute: '/cognitive',
    aliases: [
      'quick mode on the cognitive lab',
      'quick mode on cognitive lab',
      'quick mode on cognitive',
      'quick mode',
      'quick test on cognitive lab',
      'quick vigilance check',
    ],
  },
  {
    route: '/cognitive?mode=standard',
    name: 'Standard vigilance check',
    parentName: 'the Cognitive lab',
    parentRoute: '/cognitive',
    aliases: [
      'standard mode on the cognitive lab',
      'standard mode on cognitive lab',
      'standard mode on cognitive',
      'standard mode',
      'standard test on cognitive lab',
      'standard vigilance check',
    ],
  },
  {
    route: '/cognitive?mode=timed',
    name: 'Timed vigilance check',
    parentName: 'the Cognitive lab',
    parentRoute: '/cognitive',
    aliases: [
      'timed mode on the cognitive lab',
      'timed mode on cognitive lab',
      'timed mode on cognitive',
      'timed mode',
      '3-minute mode on cognitive lab',
      '3 minute mode on cognitive lab',
      'timed vigilance check',
      'timed reaction test',
    ],
  },
  // Check-in subpages / steps
  {
    route: '/check-in?step=pulse',
    name: 'Resting pulse check-in',
    parentName: 'the Sol check-in',
    parentRoute: '/check-in',
    aliases: [
      'resting pulse on check-in',
      'pulse on check-in',
      'pulse step on check-in',
      'heart rate on check-in',
    ],
  },
  {
    route: '/check-in?step=breath',
    name: 'Breathing and HRV check-in',
    parentName: 'the Sol check-in',
    parentRoute: '/check-in',
    aliases: [
      'breathing and hrv on check-in',
      'breathing on check-in',
      'hrv on check-in',
    ],
  },
  {
    route: '/check-in?step=bp',
    name: 'Blood pressure check-in',
    parentName: 'the Sol check-in',
    parentRoute: '/check-in',
    aliases: [
      'blood pressure on check-in',
      'stand test on check-in',
    ],
  },
  {
    route: '/check-in?step=mood',
    name: 'Mood assessment check-in',
    parentName: 'the Sol check-in',
    parentRoute: '/check-in',
    aliases: [
      'mood on check-in',
      'mood assessment on check-in',
      'mood mcq on check-in',
    ],
  },
  // Assistant subpages
  {
    route: '/assistant#voice-settings',
    name: 'Voice settings',
    parentName: 'Ask Sol',
    parentRoute: '/assistant',
    aliases: [
      'voice settings on ask sol',
      'voice settings on the assistant',
      'voice settings',
    ],
  },
  // Demo subpages
  {
    route: '/demo#real-data',
    name: 'Tested on real astronaut data',
    parentName: 'Demo and data',
    parentRoute: '/demo',
    aliases: [
      'tested on real astronaut data on demo page',
      'tested on real astronaut data on demo',
      'tested on real astronaut data',
      'real astronaut data on demo',
      'real data on demo',
      'inspiration4 data on demo',
    ],
  },
];

function escapeRegex(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '\\s+');
}

const ROUTE_PREWARMERS: Record<string, () => Promise<unknown>> = {
  '/trends': () => import('../trends/Trends'),
};

/**
 * Pre-warms the code bundle, data pipelines, and styles for a route
 * during speech streaming before utterance completion (0.0 µs post-speech execution lag).
 */
export function prewarmRoute(route: string) {
  const base = route.split('?')[0];
  const loader = ROUTE_PREWARMERS[base];
  if (loader) {
    void loader().catch(() => undefined);
  }
}

/**
 * Recognizes requests to open subpages, category tabs, indicator charts or modes of a page:
 * e.g. "navigate to cardiovascular trends on the trends page", "open supplies on CMO",
 * "show metabolic trends", "timed mode on cognitive lab".
 */
export function subpageFromSpeech(text: string, currentPage = '/'): SubpageGuide | null {
  const lower = text.toLowerCase().replace(/[.,!?;:]+$/g, '').trim();
  if (/^(?:what|why|when|where|which|who|how|is|are|does|did)\b/.test(lower)) return null;

  // Has action/navigation intent or user is currently on the parent page
  const hasVerb = /\b(open|go to|take me to|show(?: me)?|switch to|navigate to|select|jump to|display|view|check(?: out| my)?|look at|inspect|pull up|bring up)\b/i.test(lower);

  // Strip conversational wrappers and intent preambles
  const stripped = lower
    .replace(/^(?:hey sol|sol|please|can you(?: please)?|could you(?: please)?)\s+/i, '')
    // Also allow meta phrases like "navigate to subpages of a page like cardiovascular trends on the trends page"
    .replace(/^(?:navigate to|go to|open|show(?: me)?|switch to|take me to|select|jump to|display|view|check(?: out| my)?|look at|inspect|pull up|bring up)\s+(?:the\s+)?(?:subpages?\s+(?:of\s+(?:a\s+)?page\s+)?(?:like\s+)?)?/i, '')
    .trim();

  // Sort candidate aliases by length descending
  const candidates: { guide: SubpageGuide; alias: string }[] = [];
  for (const guide of SUBPAGE_GUIDES) {
    for (const alias of guide.aliases) {
      candidates.push({ guide, alias: alias.toLowerCase() });
    }
  }
  candidates.sort((a, b) => b.alias.length - a.alias.length);

  for (const { guide, alias } of candidates) {
    const aliasRegex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
    if (aliasRegex.test(stripped) || aliasRegex.test(lower)) {
      if (hasVerb || currentPage.startsWith(guide.parentRoute) || alias.includes('page') || alias.includes('trends') || alias.includes('cmo') || alias.includes('lab') || alias.includes('hazards')) {
        prewarmRoute(guide.route);
        return guide;
      }
    }
  }

  return null;
}
