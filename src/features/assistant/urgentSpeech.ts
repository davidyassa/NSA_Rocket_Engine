// These are the opening instructions of the existing, cited safety replies.
export const URGENT_CREW = 'Tell your crew medical officer straight away.';
export const URGENT_HABITAT = 'Alert your crew now and follow your habitat emergency procedure.';
export const URGENT_CRISIS = 'Please talk to your crew medical officer or a crewmate you trust right now, in person.';

const clips = [
  [URGENT_CREW, 'crew'],
  [URGENT_HABITAT, 'habitat'],
  [URGENT_CRISIS, 'crisis'],
  ['I can’t assign that value.', 'entry-range'],
] as const;

export function urgentClipFor(text: string) {
  const clip = clips.find(([opening]) => text.startsWith(opening));
  // Pre-recorded in Sol's Piper voice (voice-server/make_alerts.py), so the opening plays instantly.
  return clip && { url: new URL(`vendor/piper/alerts/${clip[1]}.wav`, document.baseURI).href, rest: text.slice(clip[0].length).trim() };
}
