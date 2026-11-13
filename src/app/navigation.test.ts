import { describe, expect, it } from 'vitest';
import { isNavItemActive } from './navigation';

const items = ['/', '/hazards/radiation', '/check-in', '/cognitive', '/assessment', '/cmo', '/trends', '/timeline', '/assistant', '/hazards', '/demo'];
const activeFor = (pathname: string) => items.filter((to) => isNavItemActive(to, pathname));

describe('main navigation active matching', () => {
  it('Radiation monitor selects only Radiation monitor, never Hazards', () => {
    expect(activeFor('/hazards/radiation')).toEqual(['/hazards/radiation']);
    expect(activeFor('/hazards/radiation/')).toEqual(['/hazards/radiation']);
  });

  it('Hazards selects only Hazards', () => {
    expect(activeFor('/hazards')).toEqual(['/hazards']);
  });

  it('hazard detail pages keep Hazards as the single active item', () => {
    expect(activeFor('/hazards/isolation')).toEqual(['/hazards']);
    expect(activeFor('/hazards/distance')).toEqual(['/hazards']);
  });

  it('Demo and data selects only Demo and data', () => {
    expect(activeFor('/demo')).toEqual(['/demo']);
  });

  it('every other destination has exactly one active item', () => {
    for (const to of ['/', '/check-in', '/cognitive', '/assessment', '/cmo', '/trends', '/timeline', '/assistant']) {
      expect(activeFor(to)).toEqual([to]);
    }
  });

  it('query strings do not affect matching (Trends categories, follow-up view)', () => {
    // pathname never includes the search string; nested in-page tabs cannot change nav state
    expect(activeFor('/trends')).toEqual(['/trends']);
    expect(activeFor('/assessment')).toEqual(['/assessment']);
  });
});
