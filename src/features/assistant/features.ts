/**
 * Sol's explanations of every tab, sub-tab and feature, in at most two parts:
 * part 1 says what it shows and how to use it; part 2 (after one "next") says how to
 * read its numbers and what to act on. Written from the components and the app's own
 * thresholds, so they describe what is actually on screen. Pure data + lookup (tested).
 */
import { guideFor } from './pageGuides';

export interface Feature {
  id: string;
  /** the main tab it lives on */
  route: string;
  /** sub-tab query (e.g. tab=kit) that shows it, when it has one */
  query?: string;
  name: string;
  /** words people use for it, matched as whole words */
  aliases: RegExp;
  parts: [string, string];
}

export const FEATURES: Feature[] = [
  // Dashboard
  { id: 'status', route: '/', name: 'General health status', aliases: /\b(?:general health status|health status|status card|today'?s status)\b/i, parts: [
    'The status card is the result of your latest check-in in one line: who should look at it, and why.',
    'Self-care means keep recording. Talk to your medical officer today means a reading moved away from your usual. Flight surgeon review means Earth is asked to look too.',
  ] },
  { id: 'twin', route: '/', name: 'Crew digital twin', aliases: /\b(?:digital twin|twin|astronaut (?:figure|model)|body (?:figure|model)|3d (?:body|astronaut))\b/i, parts: [
    'The astronaut figure shows today’s check-in on six body areas. Tap an area to open its trend.',
    'Head is mind and mood, visor is sleep, chest is heart and blood pressure, torso is temperature, abdomen is blood glucose, limbs are symptoms. Green is your usual, yellow is changed today, orange is changing for several days, purple means check the number, grey means no reading.',
  ] },
  { id: 'checklist', route: '/', name: 'Daily checklist', aliases: /\b(?:daily checklist|routine checklist|checklist)\b/i, parts: [
    'The daily checklist lists today’s measurements. Items you saved in the check-in tick themselves; you can tick the rest by hand.',
    'Unticked items are readings Sol Check does not have for today, so their body areas show grey and cannot be compared with your usual.',
  ] },
  { id: 'radiation-card', route: '/', name: 'Radiation card', aliases: /\b(?:radiation (?:card|panel|banner|status))\b/i, parts: [
    'The radiation card shows the habitat’s radiation state right now. Open it for the full radiation monitor.',
    'Green is safe, yellow is elevated or recovering, orange is a solar particle event, red is a storm: go to the central storm shelter.',
  ] },
  { id: 'recent', route: '/', name: 'Recent readings', aliases: /\b(?:recent readings|bar chart|bars)\b/i, parts: [
    'Recent readings is a bar chart: one bar per sol for the reading you pick in the menu.',
    'Compare the last bar with the ones before it. The arrow opens the full trend with your personal baseline.',
  ] },
  // Check-in pages
  { id: 'ci-heart', route: '/check-in', query: 'step=heart', name: 'Heart rate page', aliases: /\b(?:heart rate (?:page|tab|step)|pulse (?:page|step))\b/i, parts: [
    'Page 1 records your resting heart rate. Rest 5 minutes, then use the camera scan, about 16 seconds, or count your wrist pulse for a full 60 seconds.',
    'Enter beats per minute. Sol Check compares it with your usual, the middle of your last 14 sols. A camera reading is kept only if its signal quality passes.',
  ] },
  { id: 'ci-breath', route: '/check-in', query: 'step=breath', name: 'Breath rate page', aliases: /\b(?:breath(?:ing)? rate (?:page|tab|step)|breathing (?:page|step))\b/i, parts: [
    'Page 2 records your breaths per minute at rest. Sit an arm’s length from the camera with your face and chest in view and start the breathing scan, about 45 seconds, or count chest rises for a full 60 seconds.',
    'The scan follows your chest’s movement and cross-checks it with the pulse in your face. It offers a rate only when its confidence is good or acceptable. Normal at rest is 12 to 20.',
  ] },
  { id: 'ci-bp', route: '/check-in', query: 'step=pressure', name: 'Blood pressure page', aliases: /\b(?:blood pressure (?:page|tab|step)|stand(?:-| )?up test|orthostatic test)\b/i, parts: [
    'Page 3 records seated blood pressure from the arm cuff, top and bottom number in mmHg. The optional stand-up test repeats it after 3 minutes standing.',
    'In the stand-up test, a drop of 20 in the top number, 10 in the bottom, or a pulse rise of 30 is flagged: it shows how your body handles gravity.',
  ] },
  { id: 'ci-temp', route: '/check-in', query: 'step=temp_sugar', name: 'Temperature and sugar page', aliases: /\b(?:temperature (?:and|&) (?:sugar|glucose)|temperature (?:page|step)|sugar (?:page|step)|glucose (?:page|step))\b/i, parts: [
    'Page 4 records body temperature in degrees Celsius from the thermometer and blood glucose in mg/dL from the finger-prick meter.',
    'Both are compared with your own usual. Skip either one if you did not measure it.',
  ] },
  { id: 'ci-sleep', route: '/check-in', query: 'step=sleep', name: 'Sleep page', aliases: /\b(?:sleep (?:page|step))\b/i, parts: [
    'Page 5 asks how many hours you actually slept last night.',
    'Sleep below your usual for 3 of the last 5 sols is a sustained trend, and the medical officer is asked to look.',
  ] },
  { id: 'ci-mood', route: '/check-in', query: 'step=mood', name: 'Mood page', aliases: /\b(?:mood (?:page|step|assessment|questions?)|six questions)\b/i, parts: [
    'Page 6 is six questions on mood, sleep, workload, crew connection, focus and comfort. Each answer folds to one line once chosen; tap it to change it.',
    'Each answer scores 1 to 5, and the result becomes your mood score from 1, low, to 5, good. The optional 40-second voice check adds pitch, pace and pauses.',
  ] },
  { id: 'ci-feel', route: '/check-in', query: 'step=feel', name: 'How you feel and activity page', aliases: /\b(?:how you feel|symptoms? (?:page|step)|activity (?:page|step))\b/i, parts: [
    'Page 7 is symptoms you noticed today, plus water, exercise, food and weight, and a free note.',
    'Targets are 2 litres of water and 90 minutes of exercise. Under 2000 kilocalories is flagged, and a 3 % weight drop is flagged.',
  ] },
  { id: 'ci-review', route: '/check-in', query: 'step=review', name: 'Review and save page', aliases: /\b(?:review (?:and|&) save|review (?:page|step))\b/i, parts: [
    'Page 8 lists every answer. Tap Edit next to any page to change it, then save.',
    'Saving runs the assessment at once: it compares each reading with your usual and opens the result on the Assessment tab.',
  ] },
  // Cognitive lab
  { id: 'cog-quick', route: '/cognitive', query: 'mode=quick', name: 'Quick vigilance check', aliases: /\b(?:quick (?:mode|check|test|vigilance))\b/i, parts: [
    'Quick mode is 3 trials: tap the target or press Space as soon as “Respond now” appears.',
    'Responses of 500 milliseconds or slower count as lapses. Use the same mode each day so results compare.',
  ] },
  { id: 'cog-standard', route: '/cognitive', query: 'mode=standard', name: 'Standard vigilance check', aliases: /\b(?:standard (?:mode|check|test|vigilance))\b/i, parts: [
    'Standard mode is 6 trials, a steadier result than quick mode.',
    'Lapses are responses of 500 milliseconds or slower, or missed. Your baseline needs results on 3 of the last 14 sols in this mode.',
  ] },
  { id: 'cog-timed', route: '/cognitive', query: 'mode=timed', name: 'Timed vigilance check', aliases: /\b(?:timed (?:mode|check|test|vigilance)|3 minute (?:test|check))\b/i, parts: [
    'Timed mode runs for 3 minutes, like the test used on the International Space Station.',
    'It uses the station’s thresholds: 355 milliseconds or slower is a lapse, and faster than 130 milliseconds is too early.',
  ] },
  { id: 'cog-results', route: '/cognitive', name: 'Vigilance results', aliases: /\b(?:vigilance results|result cards?|results cards?)\b/i, parts: [
    'The result cards show your last test: mean reaction time, lapses, early responses and missed responses.',
    'Under 300 milliseconds is sharp, up to 500 is normal, slower is a sign of fatigue. Zero lapses is best.',
  ] },
  // CMO console
  { id: 'cmo-triage', route: '/cmo', query: 'tab=triage', name: 'Triage tab', aliases: /\b(?:triage(?: tab)?|active (?:diagnostic )?findings)\b/i, parts: [
    'Triage lists the active findings from the latest check-in for the medical officer to review, with notes and a sign-off.',
    'Each finding shows the reading, the crew member’s usual and the rule that fired. Signing off records that the medical officer has reviewed today’s findings.',
  ] },
  { id: 'cmo-actions', route: '/cmo', query: 'tab=actions', name: 'Follow-up tasks tab', aliases: /\b(?:actions? tab|follow[ -]?up tasks?|action center)\b/i, parts: [
    'Follow-up tasks are the actions the findings created, each with its trigger reason, a note, a status and a priority.',
    'Work the highest priority first. A task closes when it is marked resolved; open ones stay on the dashboard.',
  ] },
  { id: 'cmo-kit', route: '/cmo', query: 'tab=kit', name: 'Supplies tab', aliases: /\b(?:supplies|inventory|kit)(?: tab)?\b/i, parts: [
    'Supplies lists what is on board for check-ups: food, drink pouches and measuring equipment, with quantity and expiry.',
    'Expired items come first, then low stock, then items expiring soon. There are no medicines in this list; treatment is the medical officer’s decision.',
  ] },
  { id: 'cmo-quality', route: '/cmo', query: 'tab=quality', name: 'Data quality tab', aliases: /\b(?:data quality|sensor provenance|signal quality)(?: tab)?\b/i, parts: [
    'Data quality shows, for each reading, its value, how it was captured and its quality or status.',
    'Camera readings carry a signal quality; low-quality ones are not used. Check this tab before trusting a finding built on a camera reading.',
  ] },
  { id: 'cmo-telemetry', route: '/cmo', query: 'tab=telemetry', name: 'Telemetry tab', aliases: /\b(?:telemetry|handoff|ground package|delay timer)(?: tab)?\b/i, parts: [
    'Telemetry builds the summary package for the flight surgeon on Earth and includes the round-trip delay timer.',
    'The timer counts twice the one-way delay, the earliest an answer from Earth can arrive. Act on board first; Earth confirms later.',
  ] },
  // Radiation monitor
  { id: 'rad-map', route: '/hazards/radiation', name: '3D station map', aliases: /\b(?:3d (?:map|model)|station (?:map|model)|compartment map|radiation map)\b/i, parts: [
    'The 3D map shows the habitat’s six compartments with radiation, temperature and CO2. Select a compartment, or ask me to, to see its readings.',
    'Up to 0.15 millisieverts per hour is safe; over 2.1 is an acute breach and the room is restricted. In a storm, the central storm shelter is the best-shielded room.',
  ] },
  { id: 'rad-crew', route: '/hazards/radiation', name: 'Crew dose bars', aliases: /\b(?:dose bars?|career (?:dose|bar)|30[- ]day (?:dose|bar)|crew dose)\b/i, parts: [
    'The dose bars show each crew member’s radiation total: the career bar and the 30-day bar.',
    'The career limit is 600 millisieverts, with marks at a quarter, half and three quarters. The 30-day limit is 250, and 105 is the safe-cap line.',
  ] },
  { id: 'rad-route', route: '/hazards/radiation', name: 'Evacuation route', aliases: /\b(?:evacuation route|shelter route|route to the shelter|muster)\b/i, parts: [
    'The evacuation route shows the path to the storm shelter and the dose picked up on the way.',
    'All crew must be in the shelter within 5 minutes of the alarm. The all-clear needs every room at 0.15 or below for 6 hours in a row.',
  ] },
  { id: 'rad-recovery', route: '/hazards/radiation', name: 'Recovery assays', aliases: /\b(?:recovery assays?|lymphocyte|finger[- ]prick assay)\b/i, parts: [
    'After a storm, the recovery assays log blood-cell checks at 24 and 48 hours.',
    'The result is a percentage of your baseline; 96 % means nominal recovery.',
  ] },
  // Timeline
  { id: 'tl-crew', route: '/timeline', name: 'Crew readings lane', aliases: /\b(?:crew readings|sleep and mood (?:lane|chart))\b/i, parts: [
    'The crew readings lane shows sleep and mood on each sol.',
    'The solid line is sleep in hours on the left scale, the dashed line is mood from 1 to 5 on the right. Hollow markers are values you entered; gaps are sols with no reading.',
  ] },
  { id: 'tl-events', route: '/timeline', name: 'Mission events lane', aliases: /\b(?:mission events?|events lane)\b/i, parts: [
    'Mission events lists what happened on each sol, lined up with your readings above it.',
    'Use it to see what came before a change: Sol 41 is the solar storm that sent the crew to the shelter.',
  ] },
  { id: 'tl-air', route: '/timeline', name: 'Habitat air lane', aliases: /\b(?:habitat air|co2 (?:lane|chart)|cabin air)\b/i, parts: [
    'Habitat air shows cabin CO2 on each sol, in mmHg.',
    'The dotted line is NASA’s 1-hour limit of 3; from 2.5 it is elevated. Headaches on high-CO2 sols point to the air, not to you.',
  ] },
  { id: 'tl-radiation', route: '/timeline', name: 'Curiosity radiation lane', aliases: /\b(?:curiosity|rover|radiation (?:lane|archive)|rad archive)\b/i, parts: [
    'This lane is radiation measured by NASA’s Curiosity rover on Mars, as hourly medians in microgray per hour.',
    'The spike on Sol 41 is the September 2017 solar storm. Gaps are hours with no data.',
  ] },
  { id: 'tl-replay', route: '/timeline', name: 'Replay controls', aliases: /\b(?:replay(?: controls)?|play button|timeline controls)\b/i, parts: [
    'Play steps through the sols one by one; the marker moves across every lane together. Previous and next step one sol.',
    'Pick a sol to read all its values side by side under the charts.',
  ] },
  // Trends
  { id: 'tr-chart', route: '/trends', name: 'Trend chart', aliases: /\b(?:trend chart|trends? graph)\b/i, parts: [
    'The trend chart shows one reading across recent sols. Pick the reading in the category tabs; tap a point for its value.',
    'The solid line is your readings, the dashed line your personal baseline, the middle of your last 14 sols. Points far from the dashed line are what Sol Check flags.',
  ] },
  { id: 'tr-cardio', route: '/trends', query: 'category=cardiovascular', name: 'Cardiovascular trends', aliases: /\b(?:cardiovascular|heart) (?:trends?|category|tab)\b/i, parts: [
    'Cardiovascular trends cover heart rate, blood pressure and heart rate variability.',
    'A resting heart rate creeping up, or variability falling below 70 % of your usual, can mean poor recovery.',
  ] },
  { id: 'tr-metabolic', route: '/trends', query: 'category=metabolic', name: 'Metabolic and physical trends', aliases: /\b(?:metabolic|physical) (?:trends?|category|tab)\b/i, parts: [
    'Metabolic and physical trends cover blood glucose, temperature, body mass, food, water and exercise.',
    'Watch body mass: a 3 % drop is flagged and 5 % goes to the medical officer.',
  ] },
  { id: 'tr-wellbeing', route: '/trends', query: 'category=wellbeing', name: 'Sleep and wellbeing trends', aliases: /\b(?:wellbeing|sleep) (?:trends?|category|tab)\b/i, parts: [
    'Sleep and wellbeing trends cover sleep, mood, symptoms and vigilance.',
    'Sleep and mood both below your usual on 3 of the last 5 sols is the combined trend that asks the medical officer to look.',
  ] },
  // Assessment
  { id: 'as-findings', route: '/assessment', name: 'Findings', aliases: /\b(?:findings?(?: list)?|what changed)\b/i, parts: [
    'Findings are the readings that moved away from your usual. Open one to see the reading, your usual and the rule behind it.',
    'A change is one sol away from your usual; a sustained trend is the same direction on 3 of the last 5 sols, which counts for more.',
  ] },
  { id: 'as-passport', route: '/assessment', name: 'Evidence passport', aliases: /\b(?:evidence passport|passport|six layers)\b/i, parts: [
    'The evidence passport shows how each result was reached, in six layers from your raw readings to the follow-up sent to Earth.',
    'The layers are readings, signal quality, your personal baseline, the rule, the NASA evidence behind it, and the follow-up.',
  ] },
  { id: 'as-whatif', route: '/assessment', name: 'What-if projection', aliases: /\b(?:what[- ]if(?: projection| simulator)?|projection)\b/i, parts: [
    'The what-if projection lets you change a reading and see how the result would change.',
    'Use it to understand which reading drives a finding. It changes nothing in your saved check-in.',
  ] },
  { id: 'as-earth', route: '/assessment', name: 'Earth communication', aliases: /\b(?:earth communication|ground communication|flight surgeon handoff)\b/i, parts: [
    'Earth communication prepares the summary sent to the flight surgeon when the result needs Earth.',
    'An answer takes twice the one-way delay to arrive, so the crew and the medical officer act first.',
  ] },
  // Hazards
  { id: 'iso-plan', route: '/hazards/isolation', name: 'Countermeasure plan', aliases: /\b(?:countermeasure plan|countermeasures?)\b/i, parts: [
    'The countermeasure plan lets you choose steps against isolation: sleep, exercise, contact with home, crew time.',
    'Check again on a later sol in the follow-up check-in; the page compares sleep, mood and reaction time before and after.',
  ] },
  { id: 'dist-ladder', route: '/hazards/distance', name: 'Escalation ladder', aliases: /\b(?:escalation ladder|three tiers?|escalation)\b/i, parts: [
    'The escalation ladder shows who acts on a result: you, then the crew medical officer, then the flight surgeon on Earth.',
    'A sustained trend, a combined sleep and mood trend, or an acute symptom moves the result up to the medical officer.',
  ] },
  // Demo and data
  { id: 'demo-scenarios', route: '/demo', name: 'Mission scenarios', aliases: /\b(?:scenarios?|load a scenario)\b/i, parts: [
    'Scenarios load a different mission history: other crew, other sols, other events.',
    'Loading one replaces the readings every tab uses, so the dashboard, trends and assessment all follow it.',
  ] },
  { id: 'demo-realdata', route: '/demo', name: 'Tested on real astronaut data', aliases: /\b(?:real (?:astronaut )?data|inspiration ?4)\b/i, parts: [
    'This section runs Sol Check’s rules on real blood data from the Inspiration4 astronauts.',
    'It shows which changes the rules would have flagged, as evidence that they work on real people.',
  ] },
  { id: 'demo-export', route: '/demo', name: 'Record export', aliases: /\b(?:export|record export|download (?:my )?record)\b/i, parts: [
    'Export saves your full record as a file on this device.',
    'It is the copy to send to the medical team; nothing is sent automatically.',
  ] },
  // Ask Sol
  { id: 'ask-voice', route: '/assistant', name: 'Voice settings', aliases: /\b(?:voice settings|hey sol (?:setting|switch))\b/i, parts: [
    'Voice settings turns “Hey Sol” listening on or off and lets you test my voice.',
    'With “Hey Sol” on, I listen on every tab while the app is open; speech is turned into text on the device or the voice server.',
  ] },
];

/** "explain …", "what is the …", "what does … do", "how do I use …", "tell me about …" */
const EXPLAIN = /\b(?:explain|describe|walk me through|tell me about|what(?:'s| is| are| does)|how (?:do i|does|to|can i) (?:use|read)|how does|what am i looking at|what'?s this)\b/i;
const THIS_SECTION = /\b(?:this|the current|current) (?:tab|section|sub ?tab|part|feature|chart|graph|visual\w*|page|screen)\b|\bwhat am i looking at\b/i;

/** The feature asked about, preferring the current tab's. */
export function featureFor(question: string, page: string, search = ''): Feature | null {
  if (!EXPLAIN.test(question)) return null;
  const route = guideFor(page).route;
  const here = FEATURES.filter((f) => f.route === route);
  // "this …" means the current tab; a feature named outright can be on any tab.
  const named = here.find((f) => f.aliases.test(question)) ?? (THIS_SECTION.test(question) ? undefined : FEATURES.find((f) => f.aliases.test(question)));
  if (named) return named;
  // "Explain this tab" on a sub-tab (e.g. /cmo?tab=kit): that sub-tab.
  if (THIS_SECTION.test(question) && search) {
    const q = search.replace(/^\?/, '');
    return here.find((f) => f.query && q.split('&').includes(f.query)) ?? null;
  }
  return null;
}

/**
 * "Explain this page", "explain the charts": the whole tab in two parts. Part 1 names
 * each feature with what it is for; part 2 gives the first-line detail of each.
 */
export function pageExplanation(page: string): [string, string] | null {
  const guide = guideFor(page);
  const here = FEATURES.filter((f) => f.route === guide.route && !f.query?.startsWith('step='));
  const name = guide.name.replace(/^the /, '');
  const Name = `${name[0].toUpperCase()}${name.slice(1)}`;
  if (!here.length) return null;
  return [
    `${Name}: ${guide.what} It has ${here.map((f) => f.name.toLowerCase()).join(', ')}.`,
    here.map((f) => f.parts[1]).join(' '),
  ];
}
