/**
 * Sol computer use: "click start", "tap standard", "press save" → the on-screen control
 * whose name matches best. Ranking is pure (tested); the page reader only looks at
 * visible, enabled controls outside Sol's own panels.
 */
import type { ScreenControls } from './dialogue';

const norm = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const words = (text: string) => norm(text).split(' ').filter(Boolean);

/** How well a control's name matches what was said (0 = not at all). */
export function matchScore(said: string, name: string): number {
  const t = norm(said);
  const n = norm(name);
  if (!t || !n) return 0;
  if (n === t) return 100;
  if (n.startsWith(`${t} `)) return 85;
  if (` ${n} `.includes(` ${t} `)) return 75;
  const want = words(t);
  const have = new Set(words(n));
  const hits = want.filter((w) => have.has(w) || [...have].some((h) => h.startsWith(w) && w.length >= 4)).length;
  if (hits === want.length) return 60;
  return hits / want.length >= 0.5 ? 30 + 20 * (hits / want.length) : 0;
}

/** The best-matching control, preferring the more specific (shorter) name on a tie. */
export function bestMatch<T extends { name: string }>(said: string, controls: readonly T[], minimum = 50): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const control of controls) {
    const score = matchScore(said, control.name) - control.name.length / 1000;
    if (score > bestScore) { best = control; bestScore = score; }
  }
  return bestScore >= minimum ? best : null;
}

const CONTROLS = [
  'button', 'a[href]', 'summary', '[role="button"]', '[role="tab"]', '[role="radio"]', '[role="switch"]',
  '[role="checkbox"]', '[role="menuitem"]', '[role="option"]', '[role="link"]',
  'input[type="checkbox"]', 'input[type="radio"]', 'input[type="submit"]', 'input[type="button"]',
].join(',');
/** Sol's own interface is not a target. */
const SOL_UI = '.sol-dock, .voice-mode, .sol-island, .emergency-mode, [inert], [aria-hidden="true"]';

function controlName(el: HTMLElement): string {
  const labelledBy = el.getAttribute('aria-labelledby');
  const byId = labelledBy && labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
  if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
    return (el.getAttribute('aria-label') || byId || el.labels?.[0]?.textContent || el.value || '').trim();
  }
  return (el.getAttribute('aria-label') || byId || el.innerText || el.textContent || (el as HTMLInputElement).value || el.title || '').replace(/\s+/g, ' ').trim();
}

function visible(el: HTMLElement): boolean {
  if (el.closest(SOL_UI)) return false;
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return false;
  // A hidden radio or checkbox is clicked through its visible label.
  const box = el instanceof HTMLInputElement && el.labels?.[0] ? el.labels[0] : el;
  if (!box.getClientRects().length) return false;
  const style = getComputedStyle(box);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

/** Visible controls on the page, with their names. */
export function screenControls(root: ParentNode = document): { el: HTMLElement; name: string }[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CONTROLS))
    .filter(visible)
    .map((el) => ({ el, name: controlName(el) }))
    .filter((control) => control.name.length > 0 && control.name.length < 120);
}

/** The control for "click <label>", or null. */
export function findControl(label: string): { el: HTMLElement; name: string } | null {
  const open = document.querySelector<HTMLElement>('dialog[open]');
  return bestMatch(label, screenControls(open ?? document));
}

/** What converse() uses to know which controls exist. */
export const pageControls: ScreenControls = {
  find: (label) => {
    const hit = typeof document === 'undefined' ? null : findControl(label);
    return hit && { name: hit.name };
  },
};

/** Click it the way a person would: bring it into view, focus it, click it. */
export function clickControl(label: string, behavior: ScrollBehavior = 'smooth'): string | null {
  const hit = findControl(label);
  if (!hit) return null;
  hit.el.scrollIntoView({ block: 'center', behavior });
  hit.el.focus({ preventScroll: true });
  hit.el.click();
  return hit.name;
}
