/**
 * Ask Sol: rules for every reply. Pure and deterministic, so they are unit-tested.
 *
 * Order matters, safety first:
 *  1. crisis words      → talk to the crew medical officer or a crewmate now (no counselling);
 *  2. emergencies       → the exact first-aid / habitat steps to take now (emergency.ts);
 *  3. medicine / dose / diagnosis requests → politely declined (Sol Check never prescribes or diagnoses);
 *  4. everyday greetings, farewells and help;
 *  5. "my …" questions  → the person's own readings, baseline and findings;
 *  6. everything else   → passages from Sol Check's cited knowledge, or "I only answer from…".
 */
import type { DailyCheckin, MetricId, RiskAssessment } from '../../contracts';
import { METRICS } from '../../contracts';
import { PLAIN_FIELD_LABEL, PLAIN_NEXT_STEP, plainFinding } from '../../content/plainLanguage';
import { metricBaseline, usableMeasurement } from '../../engine';
import { KnowledgeIndex, tokenize, type KnowledgeDoc } from './knowledge';
import type { MissionEvidence } from './missionAnswers';
import { URGENT_CREW, URGENT_CRISIS } from './urgentSpeech';
import { emergencySources, emergencyTurn, matchEmergency } from './emergency';

export interface AssistantContext {
  crewName: string;
  sol: number;
  oneWayDelayMinutes: number;
  latest: DailyCheckin | null;
  assessment: RiskAssessment | null;
  history: readonly DailyCheckin[];
  mission?: MissionEvidence;
}

export type ReplyKind = 'help' | 'farewell' | 'crisis' | 'urgent' | 'declined' | 'personal' | 'answer' | 'out_of_scope' | 'mood_start';

export interface AssistantReply {
  kind: ReplyKind;
  text: string;
  /** cited passages the answer was built from */
  sources: KnowledgeDoc['cite'][];
  suggestions?: string[];
  /** emergency steps spoken in this reply, shown as a numbered list */
  steps?: string[];
  /** number of the first item in `steps` */
  stepStart?: number;
  /** id of the emergency protocol this reply belongs to */
  emergency?: string;
}

/** Below this BM25 score the question is treated as outside Sol Check's knowledge. */
export const MIN_SCORE = 4;

const CRISIS = /\b(suicid\w*|kill (my ?self|me)|end (my|it all)|want to die|wanna die|self[- ]?harm|hurt (my ?self)|hopeless|can'?t cope|cannot cope|no reason to live|give up on life)\b/i;
const URGENT = /\b(chest pain|crushing chest|can'?t breathe|cannot breathe|struggling to breathe|fainted|passed out|unconscious|severe bleeding|bleeding heavily|seizure|stroke|face drooping)\b/i;
const MEDICINE = /\b(medicine|medicines|medication|drug|drugs|pill|pills|tablet|tablets|dose|dosage|prescri\w*|antibiotic\w*|painkiller\w*|ibuprofen|paracetamol|acetaminophen|aspirin|melatonin|sleeping pill|should i take|what can i take)\b/i;
const DIAGNOSIS = /\b(diagnos\w*|do i have|have i got|am i sick|is it (cancer|serious)|what disease)\b/i;
// Voice transcription often hears "mood" as "mode" or "mud".
const MOOD = /\b((mood|mode|mud|moon) (check|chat|test)|check (my|in on my) (mood|mode)|how i feel|my feelings|feel(ing)? (sad|down|low|stressed|anxious|lonely|overwhelmed|tired)|i'?m (sad|down|low|stressed|anxious|lonely|overwhelmed))\b/i;
// Whisper can transcribe the assistant's name as "Soul" or "Saul".
const GREETING = /^(?:hi|hello|hey|salam|marhaba|good (?:morning|afternoon|evening))\b(?:[\s,.!?]+(?:there|sol|soul|saul)\b)*[\s,.!?;:–—-]*/i;
const HELP = /^(?:help(?: me)?|what can you do|who are you)[.!?]*$/i;
const HOW_ARE_YOU = /^(?:(?:(?:so[, ]+)?(?:(?:i['’]?m|i am)\s+)?(?:(?:doing|feeling|feel)\s+)?(?:great|good|well|fine|okay|ok|awesome)[,.\s]+)*(?:so[, ]+)?(?:how are you(?: doing)?(?: today)?|how['’]?s it going|how do you feel|what about you|what about yourself|how about you|how about yourself|and you|and yourself))(?:[, ]+(?:sol|soul|saul))?[.!?]*$/i;
const USER_WELL = /^(?:(?:so[, ]+)?(?:(?:i['’]?m|i am)\s+)?(?:(?:doing|feeling|feel)\s+)?(?:great|good|well|fine|okay|ok|awesome|wonderful|pretty good|alright|all right)|all good|not bad)[.!?]*$/i;
const THANKS = /^(?:thanks|thank you)(?: so much| very much| a lot)?(?:[, ]+(?:sol|soul|saul))?[.!?]*$/i;
const FAREWELL = /^(?:(?:okay|ok|thanks|thank you)[\s,.!?]+)*(?:good[ -]?bye|bye(?:[- ]bye)?|see you(?: later| soon| around)?|talk to you later|take care|good night)(?:[, ]+(?:sol|soul|saul))?[.!?]*$/i;
const STARTERS = ['How am I doing today?', 'Why does CO2 cause headaches?', 'Start a mood check'];
const PERSONAL = /\b(my|mine|me|am i|i am|i'm|how am i|today'?s)\b/i;
const SUMMARY = /\b(how am i( doing)?|my (results|assessment|status|health)|what should i do|what do i do|anything wrong|am i ok(ay)?)\b/i;

const METRIC_WORDS: [RegExp, MetricId][] = [
  [/\b(standing systolic)\b/i, 'bp_systolic_standing'],
  [/\b(standing diastolic)\b/i, 'bp_diastolic_standing'],
  [/\b(hrv|heart rate variability)\b/i, 'hrv_rmssd'],
  [/\b(standing (pulse|heart))\b/i, 'heart_rate_standing'],
  [/\b(heart ?rate|pulse|bpm|heartbeat)\b/i, 'heart_rate'],
  [/\b(blood pressure|bp|systolic)\b/i, 'bp_systolic'],
  [/\bdiastolic\b/i, 'bp_diastolic'],
  [/\b(temperature|temp|fever)\b/i, 'body_temp'],
  [/\b(sugar|glucose)\b/i, 'blood_glucose'],
  [/\b(sleep|slept)\b/i, 'sleep_duration'],
  [/\bmood\b/i, 'mood'],
  [/\b(breathing|breath|respiratory)\b/i, 'respiratory_rate'],
  [/\b(voice pitch|pitch movement)\b/i, 'voice_pitch_variability'],
  [/\b(speaking pace|articulation rate)\b/i, 'voice_articulation_rate'],
  [/\b(time in pauses|voice pause)\b/i, 'voice_pause_ratio'],
  [/\b(water|fluid|drink)\w*/i, 'fluid_intake'],
  [/\b(exercise|workout|training)\b/i, 'exercise_minutes'],
  [/\b(calorie|food|eat|kcal)\w*/i, 'calorie_intake'],
  [/\b(weight|body mass)\b/i, 'body_mass'],
];

const fmt = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

function personalMetric(metric: MetricId, ctx: AssistantContext): AssistantReply {
  const name = (PLAIN_FIELD_LABEL[metric] ?? METRICS[metric].label).toLowerCase();
  const unit = METRICS[metric].unitLabel;
  const reading = ctx.latest ? usableMeasurement(ctx.latest, metric) : undefined;
  if (!ctx.latest || !reading) {
    return { kind: 'personal', text: `There is no ${name} reading in your Sol ${ctx.latest?.sol ?? ctx.sol} check-in yet. You can add it in the check-in, where "How to measure" explains each step.`, sources: [{ label: 'Your check-in', route: '/check-in' }] };
  }
  const baseline = metricBaseline(metric, ctx.latest, ctx.history);
  const parts = [`Your ${name} on Sol ${ctx.latest.sol}: ${fmt(reading.value)} ${unit}.`];
  parts.push(baseline
    ? `Your usual (the middle of your last ${baseline.count} readings) is ${fmt(baseline.median)} ${unit}.`
    : 'There are not enough earlier readings yet to know your usual.');
  const related = ctx.assessment?.findings.filter((f) => f.baselineUsed.some((b) => b.metric === metric) || f.inputMeasurementIds.includes(reading.id)) ?? [];
  parts.push(related.length ? related.map((f) => plainFinding(f)).join(' ') : 'Sol Check found nothing unusual about it today.');
  if (reading.provenance === 'synthetic_demo') parts.push('(This is a synthetic demo reading.)');
  return { kind: 'personal', text: parts.join(' '), sources: [{ label: `Your Sol ${ctx.latest.sol} assessment`, route: '/assessment' }] };
}

function personalSummary(ctx: AssistantContext): AssistantReply {
  if (!ctx.assessment) return { kind: 'personal', text: 'You have not saved a check-in yet. Once you do, I can tell you what changed compared with your usual.', sources: [{ label: 'Check-in', route: '/check-in' }] };
  const next = PLAIN_NEXT_STEP[ctx.assessment.recommendedTier];
  const findings = ctx.assessment.findings.slice(0, 3).map((f) => plainFinding(f));
  return {
    kind: 'personal',
    text: [`${next.title}. ${next.action}`, ...findings].join(' '),
    sources: [{ label: `Your Sol ${ctx.latest?.sol ?? ctx.sol} assessment`, route: '/assessment' }],
    suggestions: ['Why is my sleep flagged?', 'What is HRV?', 'Start a mood check'],
  };
}

/** Split on sentence ends only: a full stop followed by a space and a capital (keeps "15.38" and "e.g." intact). */
function firstSentences(text: string, max = 3): string {
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z(“"])/);
  return sentences.slice(0, max).join(' ').trim();
}

const DEFINITION = /^\s*(what('?s| is| are| does)|define|meaning of|explain|how long is|tell me what)\b/i;

/** "What is X?" → the plain glossary entry for X, when the question names a glossary term. */
function glossaryAnswer(q: string, index: KnowledgeIndex): AssistantReply | null {
  if (!DEFINITION.test(q)) return null;
  const lower = q.toLowerCase();
  const match = index.docs
    .filter((doc) => doc.kind === 'glossary')
    .map((doc) => ({ doc, names: [doc.title, ...(doc.title.match(/\(([^)]+)\)/)?.[1] ? [doc.title.match(/\(([^)]+)\)/)![1]] : []), doc.title.replace(/\s*\(.*\)/, '')] }))
    .flatMap(({ doc, names }) => names.map((name) => ({ doc, name: name.toLowerCase().trim() })))
    .filter(({ name }) => name.length >= 3 && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (!match) return null;
  // Add one more cited sentence only if that passage is about the same term (its title names it).
  const termTokens = new Set(tokenize(match.name));
  const more = index.search(q, 5).find((h) => h.doc.kind !== 'glossary' && h.score >= MIN_SCORE
    && tokenize(h.doc.title).some((token) => termTokens.has(token)));
  return {
    kind: 'answer',
    text: `${match.doc.title}: ${match.doc.text}${more ? ` ${firstSentences(more.doc.text, 2)}` : ''}`,
    sources: [match.doc.cite, ...(more ? [more.doc.cite] : [])],
  };
}

export function respond(question: string, ctx: AssistantContext, index: KnowledgeIndex, intentsOnly = false): AssistantReply {
  let q = question.trim();
  if (!q) return { kind: 'help', text: 'Ask me anything about your health check-in, life on the mission, or the NASA research Sol Check uses.', sources: [] };

  if (CRISIS.test(q)) {
    return {
      kind: 'crisis',
      text: `${URGENT_CRISIS} You do not have to wait ${ctx.oneWayDelayMinutes * 2} minutes for Earth. Stay with someone and take a break from critical tasks.`,
      sources: [{ label: 'Talk to someone now (action card)', route: '/assessment' }, { label: 'NASA behavioral health risk', url: 'https://www.nasa.gov/directorates/esdmd/hhp/risk-of-adverse-cognitive-or-behavioral-conditions-and-psychiatric-disorders' }],
    };
  }
  const emergency = matchEmergency(q);
  if (emergency) {
    const turn = emergencyTurn(emergency);
    return {
      kind: 'urgent', text: turn.text, steps: turn.steps, stepStart: turn.start, emergency: emergency.id,
      sources: emergencySources(emergency),
    };
  }
  if (URGENT.test(q)) {
    return { kind: 'urgent', text: `${URGENT_CREW} Follow your crew’s emergency procedure. Don’t wait for a check-in or for Earth.`, sources: [{ label: 'Crew medical officer console', route: '/cmo' }] };
  }
  if (MEDICINE.test(q) || DIAGNOSIS.test(q)) {
    // Share related, non-treatment facts about the topic only (e.g. the headache), never about the medicine.
    const topic = q.replace(MEDICINE, ' ').replace(DIAGNOSIS, ' ').replace(/\b(take|taking|use|using|need|give|get|should|can|could|for|best|good)\b/gi, ' ');
    const hit = tokenize(topic).length ? index.search(topic, 1)[0] : undefined;
    const extra = hit && hit.score >= MIN_SCORE ? ` What I can share: ${firstSentences(hit.doc.text, 2)}` : '';
    return {
      kind: 'declined',
      text: `I can’t recommend medicines, doses or diagnoses. Your crew medical officer decides on treatment, with the flight surgeon on Earth when needed.${extra}`,
      sources: hit && hit.score >= MIN_SCORE ? [hit.doc.cite] : [{ label: 'Crew medical officer console', route: '/cmo' }],
    };
  }
  const firstName = ctx.crewName.split(' ')[0];
  const greeting = q.match(GREETING)?.[0];
  if (greeting) {
    q = q.slice(greeting.length);
    if (!q) {
      return { kind: 'help', text: `Hi ${firstName}! What can I help you with today?`, sources: [], suggestions: STARTERS };
    }
  }
  if (FAREWELL.test(q)) {
    return { kind: 'farewell', text: `Goodbye, ${firstName}. Take care!`, sources: [] };
  }
  if (HOW_ARE_YOU.test(q)) {
    const hasUserWell = /\b(?:great|good|well|fine|okay|ok|awesome)\b/i.test(q);
    return {
      kind: 'help',
      text: hasUserWell
        ? `I’m glad to hear that, ${firstName}! I’m doing well too, thanks for asking. Ready to help with your check-in or show you around.`
        : 'I’m here and ready to help. How are you doing today?',
      sources: [],
      suggestions: STARTERS,
    };
  }
  if (USER_WELL.test(q)) {
    return {
      kind: 'help',
      text: `Glad to hear you’re doing well, ${firstName}! I’m here whenever you want to log your check-in, review habitat air, or look over Sol 43.`,
      sources: [],
      suggestions: STARTERS,
    };
  }
  if (THANKS.test(q)) {
    return { kind: 'help', text: 'You’re welcome! I’m here if you need anything else.', sources: [] };
  }
  if (HELP.test(q)) {
    return {
      kind: 'help',
      text: `Hi ${firstName}. I answer only from Sol Check’s NASA-based health information and your own check-in, and I show where each answer comes from. I can explain your results, how to measure something, why it matters in space, the five spaceflight hazards, or the real NASA data in the app. I can also run a short mood check. I don’t diagnose or recommend medicines.`,
      sources: [],
      suggestions: STARTERS,
    };
  }
  if (MOOD.test(q)) {
    return { kind: 'mood_start', text: 'Let’s do a short mood check: six quick questions, about one minute. Pick the answer closest to how you feel right now.', sources: [{ label: 'Sol Check mood questions', route: '/check-in' }] };
  }
  if (intentsOnly) return { kind: 'help', text: '', sources: [] };
  if (SUMMARY.test(q)) return personalSummary(ctx);
  if (PERSONAL.test(q)) {
    if (/\b(?:blood pressure|bp)\b/i.test(q) && !/\b(?:systolic|diastolic)\b/i.test(q)) {
      const standing = /\bstanding\b/i.test(q);
      const top = ctx.latest && usableMeasurement(ctx.latest, standing ? 'bp_systolic_standing' : 'bp_systolic');
      const bottom = ctx.latest && usableMeasurement(ctx.latest, standing ? 'bp_diastolic_standing' : 'bp_diastolic');
      return { kind: 'personal', text: top && bottom
        ? `Your ${standing ? 'standing' : 'seated'} blood pressure on Sol ${ctx.latest?.sol} was ${top.value} over ${bottom.value} millimetres of mercury.${[top, bottom].some(x => x.provenance === 'synthetic_demo') ? ' This pair includes demo data.' : ''}`
        : 'There is no complete usable blood pressure pair in your latest saved check-in.', sources: [{ label: 'Your check-in', route: '/check-in' }] };
    }
    const metric = METRIC_WORDS.find(([pattern]) => pattern.test(q))?.[1];
    if (metric) return personalMetric(metric, ctx);
  }

  const definition = glossaryAnswer(q, index);
  if (definition) return definition;

  const hits = index.search(q, 3);
  const best = hits[0];
  if (!best || best.score < MIN_SCORE) {
    return {
      kind: 'out_of_scope',
      text: 'I only answer from Sol Check’s NASA health information and your check-in, and I couldn’t find that there. Try asking about a reading, a spaceflight hazard, the Sol 43 mission or the NASA data in the app.',
      sources: [],
      suggestions: ['What is SANS?', 'How do I measure blood pressure?', 'What happened on Sol 41?'],
    };
  }
  const supporting = hits.slice(1).find((h) => h.score >= best.score * 0.75 && h.doc.kind !== best.doc.kind);
  const text = [`${best.doc.title}. ${firstSentences(best.doc.text, 3)}`, supporting ? `Also: ${firstSentences(supporting.doc.text, 2)}` : '']
    .filter(Boolean).join(' ');
  return { kind: 'answer', text, sources: [best.doc.cite, ...(supporting ? [supporting.doc.cite] : [])] };
}
