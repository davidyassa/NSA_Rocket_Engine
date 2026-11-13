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
import { TOUR_ROUTES, describePage, guideFor, routeFromSpeech } from './pageGuides';
import { checkinCommand, type CheckinPatch } from './checkinCommands';
import { missionAnswer } from './missionAnswers';
import { URGENT_HABITAT } from './urgentSpeech';

export interface DialogueState {
  /** what we last talked about, for follow-up questions */
  topic: { question: string; cards: string[]; label: string; why?: string } | null;
  turns: number;
  /** position in the guided tour of the tabs, or null when not touring */
  tour?: number | null;
}

export const newDialogue = (): DialogueState => ({ topic: null, turns: 0, tour: null });

/** Something the screen should do after the reply (go to another tab). */
export interface DialogueAction {
  navigate?: string;
  checkin?: CheckinPatch;
  scroll?: 'up' | 'down' | 'top' | 'bottom';
  routine?: { id: string; checked: boolean };
  timeline?: 'play' | 'pause' | 'next' | 'back' | 'restart';
}

const WHERE = /\b(where am i|what('?s| is) this (page|tab|screen|place)|what (page|tab|screen) is this|help me( here| on this (page|tab))?|what (can|do|should) i do (here|on this (page|tab))|how (do i|to) use (this|it)( page| tab| screen)?|explain this( page| tab| screen)?|guide me( here)?)\b/i;
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

const HABITAT_EMERGENCY = /\b(oxygen (is |feels |seems )?(low|thin|running out)|low oxygen|not enough (oxygen|air)|air (is |feels )?(thin|stale|bad)|can'?t get (enough )?air|smell (of )?(smoke|burning)|smoke|fire|alarm|pressure (drop|leak|loss)|leak(ing)? air|depressuri[sz]\w*)\b/i;

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
const HOW_ARE_YOU = /\bhow are you\b|\bhow'?s it going\b|\bhow do you feel\b/i;
const GREETING = /^(hi|hello|hey|good (morning|afternoon|evening)|salam|marhaba)\b/i;
const THANKS = /\b(thanks|thank you|appreciate it)\b/i;
const LOVE = /\b(i love you|you'?re (great|awesome|amazing|the best))\b/i;

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

function smallTalk(sentence: string, ctx: AssistantContext): string | null {
  const first = ctx.crewName.split(' ')[0];
  if (HOW_OLD.test(sentence)) return 'I’m very young: I was built for the 2026 NASA Space Apps Challenge. Old enough to know a lot about crew health, though!';
  if (WHO_MADE.test(sentence)) return 'A team of six students made me for the NASA Space Apps Challenge, to help astronauts look after their health far from Earth.';
  if (ARE_YOU_AI.test(sentence)) return 'I’m Sol, a helper inside Sol Check, not a person and not a doctor. I only use Sol Check’s cited NASA health information and your own check-in.';
  if (NAME.test(sentence)) return 'I’m Sol, your health check-in helper.';
  if (LOVE.test(sentence)) return `That’s kind of you, ${first}. I’m glad I can help.`;
  if (HOW_ARE_YOU.test(sentence)) return `I’m doing well, thanks for asking! More importantly, how are you feeling today, ${first}?`;
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

function habitatReply(): AssistantReply {
  const { steps, sources } = cardSteps(['co2-check'], 2);
  return {
    kind: 'urgent',
    text: `${URGENT_HABITAT} Don’t wait for Earth. If you feel short of breath, confused or very drowsy, tell your crew medical officer straight away. ${steps.length ? `Once you’re safe: ${steps.map((s) => s.replace(/\.$/, '')).join('. ')}.` : ''}`.trim(),
    sources: [...sources, { label: 'Habitat air on the Timeline', route: '/timeline' }],
  };
}

/** One turn of conversation: returns the reply and the updated memory. */
export function converse(utterance: string, state: DialogueState, ctx: AssistantContext, index: KnowledgeIndex, page = '/', search = ''): { reply: AssistantReply; state: DialogueState; action?: DialogueAction } {
  const sentences = cleanSpeech(utterance);
  const whole = sentences.join(' ');
  const turns = state.turns + 1;

  // 1. Safety first, on everything that was said.
  const safety = respond(whole, ctx, index, true);
  if (safety.kind === 'crisis' || safety.kind === 'urgent') return { reply: safety, state: { topic: null, turns } };
  if (HABITAT_EMERGENCY.test(whole)) return { reply: habitatReply(), state: { topic: { question: 'habitat air CO2 oxygen', cards: ['co2-check'], label: 'habitat air' }, turns } };
  if (safety.kind === 'declined') return { reply: safety, state: { ...state, turns } };
  if (safety.kind === 'farewell') return { reply: safety, state: newDialogue() };
  const scroll = whole.match(/^(?:please )?(?:scroll|go) (?:to (?:the )?)?(up|down|top|bottom)(?: of (?:this|the) page)?[.!]*$/i)?.[1]?.toLowerCase();
  if (scroll === 'up' || scroll === 'down' || scroll === 'top' || scroll === 'bottom') return {
    reply: { kind: 'help', text: `Scrolling ${scroll === 'up' || scroll === 'down' ? scroll : `to the ${scroll}`}.`, sources: [] },
    state: { ...state, turns }, action: { scroll },
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
  if (WHERE.test(whole)) {
    const guide = guideFor(page);
    return { reply: { kind: 'help', text: describePage(guide), sources: [{ label: guide.name.replace(/^the /, ''), route: guide.route }], suggestions: [guide.tryAsking, 'Give me a tour'] }, state: { ...state, turns } };
  }
  const mission = missionAnswer(whole, ctx, page, search);
  if (mission) return { reply: mission, state: { ...state, turns } };

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
  const chat = sentences.map((s) => smallTalk(s, ctx)).filter((t): t is string => Boolean(t));
  const questions = sentences.filter((s) => !smallTalk(s, ctx));
  if (chat.length && !questions.length) {
    return { reply: { kind: 'help', text: [...new Set(chat)].join(' '), sources: [], suggestions: ['How am I doing today?', 'What happened on Sol 41?', 'Start a mood check'] }, state: { ...state, turns } };
  }

  // 5. The cited answer engine for the real question.
  const reply = respond(questions.join(' ') || whole, ctx, index);
  const lead = chat.length ? `${[...new Set(chat)].join(' ')} ` : '';
  const topic = reply.kind === 'answer' || reply.kind === 'personal'
    ? { question: questions.join(' ') || whole, cards: [], label: (reply.sources[0]?.label ?? 'that').toLowerCase() }
    : state.topic;
  if (reply.kind === 'out_of_scope' && chat.length) {
    return { reply: { kind: 'help', text: [...new Set(chat)].join(' '), sources: [], suggestions: ['How am I doing today?', 'What happened on Sol 41?', 'Start a mood check'] }, state: { ...state, turns } };
  }
  if (reply.kind === 'out_of_scope') {
    return {
      reply: { ...reply, text: `${lead}Hmm, that one’s outside what I know. I stick to Sol Check’s NASA health information and your check-in, so I don’t make things up. You could ask me how you’re doing today, about a symptom, or what happened on Sol 41.` },
      state: { ...state, turns },
    };
  }
  return { reply: { ...reply, text: `${lead}${reply.text}` }, state: { topic, turns } };
}
