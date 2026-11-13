import { METRICS, SYMPTOM_OPTIONS, measurementValueError, type MetricId } from '../../contracts';

export interface CheckinPatch {
  readings: Partial<Record<MetricId, number>>;
  symptoms: Record<string, boolean>;
  note?: { text: string; append: boolean };
  moodSuggested?: boolean;
}

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const WORD = [...SMALL, ...TENS, 'hundred', 'thousand', 'point', 'and', 'a', 'half'].join('|');
const NUMBER = `(?:-?\\d+(?:\\.\\d+)?(?: and a half)?|(?:${WORD})\\b(?:[ -]+(?:${WORD})\\b)*)`;

function numberFromSpeech(text: string): number {
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  const half = / and a half$/.test(text);
  const [whole, decimals] = text.replace(/ and a half$/, '').split(' point ');
  const words = whole.split(/[ -]+/).filter(word => word !== 'and');
  if (words.length === 1 && /^\d+(\.\d+)?$/.test(words[0])) return Number(words[0]) + Number(half) / 2;
  let sum = 0;
  let group = 0;
  let last = '';
  for (const word of words) {
    if (word === 'hundred' && group > 0 && group < 10) group *= 100;
    else if (word === 'thousand' && group > 0 && sum === 0) { sum = group * 1000; group = 0; }
    else if (SMALL.includes(word) || TENS.includes(word)) {
      if (last && last !== 'hundred' && last !== 'thousand' && !(TENS.includes(last) && SMALL.indexOf(word) > 0 && SMALL.indexOf(word) < 10)) return NaN;
      group += SMALL.includes(word) ? SMALL.indexOf(word) : 20 + TENS.indexOf(word) * 10;
    } else return NaN;
    last = word;
  }
  if (!words.length) return NaN;
  const fraction = decimals?.split(' ').map(word => SMALL.indexOf(word));
  if (fraction?.some(digit => digit < 0 || digit > 9)) return NaN;
  return sum + group + (fraction ? Number(`0.${fraction.join('')}`) : 0) + Number(half) / 2;
}

const FIELDS: [MetricId, string][] = [
  ['heart_rate_standing', 'standing (?:heart rate|pulse)'],
  ['bp_systolic_standing', 'standing systolic(?: pressure)?'],
  ['bp_diastolic_standing', 'standing diastolic(?: pressure)?'],
  ['hrv_rmssd', 'heart rate variability|hrv|rmssd'],
  ['heart_rate', '(?:resting )?(?:heart rate(?! variability)|pulse|bpm)'],
  ['bp_systolic', 'systolic(?: pressure)?'],
  ['bp_diastolic', 'diastolic(?: pressure)?'],
  ['respiratory_rate', 'breathing rate|respiratory rate'],
  ['body_temp', '(?:body )?temperature'],
  ['blood_glucose', 'blood glucose|blood sugar|glucose'],
  ['sleep_duration', 'sleep(?: duration)?|slept'],
  ['mood', 'mood(?: rating| score)?'],
  ['fluid_intake', 'fluid intake|water intake|drank'],
  ['exercise_minutes', 'exercise(?: minutes)?|exercised'],
  ['calorie_intake', 'food energy|calories|calorie intake|ate'],
  ['body_mass', 'weight|body mass|weigh'],
  ['voice_pitch_variability', 'voice pitch (?:movement|variability)'],
  ['voice_articulation_rate', 'speaking pace|articulation rate'],
  ['voice_pause_ratio', 'time in pauses|voice pause ratio'],
];
const JOIN = '\\s+(?:(?:was|were|is|to|at|of|as)\\s+)?';
const COMMAND = /^(?:please\s+)?(?:log|record|fill(?: in)?|update|edit|correct|set|change|add|remove|check|uncheck|mark)\b/i;
const CHECKIN = /\b(?:check[ -]?in|vitals|readings)\b/i;
const NOTE = /(?:^|[.!?;,]\s*|\band\s+)(add|append|set|replace|update|record|log)\s+(?:(?:a|my|the)\s+)?(?:notes?|remarks?)\s*(?:to\s+|saying\s+|[:–—-]\s*|\s+)(.+)$/is;
const MOOD = /^(?:i(?:['’]m| am) feeling|i feel|i(?:['’]m| am))\s+(very (?:bad|low|sad|down)|terrible|awful|low|sad|down|neutral|okay|good|great|very good|excellent)[.!]*$/i;
const MOOD_VALUES: Record<string, number> = { terrible: 1, awful: 1, low: 2, sad: 2, down: 2, neutral: 3, okay: 3, good: 4, great: 5, excellent: 5, 'very good': 5 };

// Broad input sanity limits for voice entry. These are app limits, not healthy ranges.
const VOICE_ENTRY_LIMITS: Partial<Record<MetricId, readonly [number, number]>> = {
  heart_rate: [1, 300], heart_rate_standing: [1, 300],
  bp_systolic: [1, 400], bp_systolic_standing: [1, 400],
  bp_diastolic: [1, 300], bp_diastolic_standing: [1, 300],
  body_temp: [10, 50], blood_glucose: [1, 1000],
};

export function checkinCommand(input: string, inDraft = false): { patch?: CheckinPatch; text: string; open?: boolean } | undefined {
  const mood = input.trim().match(MOOD);
  const explicit = COMMAND.test(input.trim());
  if (!mood && !explicit && !inDraft) return;
  if (!explicit && /^(?:what|when|where|which|how|why|do|does|is|are|can|could|should|did|tell|show|explain)\b/i.test(input.trim())) return;
  const patch: CheckinPatch = { readings: {}, symptoms: {} };
  const note = input.match(NOTE);
  if (note) patch.note = { text: note[2].trim(), append: /^(add|append)$/i.test(note[1]) };
  const text = (note ? input.slice(0, note.index) : input).toLowerCase()
    .replace(/\b(?:blog|blud) pressure\b/g, 'blood pressure')
    .replace(/\band\s+(?=(?:my|i|set|change|add|remove|uncheck)\b)/g, ', ')
    .replace(/(\d) point (\d)/g, '$1.$2');
  const issues: string[] = [];

  function record(metric: MetricId, raw: string, following: string) {
    const value = numberFromSpeech(raw);
    const label = METRICS[metric].label;
    const bounds = VOICE_ENTRY_LIMITS[metric];
    const issue = measurementValueError(metric, value);
    if (new RegExp(`^\\s*(?:(?:or|to)\\s+|[-–]\\s*)${NUMBER}`).test(following) || !Number.isFinite(value)) {
      issues.push(`Give one value for ${label.toLowerCase()}.`);
    } else if (bounds && (value < bounds[0] || value > bounds[1])) {
      issues.push(`I can’t assign that value. ${value} ${METRICS[metric].unitLabel} is outside the voice entry range of ${bounds[0]} to ${bounds[1]} ${METRICS[metric].unitLabel} for ${label.toLowerCase()}. Check the reading and unit.`);
    } else if (issue) {
      issues.push(`I can’t assign that value. For ${label.toLowerCase()}, ${issue.charAt(0).toLowerCase() + issue.slice(1)}`);
    } else if (patch.readings[metric] !== undefined && patch.readings[metric] !== value) {
      issues.push(`Which value should I use for ${label.toLowerCase()}?`);
    } else {
      patch.readings[metric] = value;
    }
  }

  for (const [metric, aliases] of FIELDS) {
    const pattern = new RegExp(`\\b(?:${aliases})${JOIN}(${NUMBER})`, 'g');
    const uncertain = new RegExp(`\\b(?:${aliases})${JOIN}(?:about|around|approximately|maybe|roughly|between)\\b`);
    if (uncertain.test(text)) issues.push(`Give one exact value for ${METRICS[metric].label.toLowerCase()}.`);
    for (const match of text.matchAll(pattern)) {
      if (!metric.endsWith('_standing') && /standing $/.test(text.slice(0, match.index))) continue;
      if (/\b(?:not|wasn't|isn't|shouldn't)\b[^.,;!?]*$/.test(text.slice(0, match.index))) continue;
      const following = text.slice(match.index + match[0].length);
      if (metric === 'body_temp' && /^\s*(?:°\s*f\b|degrees?\s+f(?:ahrenheit)?\b|fahrenheit\b|f\b)/i.test(following)) {
        const celsius = Math.round((numberFromSpeech(match[1]) - 32) * 50 / 9) / 10;
        record(metric, String(celsius), '');
      } else if (/^\s*(?:mmol|pounds?\b|lbs?\b|ounces?\b|oz\b|gallons?\b|millilit(?:er|re)s?\b|ml\b|seconds?\b|minutes?\b|hours?\b)/i.test(following)
        && !((metric === 'sleep_duration' && /^\s*hours?\b/.test(following)) || (metric === 'exercise_minutes' && /^\s*minutes?\b/.test(following)))) {
        issues.push(`Give ${METRICS[metric].label.toLowerCase()} in ${METRICS[metric].unitLabel}.`);
      } else record(metric, match[1], following);
    }
  }
  for (const match of text.matchAll(new RegExp(`\\b(standing )?(?:blood pressure|bp)${JOIN}(${NUMBER})\\s*(?:over|/)\\s*(${NUMBER})`, 'g'))) {
    const top = match[1] ? 'bp_systolic_standing' : 'bp_systolic';
    const bottom = match[1] ? 'bp_diastolic_standing' : 'bp_diastolic';
    if (numberFromSpeech(match[2]) <= numberFromSpeech(match[3])) issues.push('Give the higher blood pressure number first.');
    else {
      record(top, match[2], '');
      record(bottom, match[3], text.slice(match.index + match[0].length));
    }
  }
  if (/\b(?:blood pressure|bp)\b/.test(text)
    && patch.readings.bp_systolic === undefined && patch.readings.bp_systolic_standing === undefined) {
    issues.push('Say both blood pressure numbers, for example 118 over 76.');
  }

  for (const option of SYMPTOM_OPTIONS) {
    const aliases = option.id === 'flank_pain' ? 'flank pain|side pain'
      : option.id === 'feeling_hopeless' ? 'feeling hopeless'
      : [...new Set([option.id.replaceAll('_', ' '), option.label.toLowerCase().replace(/ or .*/, '')])].join('|');
    const matches = [...text.matchAll(new RegExp(`\\b(${aliases})(?:s)?\\b`, 'g'))];
    for (const match of matches) {
      const before = text.slice(0, match.index);
      if (/\b(?:uncheck|remove|clear|no|without|no longer have)\s+(?:(?:my|a|any)\s+)?$/.test(before)) patch.symptoms[option.id] = false;
      else if (!/\b(?:not|never|denied|might|maybe|family history|my crewmate)\b[^.,;!?]*$/.test(before)
        && (explicit || /\b(?:i (?:have|had|feel|felt)|check|mark|add)\b/.test(before))) patch.symptoms[option.id] = true;
    }
  }
  if (mood) {
    patch.readings.mood = MOOD_VALUES[mood[1].toLowerCase()] ?? 1;
    patch.moodSuggested = true;
  }
  if (patch.note && patch.note.text.length > 500) issues.push('Keep the note within 500 characters.');
  const count = Object.keys(patch.readings).length;
  const symptoms = Object.keys(patch.symptoms).length;
  const hasChanges = count > 0 || symptoms > 0 || Boolean(patch.note);
  if (issues.length) return { text: issues[0] };
  if (hasChanges && /\?$/.test(input.trim()) && !explicit) return;
  if (hasChanges) return {
    patch,
    text: patch.moodSuggested ? `I suggested mood ${patch.readings.mood} out of 5 from what you said. Review it before saving.` : 'Draft updated. Review the readings, symptoms and notes before saving.',
  };
  if (explicit && CHECKIN.test(text)) {
    if (/\b(?:maybe|or|about|around)\b|\d/.test(text)) return { text: 'Tell me the field, one value and its unit. For blood pressure, say both numbers.' };
    return { text: 'Tell me what to record, like pulse 82, blood pressure 118 over 76, or add a note.', open: true };
  }
  if (explicit && FIELDS.some(([, aliases]) => new RegExp(`\\b(?:${aliases})\\b`).test(text))) {
    return { text: 'Tell me the exact value and unit to enter.' };
  }
}
