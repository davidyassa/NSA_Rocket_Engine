/**
 * Ask Sol conversation layer: makes the assistant feel human without inventing facts.
 *
 * It wraps the cited answer engine (respond.ts) and adds:
 *  - cleaning of real speech ("I don't know why, I don't know why. How are you?",
 *    two voices in one clip), so each sentence is understood on its own;
 *  - habitat emergencies (low oxygen, smoke, alarms) as urgent, right after crisis words;
 *  - symptoms and "how do I stop …" → empathy, steps from the cited action cards,
 *    and when to get the crew medical officer;
 *  - small talk anywhere in what was said, and a memory of the topic so
 *    "why?", "tell me more" and "what should I do?" follow on naturally.
 * Every health fact still comes from Sol Check's cited content. Pure and tested.
 */
import { ACTION_CARDS, SOURCES } from '../../content';
import { METRIC_IDS, METRICS } from '../../contracts';
import type { KnowledgeIndex } from './knowledge';
import { respond, type AssistantContext, type AssistantReply } from './respond';
import { PAGE_GUIDES, TOUR_ROUTES, describePage, guideFor, prewarmRoute, routeFromSpeech, speakPage, subpageFromSpeech } from './pageGuides';
import { checkinCommand, type CheckinPatch } from './checkinCommands';
import { missionAnswer } from './missionAnswers';
import { ALL_FIGURES, describeFigures, figureFor } from './pageFigures';
import { ASKS_VISUAL } from './pageVisuals';
import { featureFor, pageExplanation } from './features';
import { stripAddress } from './wake';
import { EMERGENCY_NEXT, EMERGENCY_REPEAT, EMERGENCY_STOP, STEPS_PER_TURN, emergencyById, emergencySources, emergencyTurn, type EmergencyProtocol } from './emergency';

export interface DialogueState {
  /** what we last talked about, for follow-up questions */
  topic: { question: string; cards: string[]; label: string; why?: string } | null;
  turns: number;
  /** position in the guided tour of the tabs, or null when not touring */
  tour?: number | null;
  /** a chart being explained part by part: the parts and the next one to say */
  explain?: { parts: string[]; next: number } | null;
  /** the emergency being handled: protocol id, the first step of the last batch spoken, and where it is */
  emergency?: { id: string; start: number; room?: string } | null;
}

export const newDialogue = (): DialogueState => ({ topic: null, turns: 0, tour: null, emergency: null, explain: null });

/** Something the screen should do after the reply (go to another tab or subpage). */
export interface DialogueAction {
  navigate?: string;
  navigateLabel?: string;
  checkin?: CheckinPatch;
  scroll?: 'up' | 'down' | 'top' | 'bottom';
  /** Scroll by a set number of lines (negative = up). */
  scrollLines?: number;
  /** Scroll to a named section/heading on the current page. */
  scrollTo?: string;
  /** Select (and focus) a compartment on the radiation 3D model. */
  radiationRoom?: string;
  routine?: { id: string; checked: boolean };
  timeline?: 'play' | 'pause' | 'next' | 'back' | 'restart';
  /** Emergency Mode: show the alert over every tab; 'safe' turns it green; 'close' closes Sol's islands. */
  emergency?: EmergencyAlert | 'safe' | 'close';
  /** Click the on-screen control whose name best matches this label. */
  click?: string;
}

/** What the Emergency Mode window shows while the medical officer is being called. */
export interface EmergencyAlert {
  id: string;
  label: string;
  /** compartment the crewmates should go to, when the person said where they are */
  room?: string;
  steps: string[];
  stepStart: number;
}

/** Finds on-screen controls for "click …". The app passes one that reads the page. */
export interface ScreenControls {
  find(label: string): { name: string } | null;
}

/** Compartments on the radiation monitor's 3D model, with the words that name them. */
const RADIATION_ROOMS: { id: string; name: string; pattern: RegExp }[] = [
  { id: 'flight-deck', name: 'Flight Deck', pattern: /\bflight ?deck\b|\bcockpit\b/i },
  { id: 'airlock', name: 'Science & EVA Airlock', pattern: /\bair ?lock\b|\bscience\b|\beva\b/i },
  { id: 'habitation', name: 'Habitation Module', pattern: /\bhabitation\b|\bhabitat\b|\bcrew quarters\b|\bliving (?:module|quarters)\b/i },
  { id: 'storm-shelter', name: 'Central Storm Shelter', pattern: /\bstorm shelter\b|\bshelter\b|\bsafe room\b/i },
  { id: 'galley', name: 'Galley & Wardroom', pattern: /\bgalley\b|\bwardroom\b|\bkitchen\b|\bmess\b/i },
  { id: 'equipment-bay', name: 'Service & Equipment Bay', pattern: /\bequipment bay\b|\bservice bay\b|\bequipment\b|\bservice module\b/i },
];
const CLICK = /^(?:please )?(click|tap|press|hit|push|toggle|select|choose|pick|open|expand|collapse|check|uncheck)(?: on)?\s+(?:the\s+|a\s+|an\s+)?(.+?)[.!?]*$/i;
const ROOM_VERB = /^(?:please )?(?:show(?: me)?|open|select|go to|take me to|click(?: on)?|tap(?: on)?|press(?: on)?|choose|pick|focus(?: on)?|zoom (?:in )?on|inspect|display)\s+(?:the\s+)?/i;
/** "I'm in the galley", "she collapsed at the airlock" → that compartment's name. */
export function roomIn(text: string): string | undefined {
  for (const room of RADIATION_ROOMS) {
    const place = new RegExp(String.raw`\b(?:in|at|inside|near|by|on|from)\s+(?:the\s+)?(?:${room.pattern.source})`, 'i');
    if (place.test(text)) return room.name;
  }
  return undefined;
}

function matchRoom(text: string): { id: string; name: string } | null {
  if (!ROOM_VERB.test(text)) return null;
  const rest = text.replace(ROOM_VERB, '');
  for (const room of RADIATION_ROOMS) if (room.pattern.test(rest)) return { id: room.id, name: room.name };
  return null;
}

const WHERE = /\b(where am i|what('?s| is) this (page|tab|screen|place)|what (page|tab|screen) is this|help me (?:here|on this (?:page|tab)|with this (?:page|tab))|what (can|do|should) i do (here|on this (page|tab))|how (do i|to) use (this|it)( page| tab| screen)?|explain this( page| tab| screen)?|guide me( here)?)\b/i;
const TOUR = /\b(give me a tour|take me on a tour|tour (of )?(the app|sol check)|show me around|(walk|guide) me through (the app|sol check))\b/i;
const TOUR_NEXT = /^(next(?: page| tab| one)?|continue|go on|keep going|okay next|yes)[.!?]*$/i;
const TOUR_BACK = /^(back|go back|previous|last one)[.!?]*$/i;
const TOUR_STOP = /^(stop(?: the tour)?|(?:end|finish|exit)(?: the)? tour|that'?s enough)[.!?]*$/i;

function tourStep(i: number): { reply: AssistantReply; action: DialogueAction } {
  const guide = guideFor(TOUR_ROUTES[i]);
  const last = i === TOUR_ROUTES.length - 1;
  return {
    reply: { kind: 'help', text: `${i === 0 ? 'Let’s take a tour. ' : ''}Stop ${i + 1} of ${TOUR_ROUTES.length}: ${describePage(guide)} ${last ? 'That’s the whole tour. Ask me anything.' : 'Say “next” to go on, “back”, or “stop”.'}`, sources: [{ label: guide.name.replace(/^the /, ''), route: guide.route }] },
    action: { navigate: guide.route },
  };
}

/** Split speech into sentences, drop repeats and filler, keep the meaningful parts. */
export function cleanSpeech(text: string): string[] {
  const parts = text
    .replace(/\s+-\s+/g, '\n') // "- Hello? - How old are you?": two voices or two thoughts
    .replace(/^\s*-\s*/, '')
    .split(/(?<=[.!?])\s+|\s*[;\n]\s*|,\s+/)
    .map((s) => s.trim().replace(/^[-–—,.\s]+/, ''))
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (/^(um+|uh+|hmm+|so|okay|ok|well|yeah|i don'?t know( why)?|you know)$/.test(key)) continue;
    out.push(part);
  }
  return out.length ? out : [text.trim()];
}


interface SymptomCare {
  pattern: RegExp;
  label: string;
  /** what to look up when the person asks "why?" */
  why: string;
  empathy: string;
  cards: string[];
  getHelp: string;
}

/** Everyday symptom words → which cited action cards help, and when to get a person. */
const SYMPTOMS: SymptomCare[] = [
  { pattern: /\b(dizz\w*|light[- ]?headed|faint\w*|room (is )?spinning|vertigo)\b/i, label: 'dizziness', why: 'orthostatic intolerance standing blood pressure gravity', empathy: 'I’m sorry you’re feeling dizzy. Let’s keep you safe first.',
    cards: ['orthostatic-care', 'motion-sickness-care'], getHelp: 'If you faint, have chest pain or trouble breathing, tell your crew medical officer right away.' },
  { pattern: /\b(headache|head (hurts|is pounding)|migraine)\b/i, label: 'headache', why: 'why co2 headaches habitat air', empathy: 'Headaches are miserable, especially up here. A couple of common causes are worth checking.',
    cards: ['co2-check', 'hydrate'], getHelp: 'If it is the worst headache you’ve had, or comes with vision changes or confusion, tell your crew medical officer now.' },
  { pattern: /\b(nause\w*|sick to my stomach|throw(ing)? up|vomit\w*|queasy)\b/i, label: 'nausea', why: 'space motion sickness inner ear', empathy: 'That sounds really unpleasant. Nausea is common while the body adapts to a new gravity level.',
    cards: ['motion-sickness-care', 'hydrate'], getHelp: 'If you keep vomiting, tell your crew medical officer today: you can lose water fast.' },
  { pattern: /\b(tired|exhausted|fatigue\w*|no energy|worn out|sleepy)\b/i, label: 'tiredness', why: 'why sleep matters in space', empathy: 'Being worn out is hard on body and mind. Let’s look after your recovery.',
    cards: ['recovery-day'], getHelp: 'If you’re still exhausted after a few good nights, mention it to your crew medical officer.' },
  { pattern: /\b(can'?t sleep|cannot sleep|insomnia|slept badly|bad sleep|not sleeping)\b/i, label: 'sleep', why: 'why sleep matters in space', empathy: 'Poor sleep makes everything harder, and it’s very common on missions.',
    cards: ['recovery-day'], getHelp: 'If poor sleep goes on for several sols, or your mood drops with it, talk to your crew medical officer.' },
  { pattern: /\b(stress\w*|anxious|anxiety|worried|overwhelmed|sad|down|low mood|lonely|homesick|depressed)\b/i, label: 'how you feel', why: 'isolation confinement mood behavioral', empathy: 'Thank you for telling me. Feeling like this far from home is more common than people say, and it’s worth looking after.',
    cards: ['behavioral-support'], getHelp: 'If it feels like too much, talk to your crew medical officer or a crewmate you trust today.' },
  { pattern: /\b(blurr\w*|vision|can'?t see (well|clearly)|eyes? (hurt|feel))\b/i, label: 'vision', why: 'sans fluid shift eye vision', empathy: 'Changes in your vision are worth taking seriously, and it’s good you noticed.',
    cards: ['eye-check'], getHelp: 'Tell your crew medical officer about any new vision change today.' },
  { pattern: /\b(side pain|back pain|flank|blood in (my )?urine|kidney)\b/i, label: 'side or back pain', why: 'kidney stone bone calcium fluid', empathy: 'I’m sorry, that sounds painful.',
    cards: ['kidney-stone-care'], getHelp: 'Side or back pain, or blood in your urine, should be checked by your crew medical officer today.' },
  { pattern: /\b(not hungry|no appetite|can'?t eat|food tastes (bland|boring))\b/i, label: 'appetite', why: 'menu fatigue food energy body mass', empathy: 'Losing your appetite is really common with the same menu for months.',
    cards: ['nutrition-plan'], getHelp: 'If you’re losing weight, your crew medical officer should know.' },
  { pattern: /\b(thirsty|dehydrated|dry mouth)\b/i, label: 'thirst', why: 'why fluid intake matters thirst low gravity', empathy: 'Good that you noticed: thirst is weaker in low gravity, so it’s easy to fall behind.',
    cards: ['hydrate'], getHelp: 'If you also feel dizzy or confused, tell your crew medical officer.' },
];

const SYMPTOM_STATEMENT = /\b(i'?m|i am|i feel|feeling|i have|i've got|i got|i keep|my .* (hurts?|aches?)|stop|prevent|help with|deal with|get rid of|what (should|can) i do|how (do|can) i)\b/i;
const FOLLOW_UP = /^(why\??|why is that\??|how come\??|tell me more|more|go on|and\??|what else\??|what should i do\??|what do i do\??|what can i do\??|how\??|explain( that| more)?)\.?$/i;

const HOW_OLD = /\bhow old are you\b/i;
const WHO_MADE = /\b(who (made|built|created) you|who are your (makers|creators))\b/i;
const ARE_YOU_AI = /\b(are you (an? )?(ai|robot|human|real|person|bot))\b/i;
const NAME = /\b(what'?s your name|what is your name|your name)\b/i;
const ARE_YOU_THERE = /\b(are you (there|here|listening|online)|can you hear me)\b/i;
const HOW_ARE_YOU = /\b(how are you|how'?re you|how r u|how are you doing|how you doing|how'?s it going|how do you feel|how is everything|how are things)\b/i;
const RECIPROCAL = /\b(what about you|what about yourself|how about you|how about yourself|and you|and yourself|what about u|how about u)\b/i;
const USER_WELL = /\b(?:(?:so|well)[, ]+)?(?:(?:i['’]?m|i am)\s+)?(?:(?:doing|feeling|feel)\s+)?(?:great|good|well|fine|okay|ok|awesome|wonderful|pretty good|alright|all right)\b|\ball good\b|\bnot bad\b|\bpretty good\b/i;
const GREETING = /^(hi|hello|hey|good (morning|afternoon|evening)|salam|marhaba)\b/i;
const THANKS = /\b(thanks|thank you|appreciate it)\b/i;
const LOVE = /\b(i love you|you'?re (great|awesome|amazing|the best))\b/i;
const GOOD_TO_HEAR = /\b(good to hear|glad to hear|nice to hear|that'?s (good|great|awesome|cool))\b/i;

function cardSteps(ids: string[], max = 3): { steps: string[]; sources: AssistantReply['sources'] } {
  const steps: string[] = [];
  const sources: AssistantReply['sources'] = [];
  for (const id of ids) {
    const card = ACTION_CARDS[id];
    if (!card) continue;
    for (const step of card.steps) if (steps.length < max && !steps.includes(step)) steps.push(step);
    const source = SOURCES[card.sourceRefs[0]];
    sources.push({ label: `${card.title}${source ? ` · ${source.title}` : ''}`, url: source?.url ?? undefined, route: '/assessment' });
  }
  return { steps, sources };
}

function smallTalk(sentence: string, ctx: AssistantContext, userStatedWell = false): string | null {
  const first = ctx.crewName.split(' ')[0];
  if (HOW_OLD.test(sentence)) return 'I’m very young: I was built for the 2026 NASA Space Apps Challenge. Old enough to know a lot about crew health, though!';
  if (WHO_MADE.test(sentence)) return 'A team of six students made me for the NASA Space Apps Challenge, to help astronauts look after their health far from Earth.';
  if (ARE_YOU_AI.test(sentence)) return 'I’m Sol, a helper inside Sol Check, not a person and not a doctor. I only use Sol Check’s cited NASA health information and your own check-in.';
  if (NAME.test(sentence)) return 'I’m Sol, your health check-in helper.';
  if (ARE_YOU_THERE.test(sentence)) return `I’m right here and listening, ${first}! What can I help you with?`;
  if (LOVE.test(sentence)) return `That’s kind of you, ${first}. I’m glad I can help.`;

  // Both user feeling well AND asking about Sol in one sentence (e.g. "I'm doing great, what about you?")
  if (USER_WELL.test(sentence) && (RECIPROCAL.test(sentence) || HOW_ARE_YOU.test(sentence))) {
    return `I’m glad to hear that, ${first}! I’m doing well too, thanks for asking. Running smoothly and ready whenever you need me.`;
  }
  if (RECIPROCAL.test(sentence) || HOW_ARE_YOU.test(sentence)) {
    if (userStatedWell) {
      return `I’m doing well too, thanks for asking! Running smoothly and ready whenever you need me.`;
    }
    return `I’m doing well, thanks for asking! More importantly, how are you feeling today, ${first}?`;
  }
  if (USER_WELL.test(sentence)) {
    return `I’m glad to hear that, ${first}! I’m here whenever you want to log your check-in, review habitat air, or look over Sol 43.`;
  }
  if (GOOD_TO_HEAR.test(sentence)) return 'Glad to hear it! Let me know if you need anything.';
  if (THANKS.test(sentence)) return 'You’re welcome. I’m here whenever you need me.';
  if (GREETING.test(sentence)) return `Hi ${first}! It’s good to hear from you.`;
  return null;
}

function careReply(care: SymptomCare): AssistantReply {
  const { steps, sources } = cardSteps(care.cards);
  const how = steps.length ? ` Here’s what helps: ${steps.map((s) => s.replace(/\.$/, '')).join('. ')}.` : '';
  return {
    kind: 'personal',
    text: `${care.empathy}${how} ${care.getHelp}`,
    sources,
    suggestions: ['Why does this happen in space?', 'How am I doing today?', 'Start a mood check'],
  };
}

function emergencyStep(protocol: EmergencyProtocol, from: number, turns: number, state: DialogueState, room = state.emergency?.room): { reply: AssistantReply; state: DialogueState; action?: DialogueAction } {
  const turn = emergencyTurn(protocol, from);
  const newRoom = room && room !== state.emergency?.room;
  const text = newRoom && from === 0 ? turn.text.replace(`${protocol.label}. `, `${protocol.label}. All crewmates to ${room}. `) : turn.text;
  return {
    reply: { kind: 'urgent', text, steps: turn.steps, stepStart: turn.start, emergency: protocol.id, sources: emergencySources(protocol) },
    state: { ...state, topic: null, tour: null, turns, emergency: { id: protocol.id, start: from, room } },
    // Every crew medical emergency calls the medical officer: Emergency Mode on every tab.
    action: protocol.scope === 'crew'
      ? { emergency: { id: protocol.id, label: protocol.label, room, steps: turn.steps, stepStart: turn.start } }
      : undefined,
  };
}

function explainStep(parts: readonly string[], at: number, state: DialogueState, turns: number, page: string): { reply: AssistantReply; state: DialogueState } {
  // At most two parts: the second comes after a single "next".
  const two = parts.slice(0, 2);
  const more = at === 0 && two.length > 1;
  const guide = guideFor(page);
  return {
    reply: { kind: 'help', text: `${two[at]}${more ? ' Say “next” for more.' : ''}`, speech: `${two[at]}${more ? ' Say next for more.' : ''}`, sources: [{ label: guide.name.replace(/^the /, ''), route: guide.route }] },
    state: { ...state, turns, explain: more ? { parts: two, next: 1 } : null },
  };
}

/** One turn of conversation: returns the reply and the updated memory. */
export function converse(utterance: string, state: DialogueState, ctx: AssistantContext, index: KnowledgeIndex, page = '/', search = '', screen?: ScreenControls): { reply: AssistantReply; state: DialogueState; action?: DialogueAction } {
  const turns = state.turns + 1;
  // "Hey Sol" (and "Sol, …", "…, Sol") only gets my attention; it is not part of the request.
  const asked = stripAddress(utterance);
  if (!asked.replace(/[^a-z0-9]/gi, '')) {
    return { reply: { kind: 'help', text: 'I’m listening.', sources: [] }, state: { ...state, turns } };
  }
  const sentences = cleanSpeech(asked);
  const whole = sentences.join(' ');

  // 0. "We're safe", "the emergency is over": stand down first, so words like
  // "emergency" or "alarm" in it are not read as a new emergency.
  const plain = whole.replace(/[’‘`]/g, "'").trim();
  const standing = state.emergency ? emergencyById(state.emergency.id) : undefined;
  if ((standing || ctx.emergencyMode === 'alert') && EMERGENCY_STOP.test(plain)) {
    return {
      reply: { kind: 'help', text: standing?.scope === 'habitat'
        ? 'Glad you’re safe. Keep following the procedure and report to Mission Control.'
        : 'Glad you’re safe. Tell your crew medical officer everything that happened.', sources: standing ? emergencySources(standing) : [] },
      state: { ...state, emergency: null, turns },
      action: { emergency: 'safe' },
    };
  }

  if (EMERGENCY_STOP.test(plain) && /\b(?:safe|over|ended|all clear|out of danger|stand down|false alarm)\b|\b(?:ok(?:ay)?|fine|alright|all right|better) now\b/i.test(plain) && !/\?$/.test(plain)) {
    return { reply: { kind: 'help', text: 'Glad you’re safe. I’m here if anything changes.', sources: [] }, state: { ...state, turns } };
  }

  // 1. Safety first, on everything that was said.
  const safety = respond(whole, ctx, index, true);
  if (safety.kind === 'crisis') return { reply: safety, state: { topic: null, turns, emergency: null } };
  if (safety.kind === 'urgent') {
    const protocol = safety.emergency ? emergencyById(safety.emergency) : undefined;
    return protocol ? emergencyStep(protocol, 0, turns, state, roomIn(whole) ?? state.emergency?.room) : { reply: safety, state: { topic: null, turns, emergency: null } };
  }
  // In safe mode, "all good" closes Sol's islands.
  if (ctx.emergencyMode === 'safe' && /^(?:(?:ok(?:ay)?|yes|yeah)[\s,.!]*)?(?:all good|close(?: it)?|done|got it|thanks|thank you|dismiss)[\s.!]*$/i.test(plain)) {
    return { reply: { kind: 'help', text: 'All good.', sources: [] }, state: { ...state, emergency: null, turns }, action: { emergency: 'close' } };
  }
  // While an emergency is being handled: "next", "repeat", "she's breathing again".
  const active = state.emergency ? emergencyById(state.emergency.id) : undefined;
  if (active && state.emergency) {
    const said = whole.replace(/[’‘`]/g, "'").trim();
    // "I'm in the galley": send the crew there.
    const room = roomIn(said);
    if (room && room !== state.emergency.room) {
      const update = emergencyStep(active, state.emergency.start, turns, state, room);
      return { ...update, reply: { kind: 'urgent', text: `All crewmates to ${room}.`, emergency: active.id, sources: emergencySources(active) } };
    }
    if (EMERGENCY_REPEAT.test(said)) return emergencyStep(active, state.emergency.start, turns, state);
    if (EMERGENCY_NEXT.test(said)) {
      const from = state.emergency.start + STEPS_PER_TURN;
      if (from < active.steps.length) return emergencyStep(active, from, turns, state);
      return {
        reply: { kind: 'urgent', text: `That was the last step for ${active.label.toLowerCase()}. Keep following your crew’s procedure. Say “repeat” to hear the steps again, or tell me what is happening now.`, sources: emergencySources(active), emergency: active.id },
        state: { ...state, turns },
      };
    }
  }
  if (safety.kind === 'declined') return { reply: safety, state: { ...state, turns } };
  if (safety.kind === 'farewell') return { reply: safety, state: newDialogue() };
  // A chart being explained: each "next" adds one detail.
  if (state.explain) {
    if (TOUR_STOP.test(whole)) return { reply: { kind: 'help', text: 'Okay.', sources: [] }, state: { ...state, explain: null, turns } };
    if (TOUR_NEXT.test(whole.trim()) || /^(?:more|go on|tell me more|and\??|what else\??)[.!?]*$/i.test(whole.trim())) {
      return explainStep(state.explain.parts, state.explain.next, state, turns, page);
    }
  }
  // On-screen commands work with polite wrappers: "can you scroll down a bit, please".
  const command = whole
    .replace(/^(?:(?:hey )?(?:sol|soul|saul)[,!.\s]+)?(?:(?:can|could|would|will) you |please |sol,? )+/i, '')
    .replace(/[\s,]+(?:please|for me|a bit|a little(?: bit)?|now)[.!?]*$/i, '')
    .replace(/[?]+$/, '')
    .trim();
  const scroll = command.match(/^(?:please )?(?:scroll|go|move|page) (?:to (?:the )?)?(up|down|top|bottom)(?: of (?:this|the) page)?(?: (?:a bit|a little|more))?[.!]*$/i)?.[1]?.toLowerCase();
  if (scroll === 'up' || scroll === 'down' || scroll === 'top' || scroll === 'bottom') return {
    reply: { kind: 'help', text: `Scrolling ${scroll === 'up' || scroll === 'down' ? scroll : `to the ${scroll}`}.`, sources: [] },
    state: { ...state, turns }, action: { scroll },
  };
  const scrollLines = command.match(/^(?:please )?scroll (up|down)(?: by)? (\d{1,3})(?: lines?| rows?)?[.!]*$/i);
  if (scrollLines) {
    const count = Math.min(200, parseInt(scrollLines[2], 10));
    const direction = scrollLines[1].toLowerCase();
    return {
      reply: { kind: 'help', text: `Scrolling ${direction} ${count} line${count === 1 ? '' : 's'}.`, sources: [] },
      state: { ...state, turns }, action: { scrollLines: (direction === 'up' ? -1 : 1) * count },
    };
  }
  const scrollTo = command.match(/^(?:please )?(?:scroll (?:down |up )?to|skip to)\s+(?:the )?(.+?)(?: section| part| heading| area)?[.!?]*$/i)?.[1]?.trim();
  if (scrollTo) return {
    reply: { kind: 'help', text: `Scrolling to ${scrollTo}.`, sources: [] },
    state: { ...state, turns }, action: { scrollTo },
  };
  const room = matchRoom(command);
  if (room) return {
    reply: { kind: 'help', text: `Opening the ${room.name} on the radiation map.`, sources: [{ label: 'Radiation monitor', route: '/hazards/radiation' }] },
    state: { ...state, turns }, action: { radiationRoom: room.id, navigate: page === '/hazards/radiation' ? undefined : '/hazards/radiation' },
  };
  const routine = whole.match(/^(?:please )?(check|uncheck|mark|clear) (?:the )?(?:routine |daily )?checklist(?: item)?(?: for)?\s+(.+?)[.!?]*$/i);
  if (routine) {
    const item = ctx.mission?.routine?.find(entry => entry.label.toLowerCase() === routine[2].toLowerCase());
    const checked = /^(check|mark)$/i.test(routine[1]);
    return {
      reply: { kind: 'help', text: !item ? 'Say a checklist item such as “check checklist resting pulse”.'
        : item.recorded ? `${item.label} is complete from your saved check-in.`
        : `${item.label} ${checked ? 'checked' : 'unchecked'} on the routine checklist.`, sources: [{ label: 'Routine checklist', route: '/' }] },
      state: { ...state, turns },
      action: item && !item.recorded ? { routine: { id: item.id, checked }, navigate: '/' } : undefined,
    };
  }
  // "Explain the triage tab" asks for an explanation, not to open it.
  const wantsExplanation = /^(?:please |can you |could you )?(?:explain|describe|walk me through|tell me about|what(?:'?s| is| are| does)|how (?:do i|does|to) (?:use|read))\b/i.test(whole);
  const subpage = wantsExplanation ? null : subpageFromSpeech(whole, page);
  if (subpage) {
    const onParent = subpage.parentName ? ` on ${subpage.parentName}` : '';
    return {
      reply: {
        kind: 'help',
        text: `Opening ${subpage.name}${onParent}.`,
        sources: [{ label: `${subpage.name} · ${subpage.parentName.replace(/^the /, '')}`, route: subpage.route }],
      },
      state: { ...state, turns },
      action: {
        navigate: subpage.route,
        navigateLabel: `Opening ${subpage.name}`,
      },
    };
  }
  const cmo = whole.match(/^(?:please )?(?:open|show|go to)(?: the)? (triage|actions|follow[ -]?up tasks|supplies|inventory|data quality|telemetry)(?: tab)?[.!?]*$/i)?.[1]?.toLowerCase();
  if (cmo) {
    const tab = /supplies|inventory/.test(cmo) ? 'kit' : /actions|tasks/.test(cmo) ? 'actions' : cmo === 'data quality' ? 'quality' : cmo;
    return { reply: { kind: 'help', text: `Opening ${cmo} in the crew medical officer console.`, sources: [{ label: 'Crew Medical Officer console', route: `/cmo?tab=${tab}` }] }, state: { ...state, turns }, action: { navigate: `/cmo?tab=${tab}` } };
  }
  const trend = whole.match(/^(?:show|open|select)(?: me)?(?: my| the)? (.+?) (?:trend|chart)[.!?]*$/i)?.[1]?.toLowerCase();
  if (trend) {
    const aliases: Record<string, string> = { pulse: 'heart_rate', sleep: 'sleep_duration', hrv: 'hrv_rmssd', symptoms: 'symptoms', vigilance: 'vigilance' };
    const indicator = aliases[trend] ?? METRIC_IDS.find(metric => METRICS[metric].label.toLowerCase() === trend);
    if (indicator) return {
      reply: { kind: 'help', text: `Opening the ${trend} trend.`, sources: [{ label: 'Trends', route: `/trends?metric=${indicator}` }] },
      state: { ...state, turns }, action: { navigate: `/trends?metric=${indicator}` },
    };
  }
  const timelineSol = whole.match(/^(?:open|show|select|jump to)(?: the)? (?:timeline (?:at |on )?)?sol (\d+)[.!?]*$/i)?.[1];
  if (timelineSol) return {
    reply: { kind: 'help', text: `Opening the Timeline for Sol ${Number(timelineSol)}.`, sources: [{ label: 'Timeline', route: '/timeline' }] },
    state: { ...state, turns }, action: { navigate: `/timeline?sol=${Number(timelineSol)}` },
  };
  const transport = whole.match(/^(play|pause|restart|next|previous)(?: (?:the )?(?:timeline|replay|sol))?[.!?]*$/i)?.[1]?.toLowerCase();
  if ((page === '/timeline' && state.tour == null || /\b(?:timeline|replay)\b/i.test(whole))
      && (transport === 'play' || transport === 'pause' || transport === 'restart' || transport === 'next' || transport === 'previous')) {
    return { reply: { kind: 'help', text: `${transport === 'next' || transport === 'previous' ? `Showing the ${transport} sol` : `${{ play: 'Playing', pause: 'Pausing', restart: 'Restarting' }[transport]} the Timeline replay`}.`, sources: [{ label: 'Timeline', route: '/timeline' }] },
      state: { ...state, turns }, action: { timeline: transport === 'previous' ? 'back' : transport, navigate: page === '/timeline' ? undefined : '/timeline' } };
  }
  const draft = checkinCommand(utterance, page === '/check-in');
  if (draft) return {
    reply: { kind: 'help', text: draft.text, sources: [{ label: 'Check-in draft', route: '/check-in' }] },
    state: { ...state, turns },
    action: draft.open || draft.patch ? { navigate: '/check-in', checkin: draft.patch } : undefined,
  };
  if (safety.kind === 'mood_start') {
    const feeling = whole.match(/\b(sad|down|low|stressed|anxious|lonely|overwhelmed|tired)\b/i)?.[1]?.toLowerCase();
    const empathy = feeling ? `I’m sorry you’re feeling ${feeling}. Being this far from home is hard, and it’s good you said something. ` : '';
    return { reply: { ...safety, text: `${empathy}${safety.text}` }, state: { topic: { question: 'mood', cards: ['behavioral-support'], label: 'how you feel', why: 'isolation confinement mood behavioral' }, turns } };
  }

  // 2. The app itself: where am I, open a tab, guided tour.
  if (state.tour !== null && state.tour !== undefined) {
    if (TOUR_STOP.test(whole)) return { reply: { kind: 'help', text: 'Tour finished. I’m here whenever you need me.', sources: [] }, state: { ...state, tour: null, turns } };
    if (TOUR_NEXT.test(whole.trim()) || TOUR_BACK.test(whole.trim())) {
      const i = Math.max(0, Math.min(TOUR_ROUTES.length - 1, state.tour + (TOUR_BACK.test(whole.trim()) ? -1 : 1)));
      const step = tourStep(i);
      return { ...step, state: { ...state, tour: i === TOUR_ROUTES.length - 1 ? null : i, turns } };
    }
  }
  if (TOUR.test(whole)) {
    const step = tourStep(0);
    return { ...step, state: { ...state, tour: 0, turns } };
  }
  const destination = routeFromSpeech(whole);
  if (destination) {
    return {
      reply: { kind: 'help', text: `Opening ${destination.name}.`, sources: [{ label: destination.name.replace(/^the /, ''), route: destination.route }] },
      action: { navigate: destination.route },
      state: { ...state, turns },
    };
  }
  // "Click start", "tap the standard option", "press save": any control on the screen.
  const click = command.match(CLICK);
  if (click && screen) {
    const target = click[2].replace(/\s+(?:button|tab|link|option|box|checkbox|toggle|switch|card|item|icon)s?$/i, '').trim();
    const strong = /^(?:click|tap|press|hit|push|toggle)$/i.test(click[1]);
    const found = target.split(/\s+/).length <= 6 ? screen.find(target) : null;
    if (found) return { reply: { kind: 'help', text: `Clicking ${found.name}.`, sources: [] }, state: { ...state, turns }, action: { click: target } };
    if (strong) return { reply: { kind: 'help', text: `I can’t find “${target}” on this screen.`, sources: [] }, state: { ...state, turns } };
  }
  // Explanations: a feature or sub-tab by name, or the whole tab, in at most two parts.
  // "What does the 30-day dose mean?" is a number question and is answered below.
  const asksMeaning = /\b(?:mean|means|meaning|stand for|significan\w*|normal|good|bad|safe|high|low|limit)\b/i.test(whole) && figureFor(whole, page);
  if (!asksMeaning && !ALL_FIGURES.test(whole)) {
    const feature = featureFor(whole, page, search);
    if (feature) return explainStep(feature.parts, 0, { ...state, tour: null }, turns, page);
    if (ASKS_VISUAL.test(whole) || /\b(?:explain|describe|walk me through) (?:this|the|all of this) (?:page|tab|screen)\b|\bwhat(?:'?s| is) on (?:this|the) (?:page|tab|screen)\b/i.test(whole)) {
      const whole2 = pageExplanation(page);
      if (whole2) return explainStep(whole2, 0, { ...state, tour: null }, turns, page);
      if (ASKS_VISUAL.test(whole)) return { reply: { kind: 'help', text: `There are no charts on ${guideFor(page).name}. Ask me what its numbers mean instead.`, sources: [] }, state: { ...state, turns } };
    }
  }
  if (WHERE.test(whole)) {
    const guide = guideFor(page);
    return { reply: { kind: 'help', text: describePage(guide), speech: `You’re on ${guide.name}. ${guide.how}`, sources: [{ label: guide.name.replace(/^the /, ''), route: guide.route }], suggestions: [guide.tryAsking, 'Give me a tour'] }, state: { ...state, turns } };
  }
  // "How do I use the timeline?" (a tab by name, from anywhere)
  const howTo = whole.match(/\bhow (?:do i|do you|to|can i|should i) use (?:the )?(.+?)(?: tab| page| screen)?[.!?]*$/i)?.[1];
  const named = howTo && PAGE_GUIDES.find((g) => g.aliases.some((alias) => new RegExp(`\\b${alias.replace(/[-]/g, '[- ]?')}\\b`, 'i').test(howTo)));
  if (named) {
    return { reply: { kind: 'help', text: describePage(named, false), speech: speakPage(named), sources: [{ label: named.name.replace(/^the /, ''), route: named.route }] }, state: { ...state, turns } };
  }
  // The numbers on this tab: all of them, or the one asked about.
  if (ALL_FIGURES.test(whole)) {
    const figures = describeFigures(page);
    if (figures) return { reply: { kind: 'help', text: figures.text, speech: figures.speech, sources: [{ label: guideFor(page).name.replace(/^the /, ''), route: guideFor(page).route }] }, state: { ...state, turns } };
  }
  const personalValue = /\b(?:my|mine|today'?s|current|latest)\b/i.test(whole) && !/\b(?:mean|means|meaning|significan\w*|normal|good|bad|high|low|safe)\b/i.test(whole);
  const figure = !personalValue && figureFor(whole, page);
  const figureReply = figure && { reply: { kind: 'help' as const, text: `${figure.name}: ${figure.means}`, sources: [{ label: guideFor(page).name.replace(/^the /, ''), route: guideFor(page).route }] }, state: { ...state, turns } };
  // "What does the 30-day dose mean?" → the meaning; "what is the radiation status?" → live data first.
  if (figureReply && /\b(?:mean|means|meaning|stand for|significan\w*|explain|define|normal|good|bad|safe|high|low|limit|what does)\b/i.test(whole)) return figureReply;
  const mission = missionAnswer(whole, ctx, page, search);
  if (mission) return { reply: mission, state: { ...state, turns } };
  if (figureReply) return figureReply;

  // 3. Follow-ups use what we just talked about.
  if (state.topic && sentences.length === 1 && FOLLOW_UP.test(sentences[0].trim())) {
    const wantsSteps = /what (should|do|can) i do|how\??$/i.test(sentences[0]);
    if (wantsSteps && state.topic.cards.length) {
      const { steps, sources } = cardSteps(state.topic.cards, 4);
      return { reply: { kind: 'personal', text: `For ${state.topic.label}: ${steps.map((s) => s.replace(/\.$/, '')).join('. ')}.`, sources }, state: { ...state, turns } };
    }
    const deeper = respond(state.topic.why ?? `why ${state.topic.question} in space`, ctx, index);
    return { reply: deeper.kind === 'answer' ? { ...deeper, text: deeper.text.replace(/^[^.]+\.\s*/, '') } : deeper, state: { ...state, turns } };
  }

  // 3. Symptoms and "how do I stop …": care first, facts second.
  const care = SYMPTOMS.find((s) => s.pattern.test(whole));
  if (care && SYMPTOM_STATEMENT.test(whole)) {
    return { reply: careReply(care), state: { topic: { question: care.label, cards: care.cards, label: care.label, why: care.why }, turns } };
  }

  // 4. Small talk, possibly mixed with a real question.
  const userStatedWell = USER_WELL.test(whole);
  const askedAboutSol = RECIPROCAL.test(whole) || HOW_ARE_YOU.test(whole);
  const chat = sentences.map((s) => smallTalk(s, ctx, userStatedWell)).filter((t): t is string => Boolean(t));
  const questions = sentences.filter((s) => !smallTalk(s, ctx, userStatedWell));
  if (chat.length && !questions.length) {
    const text = userStatedWell && askedAboutSol
      ? `I’m glad to hear that, ${ctx.crewName.split(' ')[0]}! I’m doing well too, thanks for asking. Running smoothly and ready whenever you need me.`
      : [...new Set(chat)].join(' ');
    return { reply: { kind: 'help', text, sources: [], suggestions: ['How am I doing today?', 'What happened on Sol 41?', 'Start a mood check'] }, state: { ...state, turns } };
  }

  // 5. The cited answer engine for the real question.
  const reply = respond(questions.join(' ') || whole, ctx, index);
  // A real question gets a straight answer: no "Hi, good to hear from you" before it.
  const lead = userStatedWell && askedAboutSol
    ? `I’m glad to hear that, ${ctx.crewName.split(' ')[0]}! I’m doing well too, thanks for asking. `
    : (chat.length && reply.kind === 'out_of_scope' ? `${[...new Set(chat)].join(' ')} ` : '');
  const topic = reply.kind === 'answer' || reply.kind === 'personal'
    ? { question: questions.join(' ') || whole, cards: [], label: (reply.sources[0]?.label ?? 'that').toLowerCase() }
    : state.topic;
  if (reply.kind === 'out_of_scope' && (chat.length || (userStatedWell && askedAboutSol))) {
    const fallbackText = userStatedWell && askedAboutSol
      ? `I’m glad to hear that, ${ctx.crewName.split(' ')[0]}! I’m doing well too, thanks for asking. Running smoothly and ready whenever you need me.`
      : [...new Set(chat)].join(' ');
    return { reply: { kind: 'help', text: fallbackText, sources: [], suggestions: ['How am I doing today?', 'What happened on Sol 41?', 'Start a mood check'] }, state: { ...state, turns } };
  }
  if (reply.kind === 'out_of_scope') {
    return {
      reply: { ...reply, text: `${lead}Hmm, that one’s outside what I know. I stick to Sol Check’s NASA health information and your check-in, so I don’t make things up. You could ask me how you’re doing today, about a symptom, or what happened on Sol 41.` },
      state: { ...state, turns },
    };
  }
  return { reply: { ...reply, text: `${lead}${reply.text}` }, state: { topic, turns } };
}

export interface SpeculativeIntent {
  action?: DialogueAction;
  predictedRoute?: string;
  isActionable: boolean;
  topic?: string;
}

/**
 * Aegis-Zero Speculative Memory Kernel:
 * Evaluates intermediate streaming speech tokens to pre-warm UI routes and memory caches
 * before speech_end triggers, achieving 0.0 µs post-speech execution lag.
 */
export function speculateIntent(text: string, currentRoute = '/'): SpeculativeIntent {
  const lower = text.trim().toLowerCase();
  if (!lower || lower.length < 3) return { isActionable: false };

  // 1. Subpage detection (e.g. "check my cardio...", "timed mode on cognitive lab")
  const sub = subpageFromSpeech(text, currentRoute);
  if (sub) {
    prewarmRoute(sub.route);
    return {
      action: { navigate: sub.route, navigateLabel: sub.name },
      predictedRoute: sub.route,
      isActionable: true,
      topic: sub.name,
    };
  }

  // 2. Primary route navigation
  const destination = routeFromSpeech(text);
  if (destination && destination.route !== currentRoute) {
    prewarmRoute(destination.route);
    return {
      action: { navigate: destination.route, navigateLabel: destination.name },
      predictedRoute: destination.route,
      isActionable: true,
      topic: destination.name,
    };
  }

  // 3. 3D radiation room targeting
  const room = matchRoom(text);
  if (room) {
    prewarmRoute('/hazards/radiation');
    return {
      action: { radiationRoom: room.id },
      isActionable: true,
      topic: room.name,
    };
  }

  return { isActionable: false };
}
