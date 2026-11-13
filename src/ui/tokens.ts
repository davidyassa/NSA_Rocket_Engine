import {
  CircleDashed, Equal, Minus, PencilLine, Triangle, TrendingUpDown, type LucideIcon,
} from 'lucide-react';
import type { DomainStatus, Provenance } from '../contracts';

/**
 * NASA flight-console palette. CSS custom properties in theme.css are the
 * source for styling; these hex values exist for canvas / WebGL / SVG chart
 * code that cannot resolve CSS variables. Keep the two in sync
 * (src/ui/tokens.test.ts checks every value against theme.css).
 */
export const TOKENS = {
  bgBase: '#100F0E',
  bgSurface: '#1A1817',
  bgRaised: '#242120',
  nasaBlue: '#0B3D91',
  nasaRed: '#FF694D',
  borderSubtle: '#37312E',
  borderControl: '#786F68',
  textPrimary: '#F6F1EA',
  textSecondary: '#BFB6AE',
  textMuted: '#A79D94',
  accent: '#FFB86A',
  statusSteady: '#68D7A3',
  statusChange: '#FDD14D',
  statusTrend: '#FF986F',
  statusCheck: '#C5ADFF',
  statusNeutral: '#B8B1AC',
  nasaArchive: '#F5A3D9',
} as const;

export type StatusTone = 'steady' | 'change' | 'trend' | 'check' | 'neutral';

export const STATUS_TONE_COLOR: Record<StatusTone, string> = {
  steady: TOKENS.statusSteady,
  change: TOKENS.statusChange,
  trend: TOKENS.statusTrend,
  check: TOKENS.statusCheck,
  neutral: TOKENS.statusNeutral,
};

/**
 * Status in three channels: every domain status carries an icon, a text
 * label and a colour tone. Components must render all three.
 * Sustained trend uses a two-way trend icon because the domain-level status
 * does not record direction; the direction is stated in the finding text.
 */
export const STATUS_META: Record<DomainStatus, { label: string; Icon: LucideIcon; tone: StatusTone }> = {
  no_change_detected: { label: 'No change detected', Icon: Equal, tone: 'steady' },
  change_from_baseline: { label: 'Change from baseline', Icon: Triangle, tone: 'change' },
  sustained_trend: { label: 'Sustained trend', Icon: TrendingUpDown, tone: 'trend' },
  baseline_not_established: { label: 'Baseline not established', Icon: CircleDashed, tone: 'neutral' },
  check_entry: { label: 'Check entry', Icon: PencilLine, tone: 'check' },
  not_measured: { label: 'Not measured', Icon: Minus, tone: 'neutral' },
};

/** Origin badges: every reading or series shows where it came from. */
export const ORIGIN_META: Record<Provenance, { label: string; className: string }> = {
  user_entered: { label: 'Entered', className: 'badge origin-entered' },
  synthetic_demo: { label: 'Synthetic', className: 'badge origin-synthetic' },
  nasa_archive: { label: 'NASA archive', className: 'badge origin-archive' },
  derived: { label: 'Derived', className: 'badge origin-derived' },
};

/** WCAG 2.x relative luminance and contrast ratio for #RRGGBB colours. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
