import { describe, expect, it } from 'vitest';
import { describePage, guideFor, routeFromSpeech, TOUR_ROUTES, PAGE_GUIDES } from './pageGuides';
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
});

describe('"Hey Sol" wake word', () => {
  it.each(['Hey Sol', 'Hey soul.', 'Hey, Seoul.', 'HeySaul!', 'Taysol.', 'Okay Sol open the timeline', 'um hey sol'])('wakes on "%s"', (text) => {
    expect(matchWake(text).woke).toBe(true);
  });
  it('keeps the question said after the wake word', () => {
    expect(matchWake('Hey Saul, what is this page?').rest).toBe('what is this page?');
    expect(matchWake('Hey, Seoul —\nwhat is this page?').rest).toBe('what is this page?');
  });
  it.each(['Sol', 'I said hey Sol', 'Hey, so what is this page?', 'Hey Solar', 'Hey, solve this', 'Hey, sunshine', 'Solar storm on Sol 41', 'I said hello', 'They saw the sun'])('ignores "%s"', (text) => {
    expect(matchWake(text).woke).toBe(false);
  });
});
