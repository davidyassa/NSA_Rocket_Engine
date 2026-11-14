import { describe, expect, it } from 'vitest';
import { describePage, guideFor, routeFromSpeech, subpageFromSpeech, TOUR_ROUTES, PAGE_GUIDES } from './pageGuides';
import { matchWake } from './solListener';

describe('Sol knows where you are', () => {
  it('finds the guide for every tab, including nested routes', () => {
    expect(guideFor('/timeline').name).toBe('the Timeline');
    expect(guideFor('/hazards/isolation').name).toBe('the Isolation and confinement page');
    expect(guideFor('/unknown').name).toBe('the Dashboard');
    for (const route of TOUR_ROUTES) expect(PAGE_GUIDES.some((g) => g.route === route), route).toBe(true);
  });

  it('describes the page in plain words with something to try', () => {
    expect(describePage(guideFor('/cmo'))).toMatch(/^You’re on the CMO console\./);
  });

  it('understands "open the timeline" and "take me to the CMO console"', () => {
    expect(routeFromSpeech('Open the timeline')?.route).toBe('/timeline');
    expect(routeFromSpeech('Take me to the CMO console please')?.route).toBe('/cmo');
    expect(routeFromSpeech('go to radiation monitor')?.route).toBe('/hazards/radiation');
    expect(routeFromSpeech('what is the timeline')).toBeNull();
  });

  it('navigates to subpages of a page like cardiovascular trends on the trends page', () => {
    // Trends categories
    const cardio = subpageFromSpeech('Navigate to cardiovascular trends on the trends page');
    expect(cardio?.name).toBe('Cardiovascular trends');
    expect(cardio?.route).toBe('/trends?category=cardiovascular&metric=heart_rate');
    expect(cardio?.parentName).toBe('the Trends page');

    expect(subpageFromSpeech('Navigate to subpages of a page like cardiovascular trends on the trends page')?.route)
      .toBe('/trends?category=cardiovascular&metric=heart_rate');
    expect(subpageFromSpeech('open cardiovascular trends')?.route)
      .toBe('/trends?category=cardiovascular&metric=heart_rate');
    expect(subpageFromSpeech('go to cardiovascular on trends')?.route)
      .toBe('/trends?category=cardiovascular&metric=heart_rate');
    expect(subpageFromSpeech('switch to cardiovascular', '/trends')?.route)
      .toBe('/trends?category=cardiovascular&metric=heart_rate');

    const metabolic = subpageFromSpeech('open metabolic trends on the trends page');
    expect(metabolic?.name).toBe('Metabolic & physical trends');
    expect(metabolic?.route).toBe('/trends?category=metabolic&metric=blood_glucose');

    const wellbeing = subpageFromSpeech('show sleep and wellbeing trends');
    expect(wellbeing?.name).toBe('Sleep & wellbeing trends');
    expect(wellbeing?.route).toBe('/trends?category=wellbeing&metric=sleep_duration');

    // Individual indicator subpages on Trends
    expect(subpageFromSpeech('navigate to heart rate trend on the trends page')?.route).toBe('/trends?metric=heart_rate');
    expect(subpageFromSpeech('open blood pressure trend on trends')?.route).toBe('/trends?metric=bp_systolic');
    expect(subpageFromSpeech('show hrv trend on trends')?.route).toBe('/trends?metric=hrv_rmssd');
    expect(subpageFromSpeech('open glucose trend on the trends page')?.route).toBe('/trends?metric=blood_glucose');

    // Subpages on other pages: CMO tabs, Cognitive modes, Hazards
    expect(subpageFromSpeech('navigate to triage on the cmo page')?.route).toBe('/cmo?tab=triage');
    expect(subpageFromSpeech('open supplies on CMO console')?.route).toBe('/cmo?tab=kit');
    expect(subpageFromSpeech('navigate to timed mode on cognitive lab')?.route).toBe('/cognitive?mode=timed');
    expect(subpageFromSpeech('go to radiation on the hazards page')?.route).toBe('/hazards/radiation');
    expect(subpageFromSpeech('open voice settings on ask sol')?.route).toBe('/assistant#voice-settings');

    // Questions should NOT be captured as navigation
    expect(subpageFromSpeech('Why do cardiovascular trends change in space?')).toBeNull();
  });
});

describe('"Hey Sol" wake word', () => {
  it.each(['Hey Sol', 'Hey soul.', 'Hey, Seoul.', 'HeySaul!', 'Taysol.', 'Okay Sol open the timeline', 'um hey sol'])('wakes on "%s"', (text) => {
    expect(matchWake(text).woke).toBe(true);
  });
  // Real ways Whisper-tiny garbles a quick "Hey Sol" that the strict pattern missed.
  it.each([
    'Yo Sol', 'Yo, Sol.', 'Heya Sol', 'Hiya sol', 'Ey Sol', 'Ay, Sol.',
    'Hey sole', 'Hey Sal', 'hi saul', 'um, hey soul', 'well hey sol',
    'Heysole', 'yosol', 'A Sol, how am I doing?',
  ])('also wakes on garbled "%s"', (text) => {
    expect(matchWake(text).woke).toBe(true);
  });
  it('keeps the question said after the wake word', () => {
    expect(matchWake('Hey Saul, what is this page?').rest).toBe('what is this page?');
    expect(matchWake('Hey, Seoul —\nwhat is this page?').rest).toBe('what is this page?');
    expect(matchWake('Yo Sol, open the timeline').rest).toBe('open the timeline');
    expect(matchWake('A Sol, how am I doing?').rest).toBe('how am I doing?');
  });
  it.each(['Hey there Sol, I need help', 'Um, oh, hey Sol', 'Hey Sowl', 'Hey Zol, what is my pulse', 'Hey Sell.'])('wakes on the extra variant "%s"', (text) => {
    expect(matchWake(text).woke).toBe(true);
  });
  it.each(['Hey Sally', 'Hey, silly', 'A salt shaker'])('does not wake on the look-alike "%s"', (text) => {
    expect(matchWake(text).woke).toBe(false);
  });
  it.each(['Sol', 'I said hey Sol', 'Hey, so what is this page?', 'Hey Solar', 'Hey, solve this', 'Hey, sunshine', 'Solar storm on Sol 41', 'I said hello', 'They saw the sun', 'Hey, also check this', 'The console is slow'])('ignores "%s"', (text) => {
    expect(matchWake(text).woke).toBe(false);
  });
});
