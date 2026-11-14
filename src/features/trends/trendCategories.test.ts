import { describe, expect, it } from 'vitest';
import { METRIC_IDS } from '../../contracts';
import { TREND_CATEGORIES, indicatorsInCategory, trendCategoryOf } from './Trends';

describe('Trends categories', () => {
  it('every existing indicator is reachable in exactly one category', () => {
    const all = TREND_CATEGORIES.flatMap(({ id }) => indicatorsInCategory(id));
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...METRIC_IDS, 'symptoms', 'vigilance'].sort());
  });

  it('groups indicators by their health domain', () => {
    expect(trendCategoryOf('heart_rate')).toBe('cardiovascular');
    expect(trendCategoryOf('bp_systolic')).toBe('cardiovascular');
    expect(trendCategoryOf('blood_glucose')).toBe('metabolic');
    expect(trendCategoryOf('body_temp')).toBe('metabolic');
    expect(trendCategoryOf('sleep_duration')).toBe('wellbeing');
    expect(trendCategoryOf('mood')).toBe('wellbeing');
    expect(trendCategoryOf('symptoms')).toBe('wellbeing');
    expect(trendCategoryOf('vigilance')).toBe('wellbeing');
  });

  it('no category is empty', () => {
    for (const { id } of TREND_CATEGORIES) expect(indicatorsInCategory(id).length).toBeGreaterThan(0);
  });
});
