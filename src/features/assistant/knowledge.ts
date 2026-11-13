/**
 * Ask Sol knowledge base: ONLY Sol Check's own, cited content.
 *
 * Every passage comes from data the app already ships (sources, rules, guides,
 * action cards, glossary, hazards, NASA datasets, supplies), so each answer can
 * name where it came from. Retrieval is classic BM25 keyword ranking with a small
 * health-synonym list. It runs on the device: no model, no network, nothing made up.
 */
import { METRICS, type MetricId } from '../../contracts';
import { ACTION_CARDS, MEASUREMENT_GUIDES, SOURCES } from '../../content';
import { GLOSSARY, PLAIN_FIELD_LABEL } from '../../content/plainLanguage';
import { MEDICAL_KIT } from '../../content/medicalKit';
import { RULES } from '../../engine';
import { NASA_FIVE_HAZARDS } from '../hazards/hazardsData';
import { RADLAB_MANIFEST, RADLAB_SOURCE, RADLAB_UNIT } from '../../data/nasa';
import { INSPIRATION4_SOURCE, analyzeInspiration4 } from '../../data/nasa/inspiration4';

export interface KnowledgeDoc {
  id: string;
  kind: 'source' | 'guide' | 'rule' | 'action' | 'glossary' | 'hazard' | 'dataset' | 'supplies' | 'mission';
  title: string;
  text: string;
  /** citation shown under the answer */
  cite: { label: string; url?: string; route?: string };
}

const sourceCite = (id: string | undefined) => {
  const source = id ? SOURCES[id] : undefined;
  return source ? { label: source.title, url: source.url ?? undefined } : { label: 'Sol Check method (demo heuristic)' };
};

function buildDocs(): KnowledgeDoc[] {
  const docs: KnowledgeDoc[] = [];

  for (const source of Object.values(SOURCES)) {
    docs.push({
      id: `source:${source.id}`, kind: 'source', title: source.title,
      text: `${source.supports} What this source does not show: ${source.doesNotSupport}`,
      cite: { label: `${source.title} (${source.publisher})`, url: source.url ?? undefined },
    });
  }

  for (const [metric, guide] of Object.entries(MEASUREMENT_GUIDES) as [MetricId, (typeof MEASUREMENT_GUIDES)[MetricId]][]) {
    const name = PLAIN_FIELD_LABEL[metric] ?? METRICS[metric]?.label ?? metric;
    const cite = { ...sourceCite(guide.sourceId), route: '/check-in' };
    docs.push({ id: `guide:${metric}:how`, kind: 'guide', title: `How to measure ${name.toLowerCase()}`, text: `${guide.text} ${guide.steps.join(' ')}`, cite });
    docs.push({ id: `guide:${metric}:why`, kind: 'guide', title: `Why ${name.toLowerCase()} matters in space`, text: `${guide.whyInSpace} Usual range: ${guide.typicalRange} Watch for: ${guide.watchFor}`, cite });
  }

  for (const rule of Object.values(RULES)) {
    docs.push({
      id: `rule:${rule.ruleId}`, kind: 'rule', title: `Sol Check rule: ${rule.ruleId.replace(/-/g, ' ')}`,
      text: `${rule.reason} The rule: ${rule.conditions.join(' ')}`,
      cite: { ...sourceCite(rule.sourceRefs[0]), route: '/assessment' },
    });
  }

  for (const card of Object.values(ACTION_CARDS)) {
    docs.push({ id: `action:${card.id}`, kind: 'action', title: card.title, text: card.steps.join(' '), cite: { ...sourceCite(card.sourceRefs[0]), route: '/assessment' } });
  }

  for (const entry of GLOSSARY) {
    docs.push({ id: `glossary:${entry.term}`, kind: 'glossary', title: entry.term, text: entry.meaning, cite: { label: 'Sol Check · Words explained' } });
  }

  for (const hazard of NASA_FIVE_HAZARDS) {
    const route = `/hazards`;
    const cite = { label: `${hazard.name} · NASA HRP ${hazard.hrpElement}`, route };
    docs.push({ id: `hazard:${hazard.id}`, kind: 'hazard', title: `${hazard.name}: ${hazard.tagline}`, text: `${hazard.spaceflightMechanism} Health effects: ${hazard.clinicalImpacts.join('; ')}.`, cite });
    docs.push({ id: `hazard:${hazard.id}:tracks`, kind: 'hazard', title: `What Sol Check tracks for ${hazard.name.replace(/^\d+\.\s*/, '').toLowerCase()}`, text: `Sol Check tracks: ${hazard.measuredBy.join('; ')}. Still needs flight hardware: ${hazard.needsHardware.join('; ')}.`, cite });
    docs.push({ id: `hazard:${hazard.id}:counter`, kind: 'hazard', title: `Countermeasures for ${hazard.name.replace(/^\d+\.\s*/, '').toLowerCase()}`, text: hazard.operationalCountermeasures.join(' '), cite });
  }

  const { verifiedEventReading, peakReading } = RADLAB_MANIFEST;
  docs.push({
    id: 'dataset:radlab', kind: 'dataset', title: 'Real NASA data: Curiosity radiation during the September 2017 solar storm',
    text: `${RADLAB_SOURCE.supports} Sol Check replays the 11 September 2017 solar particle event as Sol 41. The event reading was ${verifiedEventReading.absorbedDoseRate.toFixed(2)} ${RADLAB_UNIT} and the raw peak ${peakReading.absorbedDoseRate.toFixed(2)} ${RADLAB_UNIT}. ${RADLAB_SOURCE.doesNotSupport ? `It does not show: ${RADLAB_SOURCE.doesNotSupport}` : ''}`,
    cite: { label: RADLAB_SOURCE.title, url: RADLAB_SOURCE.url ?? undefined, route: '/timeline' },
  });
  const { summary } = analyzeInspiration4();
  docs.push({
    id: 'dataset:inspiration4', kind: 'dataset', title: 'Real astronaut data: Inspiration4 blood counts and personal baselines',
    text: `Sol Check's personal-baseline method was tested on the published blood counts of the four Inspiration4 crew (NASA OSDR OSD-569). ${summary.populationFlags} of ${summary.returnComparisons} day-after-return values were outside the lab's normal range, but ${summary.personalChanges} were real changes from the crew member's own pre-flight baseline, and ${summary.recovered} of those were back to usual at the next visit. Sol Check also caught ${summary.gatedEntries} entry errors in the published file. Comparing a person with their own usual finds changes that population ranges miss.`,
    cite: { label: INSPIRATION4_SOURCE.title, url: INSPIRATION4_SOURCE.url ?? undefined, route: '/demo' },
  });

  docs.push({
    id: 'supplies', kind: 'supplies', title: 'Supplies on board (no resupply from Earth)',
    text: `Sol Check lists non-drug supplies only: ${Object.values(MEDICAL_KIT).map((item) => `${item.name} (${item.use.toLowerCase()})`).join('; ')}. It does not list, recommend or prescribe medicines; the crew medical officer and flight surgeon decide on treatment.`,
    cite: { label: 'Sol Check · Supplies on board', route: '/cmo' },
  });

  docs.push({
    id: 'mission:camera', kind: 'mission', title: 'How accurate is the camera heart rate, breathing and HRV',
    text: 'The camera reads tiny colour changes in the skin of your face, on the device. On test videos with a known pulse (82, 67 and 104 beats per minute at 24, 15 and 30 frames per second) Sol Check read each one exactly in about 15 seconds. A number is only shown when the signal passes quality checks; otherwise you get advice and no number. Breathing rate needs two of three breathing effects on the pulse to agree. It is a camera estimate, not a medical device: a comparison with a fingertip pulse oximeter on 5 to 10 people is the next step, and a fingertip oximeter is itself accurate to about 2 to 3 beats per minute.',
    cite: { label: 'Sol Check camera validation', route: '/check-in' },
  });
  docs.push({
    id: 'mission:delay', kind: 'mission', title: 'Talking to Earth: the communication delay',
    text: 'On Mars a message to Earth takes about 20 minutes one way in this mission (it varies from about 4 to 22 minutes with planet positions), so a question and its answer take at least 40 minutes. That is why Sol Check works fully offline, routes findings to the onboard crew medical officer first, and prepares one complete handoff package for the flight surgeon on Earth.',
    cite: { label: SOURCES['nasa-delay']?.title ?? 'NASA communication delay', url: SOURCES['nasa-delay']?.url ?? undefined, route: '/assessment' },
  });
  docs.push({
    id: 'mission:about', kind: 'mission', title: 'What Sol Check is',
    text: 'Sol Check is a daily health check-in for astronauts far from Earth. It compares each crew member with their own usual (a 14-sol personal baseline), explains changes in plain words, and suggests who should look at them: the crew member, the crew medical officer, or doctors on Earth. It works offline and keeps data on the device. It is a research prototype, not a diagnosis.',
    cite: { label: 'Sol Check README', route: '/' },
  });
  docs.push({
    id: 'mission:sol43', kind: 'mission', title: 'The Sol 43 story: after the solar storm',
    text: 'Maya Chen is a synthetic crew member at a habitat in Gale Crater. On Sol 41 a real solar storm (replayed from Curiosity data) sent the crew into a shelter for two days. Since then her sleep and mood have been below her usual, her heart rate variability dropped, she ate less, exercise was short, and headaches came on sols with high cabin CO2. Sol Check suggests she talks to the crew medical officer today.',
    cite: { label: 'Sol Check demo scenario (synthetic)', route: '/assessment' },
  });
  return docs;
}

const STOPWORDS = new Set('a an and are as at be by can could did do does for from has have how i if in into is it its me my of on or our should so than that the their them then there these this to was we what when where which who why will with would you your yours about tell explain please mean means'.split(' '));

/** Everyday words → the words Sol Check's content uses. */
const SYNONYMS: Record<string, string[]> = {
  pulse: ['heart', 'rate', 'bpm'], heartbeat: ['heart', 'rate'], bpm: ['heart', 'rate'],
  bp: ['blood', 'pressure'], hypertension: ['blood', 'pressure'],
  breath: ['breathing', 'respiratory'], breathe: ['breathing'], respiration: ['breathing', 'respiratory'],
  hrv: ['heart', 'rate', 'variability', 'rmssd'], stress: ['hrv', 'mood', 'behavioral'],
  sugar: ['glucose', 'blood'], glucose: ['sugar'],
  fever: ['temperature'], temp: ['temperature'],
  tired: ['fatigue', 'sleep'], insomnia: ['sleep'], rest: ['sleep'],
  sad: ['mood', 'behavioral'], depressed: ['mood', 'behavioral'], anxious: ['mood', 'behavioral'], lonely: ['isolation', 'confinement', 'mood'], isolation: ['confinement'],
  radiation: ['dose', 'solar', 'particle'], storm: ['solar', 'particle', 'event'], sun: ['solar'],
  co2: ['carbon', 'dioxide', 'habitat', 'air'], air: ['co2', 'habitat'],
  water: ['fluid', 'hydration', 'drink'], drink: ['fluid'], dehydration: ['fluid', 'hydration'],
  food: ['calorie', 'energy', 'kcal', 'nutrition'], eating: ['calorie', 'food', 'appetite'], weight: ['body', 'mass'],
  bone: ['bone', 'loss', 'exercise'], muscle: ['muscle', 'exercise', 'atrophy'], exercise: ['exercise', 'countermeasure'],
  dizzy: ['dizziness', 'orthostatic'], faint: ['orthostatic', 'standing'], stand: ['orthostatic', 'standing'], nausea: ['motion', 'sickness'],
  lose: ['loss'], losing: ['loss'], affect: ['effect', 'health'], effects: ['effect', 'health'], accurate: ['accuracy', 'validation', 'accurate'], accuracy: ['accurate', 'validation'],
  eye: ['vision', 'sans'], eyes: ['vision', 'sans'], vision: ['sans', 'eye'],
  kidney: ['kidney', 'stone', 'flank'], stones: ['stone', 'kidney'],
  earth: ['delay', 'ground', 'flight', 'surgeon'], doctor: ['flight', 'surgeon', 'medical', 'officer'], delay: ['communication'],
  cmo: ['crew', 'medical', 'officer'], camera: ['camera', 'rppg', 'estimate'],
  gravity: ['gravity', 'microgravity'], mars: ['mars', 'sol'],
  medicine: ['supplies', 'medicines'], supplies: ['supplies', 'resupply'],
};

export function tokenize(text: string): string[] {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t))
    .map((t) => (t.length > 4 ? t.replace(/(ings|ing|ies|es|s|ed)$/, (m) => (m === 'ies' ? 'y' : '')) : t));
}

function expand(tokens: string[]): string[] {
  const out = [...tokens];
  for (const t of tokens) for (const s of SYNONYMS[t] ?? []) out.push(...tokenize(s));
  return out;
}

export interface Hit { doc: KnowledgeDoc; score: number }

export class KnowledgeIndex {
  readonly docs: KnowledgeDoc[];
  private tf: Map<string, number>[];
  private lengths: number[];
  private df = new Map<string, number>();
  private avgLength: number;

  constructor(docs: KnowledgeDoc[] = buildDocs()) {
    this.docs = docs;
    // Titles count twice: they say what the passage is about.
    this.tf = docs.map((doc) => {
      const counts = new Map<string, number>();
      for (const token of [...tokenize(doc.title), ...tokenize(doc.title), ...tokenize(doc.text)]) counts.set(token, (counts.get(token) ?? 0) + 1);
      return counts;
    });
    this.lengths = this.tf.map((counts) => [...counts.values()].reduce((s, v) => s + v, 0));
    this.avgLength = this.lengths.reduce((s, v) => s + v, 0) / Math.max(1, docs.length);
    for (const counts of this.tf) for (const token of counts.keys()) this.df.set(token, (this.df.get(token) ?? 0) + 1);
  }

  search(query: string, limit = 3): Hit[] {
    const terms = [...new Set(expand(tokenize(query)))];
    const n = this.docs.length;
    const k1 = 1.2; const b = 0.75;
    const scored = this.docs.map((doc, i) => {
      let score = 0;
      for (const term of terms) {
        const f = this.tf[i].get(term);
        if (!f) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * this.lengths[i]) / this.avgLength)));
      }
      return { doc, score };
    });
    return scored.filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
