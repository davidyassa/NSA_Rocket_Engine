/**
 * Confidence-weighted fusion of respiratory-rate sources (pure, interpretable).
 *
 *  1. Only sources whose own quality is at least ACCEPTABLE vote.
 *  2. Votes are grouped into agreement clusters: two rates agree when they differ by
 *     at most max(2 breaths/min, 10 %).
 *  3. A source at about twice (or half) another's rate is flagged as a harmonic of it,
 *     not averaged: a torso-motion fundamental outranks a pulse-derived double.
 *  4. The winning cluster has the largest weight (one vote per modality, see weight()). If a second cluster carries
 *     at least two-thirds of that weight, the sources genuinely disagree: no rate is
 *     returned, and the result says why (never a forced average of 15 and 24).
 *  5. The rate is the quality-weighted mean inside the winning cluster. Confidence
 *     rises when independent modalities (torso motion and face pulse) agree.
 */
import { stateFor } from './quality';
import type { FusionResult, QualityIndicator, SourceEstimate, SourceId } from './types';

export const AGREE = { absBrpm: 2, relative: 0.1 } as const;
export const MODALITY_PRIOR: Record<SourceEstimate['modality'], number> = { 'torso-motion': 1, 'face-pulse': 0.8 };
export const agrees = (a: number, b: number) => Math.abs(a - b) <= Math.max(AGREE.absBrpm, AGREE.relative * Math.max(a, b));
const harmonicOf = (high: number, low: number) => agrees(high, 2 * low);

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

export function fuse(sources: readonly SourceEstimate[]): FusionResult {
  const rejected: { id: SourceId; reason: string }[] = [];
  const voters = sources.filter((s) => {
    if (s.brpm === null) { rejected.push({ id: s.id, reason: 'no rate' }); return false; }
    if (s.quality.state !== 'GOOD' && s.quality.state !== 'ACCEPTABLE') { rejected.push({ id: s.id, reason: `quality ${s.quality.state.toLowerCase()}` }); return false; }
    return true;
  });
  const none = (reason: string, state: QualityIndicator['state'] = 'INSUFFICIENT'): FusionResult => ({
    brpm: null, method: reason, confidence: { state, score: state === 'POOR' ? 0.3 : 0.1, reasons: [reason] }, used: [], rejected, spreadBrpm: 0,
  });
  if (!voters.length) return none('No source measured breathing reliably.');

  // Harmonics: a face-pulse rate at ~2× a torso rate is a harmonic, not a second opinion.
  const torso = voters.filter((s) => s.modality === 'torso-motion');
  const kept = voters.filter((s) => {
    if (s.modality !== 'face-pulse') return true;
    const base = torso.find((t) => harmonicOf(s.brpm!, t.brpm!));
    if (base) { rejected.push({ id: s.id, reason: `about twice the ${base.label.toLowerCase()} rate (harmonic)` }); return false; }
    return true;
  });

  // Agreement clusters, seeded from the highest-quality source.
  const ordered = [...kept].sort((a, b) => b.quality.score - a.quality.score);
  const clusters: SourceEstimate[][] = [];
  for (const s of ordered) {
    const home = clusters.find((c) => agrees(c[0].brpm!, s.brpm!));
    if (home) home.push(s); else clusters.push([s]);
  }
  // One vote per modality: chest and abdomen see the same camera motion, so together
  // they count as one method (their best quality, plus a little for the second region).
  // The face pulse is an indirect breathing signal, so its vote carries a prior of 0.8.
  const weight = (c: SourceEstimate[]) => [...new Set(c.map((s) => s.modality))].reduce((sum, m) => {
    const q = c.filter((s) => s.modality === m).map((s) => s.quality.score).sort((a, b) => b - a);
    return sum + MODALITY_PRIOR[m] * (q[0] + 0.1 * (q.length - 1) * (q[1] ?? 0));
  }, 0);
  clusters.sort((a, b) => weight(b) - weight(a));
  const [best, second] = clusters;
  const rates = kept.map((s) => s.brpm!);
  const spreadBrpm = rates.length ? Math.max(...rates) - Math.min(...rates) : 0;

  if (second && weight(second) >= (2 / 3) * weight(best)) {
    const a = best.map((s) => `${s.label} ${fmt(s.brpm!)}`).join(', ');
    const b = second.map((s) => `${s.label} ${fmt(s.brpm!)}`).join(', ');
    for (const s of [...best, ...second]) rejected.push({ id: s.id, reason: 'conflicting rates' });
    return { ...none(`Sources disagree (${a} vs ${b} breaths/min); no rate is reported.`, 'POOR'), spreadBrpm };
  }
  for (const c of clusters.slice(1)) for (const s of c) rejected.push({ id: s.id, reason: `outvoted (${fmt(s.brpm!)} vs ${fmt(best[0].brpm!)})` });

  const w = weight(best);
  const qSum = best.reduce((sum, s) => sum + s.quality.score, 0);
  const brpm = best.reduce((sum, s) => sum + s.brpm! * s.quality.score, 0) / qSum;
  const modalities = new Set(best.map((s) => s.modality));
  const share = w / clusters.reduce((sum, c) => sum + weight(c), 0);
  const meanQuality = qSum / best.length;
  const bonus = modalities.size > 1 ? 0.1 : 0;
  const score = Math.min(1, meanQuality * (0.6 + 0.4 * share) + bonus);
  const reasons = share < 1 ? ['Some sources were outvoted.'] : [];
  return {
    brpm,
    method: best.length === 1
      ? `${best[0].label} only`
      : `Quality-weighted mean of ${best.map((s) => s.label.toLowerCase()).join(' and ')}${modalities.size > 1 ? ' (independent methods agree)' : ''}`,
    confidence: { state: stateFor(score), score, reasons },
    used: best.map((s) => s.id),
    rejected,
    spreadBrpm,
  };
}
