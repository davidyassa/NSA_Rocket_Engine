import type { Finding } from '../contracts';

/**
 * Composite findings that fully cover narrower findings.
 *
 * `combined-sleep-mood` is built from the sleep and mood `sustained-trend`
 * findings and carries all of their input measurement ids and baselines, so
 * showing all three repeats the same evidence for the same window.
 */
const SUPERSEDES: Partial<Record<Finding['ruleId'], readonly Finding['ruleId'][]>> = {
  'combined-sleep-mood': ['sustained-trend'],
};

function isCoveredBy(candidate: Finding, composite: Finding): boolean {
  if (candidate === composite) return false;
  if (!SUPERSEDES[composite.ruleId]?.includes(candidate.ruleId)) return false;
  // Same evidence only: every measurement behind the narrower finding is part of the composite.
  if (candidate.inputMeasurementIds.length === 0) return false;
  const covered = new Set(composite.inputMeasurementIds);
  return candidate.inputMeasurementIds.every((id) => covered.has(id));
}

function findingKey(finding: Finding): string {
  return [finding.ruleId, finding.kind, finding.summary, [...finding.inputMeasurementIds].sort().join(',')].join('|');
}

/**
 * Display normalization for observation lists: removes findings that a composite
 * finding fully subsumes (same rule family, same measurements) and exact repeats.
 * Order is preserved. Findings with any evidence outside the composite are kept.
 * The underlying assessment is not modified.
 */
export function supersedeSubsumedFindings(findings: readonly Finding[]): Finding[] {
  const composites = findings.filter((finding) => SUPERSEDES[finding.ruleId]);
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (composites.some((composite) => isCoveredBy(finding, composite))) return false;
    const key = findingKey(finding);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
