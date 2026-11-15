import { ACTION_CARDS, SOURCES } from '../../content';
import { kitSummary, KIT_STATUS_TEXT } from '../../content/medicalKit';
import { plainFinding } from '../../content/plainLanguage';
import { METRIC_IDS, METRICS, type DemoScenario } from '../../contracts';
import { RADLAB_SOURCE } from '../../data/nasa';
import { INSPIRATION4_SOURCE, analyzeInspiration4 } from '../../data/nasa/inspiration4';
import { CO2_LIMIT_MMHG } from '../../engine/rules';
import { radlabEventSol } from '../../sim';
import { usableMeasurement } from '../../engine';
import type { VigilanceSession } from '../cognitive/vigilance';
import type { FollowUpTask } from '../followups/followUpEngine';
import type { IsolationPlan } from '../hazards/isolationPlan';
import type { AssistantContext, AssistantReply } from './respond';
import { guideFor } from './pageGuides';

export interface MissionEvidence {
  scenario: DemoScenario;
  vigilance: readonly VigilanceSession[];
  followUps: readonly FollowUpTask[];
  isolation?: IsolationPlan;
  routine?: readonly { id: string; label: string; checked: boolean; recorded: boolean }[];
  timelineSol?: number;
  checkinDraft?: { page: string; readings: Partial<Record<string, string>>; symptoms: readonly string[]; note: string };
  officerReview?: { signed: boolean; notes?: string };
  radiation?: { status: string; label?: string; frame?: number; room?: string; doseRate: number | null; origin: string };
}

const source = (label: string, route: string, url?: string) => ({ label, route, url });
const co2Source = source('Habitat air · NASA CO₂ technical brief', '/timeline', SOURCES['nasa-co2-brief']?.url ?? undefined);
const riskSource = source('NASA safety and decision support', '/hazards/distance', 'https://www.nasa.gov/reference/jsc-safety-decision-support/');
const PROFILE = /\b(?:my (?:name|role|profile|crew member|notes?|remarks?|symptoms|check[ -]?in history)|who am i)\b/i;
const VITALS = /\b(?:my|saved|recorded|latest) (?:health )?(?:vitals|readings|measurements)\b/i;
const FOLLOW_UP = /\b(?:follow[ -]?ups?|action items?|(?:my|suggested|recommended|next) (?:actions?|steps?)|what (?:should|do) i do next)\b/i;
const MISSION = /\b(?:surviv(?:e|al)|mission (?:risk|feasibility|readiness)|(?:review|assess|evaluate|plan) (?:the |a |my |this )?mission|(?:can|should) (?:we|i) (?:do|attempt|continue|start) (?:the |an? |my |this )?(?:mission|eva|spacewalk))\b/i;

function minutesFromDuration(value: string, units: string) {
  return Number(value) * (/^hour/i.test(units) ? 60 : 1);
}

function followUps(ctx: AssistantContext): AssistantReply {
  const open = ctx.mission?.followUps.filter(task => task.status !== 'resolved') ?? [];
  const steps = ctx.assessment?.actionCardIds.flatMap(id => ACTION_CARDS[id]?.steps.slice(0, 1) ?? []) ?? [];
  const cards = ctx.assessment?.actionCardIds.flatMap(id => ACTION_CARDS[id]?.sourceRefs.slice(0, 1) ?? []) ?? [];
  const text = [
    open.length ? `Open follow-ups: ${open.slice(0, 4).map(task => `${task.title} (${task.status.replaceAll('_', ' ')}, ${task.priority} priority)`).join('; ')}.` : 'There are no open follow-up tasks.',
    ...steps.slice(0, 3),
  ].join(' ');
  return { kind: 'personal', text, sources: [
    source('Crew Medical Officer follow-ups', '/cmo'),
    ...[...new Set(cards)].map(id => source(SOURCES[id]?.title ?? id, '/assessment', SOURCES[id]?.url ?? undefined)),
  ] };
}

export function missionAnswer(question: string, ctx: AssistantContext, page: string, search = ''): AssistantReply | undefined {
  const data = ctx.mission;
  const summary = /^(?:summari[sz]e|review|describe|explain)(?: (?:this|the|my|current))? (?:page|tab|data)(?: here)?[.!?]*$/i.test(question);
  const sol = data?.scenario.startSol ?? ctx.sol;
  const matchSol = question.match(/\bsol\s+(\d+)\b/i);
  const requestedSol = matchSol ? Number(matchSol[1]) : page === '/timeline' ? data?.timelineSol ?? sol : sol;
  const habitat = data?.scenario.environment?.find(sample => sample.sol === requestedSol);
  const followupQuery = FOLLOW_UP.test(question);

  if (MISSION.test(question) || /\b(?:i am|i'm|we are|we're|i plan to|we plan to|planning)\s+(?:going on |to do |an? )?(?:eva|spacewalk|mission|surface traverse)\b/i.test(question)) {
    const today = ctx.history.findLast(record => record.sol === sol);
    const assessment = today?.id === ctx.assessment?.checkinId ? ctx.assessment : null;
    const currentAir = data?.scenario.environment?.find(sample => sample.sol === sol);
    const isEva = /\b(eva|spacewalk|surface traverse)\b/i.test(question);
    const duration = question.match(/\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|thirty|sixty)\s*[- ]?\s*(?:minutes?|hours?|days?|sols?)\b/i)?.[0];
    const sources = [riskSource, source('Recorded health assessment', '/assessment')];
    const usable = today ? METRIC_IDS.flatMap(metric => usableMeasurement(today, metric) ?? []) : [];
    const details = [
      `Confirm the ${duration ? `${duration} ` : ''}${isEva ? 'EVA' : 'mission'} plan and abort criteria with mission operations and the crew medical officer.`,
      'Mission survival is undetermined. A validated mission risk model and vehicle reliability data are needed for a probability.',
      today ? `Sol ${sol} has ${usable.length} usable check-in readings.` : `There is no saved check-in for Sol ${sol}.`,
    ];
    const planTime = question.match(/\b(\d+(?:\.\d+)?)\s*[- ]?\s*(minutes?|hours?)\s+(?:eva|spacewalk|surface traverse)\b/i);
    const oxygenTime = question.match(/\b(?:oxygen|life support)\s+(?:will last|lasts?|for|has)\s+(\d+(?:\.\d+)?)\s*(minutes?|hours?)\b/i);
    const reserveTime = question.match(/\b(\d+(?:\.\d+)?)\s*[- ]?\s*(minutes?|hours?)\s+(?:of\s+)?(?:oxygen\s+)?reserve\b/i);
    if (isEva && planTime && oxygenTime) {
      const planned = minutesFromDuration(planTime[1], planTime[2]);
      const available = minutesFromDuration(oxygenTime[1], oxygenTime[2]);
      const margin = Math.round((available - planned) * 10) / 10;
      const reserve = reserveTime ? minutesFromDuration(reserveTime[1], reserveTime[2]) : null;
      if (Number.isFinite(margin)) details.unshift(margin < 0
        ? `The oxygen duration you gave is ${-margin} minutes shorter than the planned EVA. Revise the plan with mission operations before proceeding.`
        : `The oxygen duration you gave covers the planned EVA with ${margin} minutes left over. Confirm the required reserve and return time with mission operations.`);
      if (reserve !== null && Number.isFinite(reserve - margin) && margin < reserve) {
        const shortfall = Math.round((reserve - margin) * 10) / 10;
        details.unshift(`The plan is infeasible with those numbers. The stated supply is ${shortfall} minutes short once the stated reserve is included. Work with mission operations to shorten the plan by at least ${shortfall} minutes or verify that much additional supply. Keep the reserve intact.`);
      }
    }
    if (assessment?.recommendedTier !== undefined && assessment.recommendedTier !== 'self_care') {
      details.push(ACTION_CARDS['crew-review'].steps[0]);
    }
    if (assessment?.findings.length) details.push(...assessment.findings
      .filter(finding => finding.kind !== 'data_unavailable').slice(0, 2).map(plainFinding));
    const unresolved = data?.followUps.filter(task => task.status !== 'resolved' && ['urgent', 'high'].includes(task.priority)) ?? [];
    if (unresolved.length) {
      details.push(`Bring these active follow-ups to the crew medical officer: ${unresolved.slice(0, 2).map(task => task.title).join(', ')}.`);
      sources.push(source('Crew Medical Officer follow-ups', '/cmo'));
    }
    if (currentAir) {
      sources.push(co2Source);
      details.push(`Sol ${sol} cabin CO₂ is ${currentAir.co2Mmhg} millimetres of mercury in the simulation.`);
      if (currentAir.co2Mmhg >= CO2_LIMIT_MMHG) details.push('Have the life-support lead verify current cabin air and resolve any limit exceedance before relying on the cabin environment.');
    }
    if (data?.radiation) {
      details.push(`The radiation monitor currently shows ${data.radiation.status} in its replay.`);
      if (isEva && ['RED', 'ORANGE'].includes(data.radiation.status)) {
        details.push('The replay shows a storm scenario. To revise that EVA, move it outside the storm window and verify actual radiation telemetry and exposure limits with mission operations.');
      }
      sources.push(source('Radiation monitor replay', '/hazards/radiation'));
    }
    const vigilance = data?.vigilance.filter(item => item.sol === sol).at(-1);
    if (vigilance) {
      details.push(`The latest cognitive check today logged ${vigilance.lapsesCount} lapses and ${vigilance.missedCount} missed trials.`);
      sources.push(source('Cognitive Lab logs', '/cognitive'));
    }
    if (isEva) {
      details.push('Confirm suit consumables and reserve, exposure limits, route, communications and the return or rescue plan.');
      sources.push(source('NASA EVA risk', '/hazards', 'https://www.nasa.gov/reference/risk-of-injury-and-compromised-performance-from-extravehicular-activity-eva/'));
    } else details.push('Confirm duration, crew and vehicle, actual life-support readings, consumable reserves and rescue options.');
    return { kind: 'personal', text: details.join(' '), sources };
  }
  const currentTab = new URLSearchParams(search).get('tab') ?? 'triage';
  if (followupQuery || (summary && (page === '/assessment' || (page === '/cmo' && currentTab === 'actions')))) return followUps(ctx);
  if (/\b(?:routine|daily) checklist\b/i.test(question) || (summary && page === '/')) {
    const items = data?.routine ?? [];
    const outstanding = items.filter(item => !item.checked);
    return { kind: 'personal', text: `On Sol ${sol}, ${items.length - outstanding.length} of ${items.length} routine items are complete.${outstanding.length ? ` Still open: ${outstanding.map(item => item.label).join(', ')}.` : ''} ${ctx.latest?.sol === sol ? 'Today’s check-in is saved.' : 'Today’s check-in is pending.'}`, sources: [source('Dashboard routine and check-in', '/')] };
  }
  if (/\b(?:sign[ -]?off|signed off|officer review status)\b/i.test(question) || (summary && page === '/cmo' && currentTab === 'triage')) {
    const review = data?.officerReview;
    return { kind: 'personal', text: review?.signed ? `The crew medical officer console shows a sign-off in this session.${review.notes ? ` Recorded note: ${review.notes}` : ''}`
      : 'No crew medical officer sign-off is recorded in this session.', sources: [source('Crew Medical Officer triage', '/cmo?tab=triage')] };
  }
  if (summary && page === '/cmo' && currentTab !== 'kit') {
    const findings = ctx.assessment?.findings.filter(item => item.kind !== 'data_unavailable').slice(0, 2).map(plainFinding) ?? [];
    const detail = currentTab === 'quality' ? ctx.assessment?.dataQualityWarnings.join(' ') || 'No assessment warnings are recorded.'
      : currentTab === 'telemetry' ? `One-way communications delay is ${ctx.oneWayDelayMinutes} minutes in this scenario.`
      : findings.join(' ') || 'There are no recorded findings to summarize.';
    return { kind: 'personal', text: detail, sources: [source('Crew Medical Officer console', `/cmo?tab=${currentTab}`), source('Assessment evidence', '/assessment')] };
  }
  if ((summary && page === '/check-in') || /\b(?:my|current|check[ -]?in) draft\b/i.test(question)) {
    const draft = data?.checkinDraft;
    return { kind: 'personal', text: draft ? [
      `The check-in is on ${draft.page}.`,
      METRIC_IDS.flatMap(metric => draft.readings[metric] ? [`${METRICS[metric].label}: ${draft.readings[metric]} ${METRICS[metric].unitLabel}`] : []).join('. '),
      draft.symptoms.length ? `Selected symptoms: ${draft.symptoms.join(', ')}.` : 'No symptoms are selected.',
      draft.note ? `Draft note: ${draft.note}` : '',
    ].filter(Boolean).join(' ') : 'There is no open check-in draft.', sources: [source('Open check-in draft', '/check-in')] };
  }
  if (VITALS.test(question)) {
    const record = matchSol ? ctx.history.findLast(item => item.sol === requestedSol) : ctx.latest;
    const readings = record ? METRIC_IDS.flatMap(metric => {
      const reading = usableMeasurement(record, metric);
      if (!reading) return [];
      const { label, unitLabel } = METRICS[metric];
      return `${label}: ${reading.value} ${unitLabel}`;
    }) : [];
    return { kind: 'personal', text: readings.length ? `Saved readings for Sol ${record?.sol}. ${readings.join('. ')}.` : 'There are no usable saved readings for that check-in.', sources: [source('Saved check-in records', '/trends')] };
  }
  if (PROFILE.test(question)) {
    if (/notes?|remarks?/i.test(question)) return { kind: 'personal', text: ctx.latest?.note ? `Your recorded Sol ${ctx.latest.sol} note says: ${ctx.latest.note}` : 'There is no note in your latest saved check-in.', sources: [source('Saved check-in', '/check-in')] };
    if (/symptoms/i.test(question)) {
      const symptoms = ctx.latest?.symptoms.filter(item => item.present).map(item => item.label) ?? [];
      return { kind: 'personal', text: symptoms.length ? `Reported on Sol ${ctx.latest?.sol}: ${symptoms.join(', ')}.` : 'Your latest check-in has no recorded symptoms.', sources: [source('Saved check-in', '/check-in')] };
    }
    return { kind: 'personal', text: `${ctx.crewName}${data ? `, ${data.scenario.profile.role} at ${data.scenario.missionContext.habitat}` : ''}. ${ctx.history.length} check-ins are visible in this scenario.`, sources: [source('Crew profile', '/'), source('Check-in history', '/trends')] };
  }
  if (/\b(?:vigilance|reaction time|lapses?|cognitive (?:result|test))\b/i.test(question) || (summary && page === '/cognitive')) {
    const session = data?.vigilance.filter(item => !matchSol || item.sol === requestedSol).at(-1);
    if (session || summary || /\b(?:my|latest|sol)\b/i.test(question)) return { kind: 'personal', text: session
      ? `Sol ${session.sol} cognitive check: ${session.lapsesCount} lapses, ${session.missedCount} missed trials, ${session.falseStartsCount} false starts and ${session.meanRtMs === null ? 'no usable mean reaction time' : `a mean reaction time of ${session.meanRtMs} milliseconds`}.`
      : 'There is no saved cognitive check for that request.', sources: [source('Cognitive Lab logs', '/cognitive')] };
  }
  if (/\b(?:supplies|inventory|stock|expir(?:y|ed|ing))\b/i.test(question) || (summary && page === '/cmo' && currentTab === 'kit')) {
    const kit = kitSummary(sol);
    return { kind: 'personal', text: `Supplies on Sol ${sol}: ${kit.low} low, ${kit.expired} expired and ${kit.expiresSoon} expiring soon. ${kit.items.map(({ item, status }) => `${item.name}: ${item.quantity} ${item.unit}. ${KIT_STATUS_TEXT[status]}.`).join(' ')}`, sources: [source('Supplies on board', '/cmo')] };
  }
  if (/\b(?:isolation plan|countermeasure plan|my isolation)\b/i.test(question) || (summary && page === '/hazards/isolation')) {
    const plan = data?.isolation;
    return { kind: 'personal', text: plan ? `The isolation plan has ${plan.completed.length} completed items. ${plan.activity ? `Planned activity: ${plan.activity}.` : ''} ${plan.sleepAt ? `Planned sleep: ${plan.sleepAt}.` : ''}`.trim() : 'There is no saved isolation plan in this scenario.', sources: [source('Isolation plan', '/hazards/isolation')] };
  }
  if (/\b(?:radiation status|radiation monitor|compartment|dose rate|carn)\b/i.test(question) || (summary && page === '/hazards/radiation')) {
    const replay = data?.radiation;
    return { kind: 'personal', text: replay ? `The radiation replay shows ${replay.status}${replay.label ? ` — ${replay.label}` : ''}${replay.frame ? ` at sample ${replay.frame}` : ''}.${replay.room ? ` ${replay.room} has ${replay.doseRate === null ? 'no rate available' : `${replay.doseRate.toFixed(2)} millisieverts per hour, marked ${replay.origin}`}.` : ''}`
      : 'Open the radiation monitor to inspect the spacecraft replay and its compartment readings.', sources: [source('Radiation monitor replay', '/hazards/radiation')] };
  }
  if (/\b(?:habitat air|cabin (?:temperature|air|co2)|co2 reading)\b/i.test(question) && !/^why\b/i.test(question)) {
    if (habitat) return { kind: 'personal', text: `Sol ${requestedSol} habitat log: ${habitat.co2Mmhg} millimetres of mercury of CO₂ and cabin temperature ${habitat.cabinTempC} degrees Celsius.`, sources: [co2Source] };
    return { kind: 'personal', text: `There is no habitat reading for Sol ${requestedSol}.`, sources: [co2Source] };
  }
  if (data && (/\b(?:mission events?|what happened)\b/i.test(question) || (summary && page === '/timeline'))) {
    const events = data.scenario.events.filter(event => event.startSol <= requestedSol && event.endSol >= requestedSol);
    const archive = requestedSol === radlabEventSol(data.scenario.missionContext);
    return { kind: 'personal', text: [
      events.length ? `Sol ${requestedSol}: ${events.map(event => event.label).join(', ')}.` : `No scenario events are listed for Sol ${requestedSol}.`,
      archive ? 'The Timeline also replays the archived Curiosity radiation event for this sol.' : '',
      habitat ? `The cabin log records ${habitat.co2Mmhg} millimetres of mercury of CO₂ and ${habitat.cabinTempC} degrees Celsius.` : '',
    ].filter(Boolean).join(' '), sources: [source('Mission timeline', '/timeline'), ...(habitat ? [co2Source] : []), ...(archive ? [source(RADLAB_SOURCE.title, '/timeline', RADLAB_SOURCE.url ?? undefined)] : [])] };
  }
  if ((summary && page === '/demo') || /\b(?:current|active|loaded) (?:demo|scenario)\b/i.test(question)) {
    if (!data) return;
    const archive = analyzeInspiration4().summary;
    return { kind: 'personal', text: `${data.scenario.title} is loaded on Sol ${sol}. There are ${ctx.history.length} check-ins in the current scenario. The separate Inspiration4 dataset shows ${archive.personalChanges} personal changes across ${archive.returnComparisons} return comparisons.`, sources: [source('Demo and data', '/demo'), source(INSPIRATION4_SOURCE.title, '/demo', INSPIRATION4_SOURCE.url ?? undefined)] };
  }
  if (summary && page === '/trends') {
    const metric = new URLSearchParams(search).get('metric') ?? 'sleep_duration';
    if (metric === 'vigilance') return missionAnswer('My latest vigilance', ctx, '/cognitive');
    if (metric === 'symptoms') {
      const withSymptoms = ctx.history.filter(record => record.symptoms.some(item => item.present));
      const last = withSymptoms.at(-1);
      return { kind: 'personal', text: last
        ? `${withSymptoms.length} check-ins report symptoms. The latest is Sol ${last.sol}: ${last.symptoms.filter(item => item.present).map(item => item.label).join(', ')}.`
        : 'No symptoms are recorded in this trend.', sources: [source('Symptom trend', '/trends?metric=symptoms')] };
    }
    const selected = METRIC_IDS.find(id => id === metric);
    if (selected) {
      const readings = ctx.history.flatMap(record => {
        const reading = usableMeasurement(record, selected);
        return reading ? [{ reading, sol: record.sol }] : [];
      });
      const first = readings.at(0);
      const last = readings.at(-1);
      return { kind: 'personal', text: last && first ? `${METRICS[selected].label}: ${readings.length} usable readings. The series starts at ${first.reading.value} on Sol ${first.sol} and ends at ${last.reading.value} ${METRICS[selected].unitLabel} on Sol ${last.sol}.` : `There are no usable readings for ${METRICS[selected].label.toLowerCase()}.`, sources: [source('Selected trend', `/trends?metric=${selected}`)] };
    }
  }
  if ((summary && page === '/hazards/distance') || /\b(?:communication|one.way|round.trip) delay\b/i.test(question)) {
    return { kind: 'personal', text: `The active mission has a ${ctx.oneWayDelayMinutes}-minute one-way delay to Earth. A reply takes at least ${ctx.oneWayDelayMinutes * 2} minutes in this scenario.`, sources: [source('Distance from Earth', '/hazards/distance'), source(SOURCES['nasa-delay'].title, '/hazards/distance', SOURCES['nasa-delay'].url ?? undefined)] };
  }
  if (summary && page === '/assistant') {
    return { kind: 'help', text: `Ask Sol is reading the local ${data?.scenario.title ?? 'mission'} scenario on Sol ${sol}. It has ${ctx.history.length} saved check-ins available. Ask for your readings or a mission review.`, sources: [source('Active scenario', '/demo'), source('Ask Sol', '/assistant')] };
  }
  if (summary) {
    const guide = guideFor(page);
    const findings = ctx.assessment?.findings.slice(0, 2).map(plainFinding).join(' ');
    const detail = ['/', '/check-in', '/trends'].includes(page) && findings ? ` ${findings}` : '';
    return { kind: 'help', text: guide.what + detail, sources: [source(guide.name, guide.route), ...(detail ? [source('Assessment', '/assessment')] : [])] };
  }
}
