import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOMAIN_STATUS_VALUES } from './tokens.fixture';
import { ORIGIN_META, STATUS_META, TOKENS, contrastRatio } from './tokens';



const themeCss = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('flight-console tokens', () => {
  it('mirror the CSS custom properties exactly', () => {
    for (const [name, hex] of Object.entries(TOKENS)) {
      expect(themeCss, `--${kebab(name)}`).toMatch(new RegExp(`--${kebab(name)}:\\s*${hex};`, 'i'));
    }
  });

  it('meet WCAG 2.2 AA text contrast (4.5:1) on every surface', () => {
    const text = [TOKENS.textPrimary, TOKENS.textSecondary, TOKENS.textMuted, TOKENS.accent, TOKENS.nasaRed,
      TOKENS.statusSteady, TOKENS.statusChange, TOKENS.statusTrend, TOKENS.statusCheck, TOKENS.statusNeutral, TOKENS.nasaArchive];
    for (const surface of [TOKENS.bgBase, TOKENS.bgSurface, TOKENS.bgRaised]) {
      for (const colour of text) expect(contrastRatio(colour, surface), `${colour} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('meet 3:1 for control borders', () => {
    for (const surface of [TOKENS.bgBase, TOKENS.bgSurface, TOKENS.bgRaised]) {
      expect(contrastRatio(TOKENS.borderControl, surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('documents that NASA blue is fill-only (fails as text on dark surfaces)', () => {
    expect(contrastRatio(TOKENS.nasaBlue, TOKENS.bgBase)).toBeLessThan(3);
    expect(contrastRatio(TOKENS.textPrimary, TOKENS.nasaBlue)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives every domain status an icon, a label and a tone', () => {
    for (const status of DOMAIN_STATUS_VALUES) {
      const meta = STATUS_META[status];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.Icon).toBeTruthy();
      expect(meta.tone).toMatch(/^(steady|change|trend|check|neutral)$/);
    }
    expect(new Set(Object.values(STATUS_META).map((m) => m.label)).size).toBe(DOMAIN_STATUS_VALUES.length);
  });

  it('labels all four origins', () => {
    expect(Object.values(ORIGIN_META).map((m) => m.label)).toEqual(['Entered', 'Synthetic', 'NASA archive', 'Derived']);
  });
});
