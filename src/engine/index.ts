import {
  HEALTH_DOMAINS,
  METRIC_IDS,
  METRICS,
  measurementValueError,
  type AssessmentContext,
  type AssessmentState,
  type Baseline,
  type DailyCheckin,
  type DomainStatus,
  type Finding,
  type HealthDomain,
  type HealthMeasurement,
  type MetricId,
  type RiskAssessment,
} from '../contracts';
import {
  BASELINE_LOOKBACK_SOLS,
  DEMO_DELTAS,
  MIN_BASELINE_READINGS,
  MIN_TREND_READINGS,
  RULES,
  TREND_LOOKBACK_SOLS,
  type RuleId,
} from './rules';

export { RULES } from './rules';

type Measurements = Map<MetricId, HealthMeasurement>;
type Issues = Map<MetricId, string>;
type Direction = -1 | 0 | 1;

interface ReviewedCheckin {
  checkin: DailyCheckin;
  measurements: Measurements;
  issues: Issues;
}

const statusPriority: Record<DomainStatus, number> = {
  no_change_detected: 0,
  not_measured: 1,
  baseline_not_established: 2,
  change_from_baseline: 3,
  sustained_trend: 4,
  check_entry: 5,
};

function reviewCheckin(checkin: DailyCheckin): ReviewedCheckin {
  const seen = new Set<MetricId>();
  const measurements: Measurements = new Map();
  const issues: Issues = new Map();

  for (const measurement of checkin.measurements) {
    const { metric, unit, value } = measurement;
    const metadata = METRICS[metric];
    const valueError = measurementValueError(metric, value);
    let issue = valueError ? `${metadata.label}. ${valueError}` : undefined;

    if (measurement.astronautId !== checkin.astronautId) {
      issue = `${metadata.label} belongs to a different crew profile.`;
    } else if (unit !== metadata.unit) {
      issue = `${metadata.label} must use ${metadata.unitLabel}.`;
    }
    if (seen.has(metric)) {
      issue = `More than one ${metadata.label.toLowerCase()} reading was recorded for this sol.`;
    }

    if (issue) {
      measurements.delete(metric);
      issues.set(metric, issue);
    } else {
      measurements.set(metric, measurement);
    }
    seen.add(metric);
  }

  const systolic = measurements.get('bp_systolic');
  const diastolic = measurements.get('bp_diastolic');
  if (seen.has('bp_systolic') || seen.has('bp_diastolic')) {
    let pairIssue: string | undefined;
    if (!systolic || !diastolic) {
      pairIssue = 'Enter both usable blood pressure values together.';
    } else if (systolic.value <= diastolic.value) {
      pairIssue = 'Systolic blood pressure must be greater than diastolic.';
    }

    if (pairIssue) {
      issues.set('bp_systolic', issues.get('bp_systolic') ?? pairIssue);
      issues.set('bp_diastolic', issues.get('bp_diastolic') ?? pairIssue);
      measurements.delete('bp_systolic');
      measurements.delete('bp_diastolic');
    }
  }

  return { checkin, measurements, issues };
}

export function validateCheckinMeasurements(checkin: DailyCheckin): string[] {
  const { issues } = reviewCheckin(checkin);
  return [...new Set(issues.values())];
}

function priorCheckins(checkin: DailyCheckin, history: readonly DailyCheckin[]): ReviewedCheckin[] {
  const bySol = new Map<number, DailyCheckin>();
  const earliestSol = checkin.sol - BASELINE_LOOKBACK_SOLS;

  for (const prior of history) {
    if (prior.astronautId !== checkin.astronautId || prior.sol < earliestSol || prior.sol >= checkin.sol) {
      continue;
    }
    const previous = bySol.get(prior.sol);
    const priorTime = Date.parse(prior.submittedAtUtc);
    if (!previous || priorTime > Date.parse(previous.submittedAtUtc)
      || (priorTime === Date.parse(previous.submittedAtUtc) && prior.id > previous.id)) {
      bySol.set(prior.sol, prior);
    }
  }

  return [...bySol.values()]
    .sort((left, right) => left.sol - right.sol)
    .map(reviewCheckin);
}

function metricReadings(metric: MetricId, checkins: readonly ReviewedCheckin[]): HealthMeasurement[] {
  return checkins.flatMap(({ measurements }) => {
    const reading = measurements.get(metric);
    return reading ? [reading] : [];
  });
}

function computeMedian(sortedNumbers: number[]): number {
  const center = Math.floor(sortedNumbers.length / 2);
  return sortedNumbers.length % 2 === 1
    ? sortedNumbers[center]
    : sortedNumbers[center - 1] / 2 + sortedNumbers[center] / 2;
}

function buildBaseline(metric: MetricId, prior: readonly ReviewedCheckin[]): Baseline | null {
  const readings = metricReadings(metric, prior);
  if (readings.length < MIN_BASELINE_READINGS) return null;

  const values = readings.map(({ value }) => value).sort((left, right) => left - right);
  const median = computeMedian(values);
  const deviations = values.map(v => Math.abs(v - median)).sort((left, right) => left - right);
  const mad = computeMedian(deviations);

  return {
    metric,
    median,
    mad,
    count: readings.length,
    lookbackSols: BASELINE_LOOKBACK_SOLS,
    inputMeasurementIds: readings.map(({ id }) => id),
  };
}

export function metricBaseline(metric: MetricId, checkin: DailyCheckin, history: readonly DailyCheckin[]): Baseline | null {
  return buildBaseline(metric, priorCheckins(checkin, history));
}

export function usableMeasurement(checkin: DailyCheckin, metric: MetricId): HealthMeasurement | undefined {
  return reviewCheckin(checkin).measurements.get(metric);
}

function deltaDirection(value: number, baseline: Baseline): Direction {
  const difference = value - baseline.median;
  const roundoff = Number.EPSILON * Math.max(Math.abs(value), Math.abs(baseline.median), 1);
  if (Math.abs(difference) + roundoff < DEMO_DELTAS[baseline.metric]) return 0;
  if (difference === 0) return 0;
  return difference < 0 ? -1 : 1;
}

function finding(
  ruleId: RuleId,
  kind: Finding['kind'],
  summary: string,
  inputMeasurementIds: string[] = [],
  baselineUsed: Baseline[] = [],
): Finding {
  const rule = RULES[ruleId];
  return { kind, ruleId, summary, inputMeasurementIds, baselineUsed, sourceRefs: [...rule.sourceRefs], reviewStatus: rule.reviewStatus };
}

function assessMetric(
  metric: MetricId,
  current: ReviewedCheckin,
  prior: readonly ReviewedCheckin[],
  recent: readonly ReviewedCheckin[],
): { status: DomainStatus; finding?: Finding; sustainedLower?: boolean } {
  const { label } = METRICS[metric];
  if (current.issues.has(metric)) return { status: 'check_entry' };

  const reading = current.measurements.get(metric);
  if (!reading) {
    return { status: 'not_measured', finding: finding('data-unavailable', 'data_unavailable', `${label} was not measured.`) };
  }

  const baseline = buildBaseline(metric, prior);
  if (!baseline) {
    return {
      status: 'baseline_not_established',
      finding: finding('data-unavailable', 'data_unavailable', `${label} baseline not established. At least ${MIN_BASELINE_READINGS} measured sols are needed in the prior ${BASELINE_LOOKBACK_SOLS} sols.`, [reading.id]),
    };
  }

  const recentReadings = metricReadings(metric, recent);
  const directions = recentReadings.map(({ value }) => deltaDirection(value, baseline));
  const below = directions.filter((direction) => direction === -1).length;
  const above = directions.filter((direction) => direction === 1).length;
  if (below >= MIN_TREND_READINGS || above >= MIN_TREND_READINGS) {
    const sustainedLower = below >= MIN_TREND_READINGS;
    const count = sustainedLower ? below : above;
    const relation = sustainedLower ? 'below' : 'above';
    return {
      status: 'sustained_trend',
      finding: finding('sustained-trend', 'trend', `${label} was ${relation} its personal baseline by the demo delta on ${count} of the last ${TREND_LOOKBACK_SOLS} sols.`, recentReadings.map(({ id }) => id), [baseline]),
      sustainedLower,
    };
  }

  const direction = deltaDirection(reading.value, baseline);
  if (direction !== 0) {
    const relation = direction < 0 ? 'below' : 'above';
    return {
      status: 'change_from_baseline',
      finding: finding('baseline-change', 'observation', `${label} was ${relation} its personal baseline by at least the demo delta.`, [reading.id], [baseline]),
    };
  }

  return { status: 'no_change_detected' };
}

function assessSymptoms(current: DailyCheckin, recent: readonly ReviewedCheckin[]): { status: DomainStatus; findings: Finding[] } {
  if (current.symptoms.length === 0) return { status: 'not_measured', findings: [] };

  const previous = recent.at(-2)?.checkin.symptoms ?? [];
  let status: DomainStatus = 'no_change_detected';
  const findings: Finding[] = [];
  for (const symptom of current.symptoms) {
    if (!symptom.present) continue;

    const count = recent.filter(({ checkin }) => checkin.symptoms.some(({ id, present }) => id === symptom.id && present)).length;
    if (count >= MIN_TREND_READINGS) {
      status = 'sustained_trend';
      findings.push(finding('reported-symptoms', 'trend', `${symptom.label} was reported on ${count} of the last ${TREND_LOOKBACK_SOLS} sols.`));
      continue;
    }

    const prior = previous.find(({ id }) => id === symptom.id);
    const symptomStatus = prior?.present === false ? 'change_from_baseline' : prior ? 'no_change_detected' : 'baseline_not_established';
    if (statusPriority[symptomStatus] > statusPriority[status]) status = symptomStatus;
    findings.push(finding('reported-symptoms', 'observation', `${symptom.label} was reported on Sol ${current.sol}.`));
  }

  return { status, findings };
}

export function evaluateCheckin(
  checkin: DailyCheckin,
  history: readonly DailyCheckin[],
  context?: AssessmentContext,
): RiskAssessment {
  const prior = priorCheckins(checkin, history);
  const current = reviewCheckin(checkin);
  const recent = [...prior.filter(({ checkin: record }) => record.sol > checkin.sol - TREND_LOOKBACK_SOLS), current];
  const domainStatuses = Object.fromEntries(HEALTH_DOMAINS.map((domain) => [domain, 'no_change_detected'])) as Record<HealthDomain, DomainStatus>;
  const findings: Finding[] = [];
  const dataQualityWarnings = [...new Set(current.issues.values())];
  const lowerTrends = new Map<MetricId, Finding>();

  if (dataQualityWarnings.length > 0) {
    const inputIds = checkin.measurements.filter(({ metric }) => current.issues.has(metric)).map(({ id }) => id);
    findings.push(finding('entry-quality', 'data_quality', dataQualityWarnings.join(' '), inputIds));
  }

  for (const metric of METRIC_IDS) {
    const { domain } = METRICS[metric];
    const result = assessMetric(metric, current, prior, recent);
    if (statusPriority[result.status] > statusPriority[domainStatuses[domain]]) domainStatuses[domain] = result.status;
    if (result.finding) {
      findings.push(result.finding);
      if (result.sustainedLower) lowerTrends.set(metric, result.finding);
    }
  }

  const sleep = lowerTrends.get('sleep_duration');
  const mood = lowerTrends.get('mood');
  if (sleep && mood) {
    const inputs = [
      ...sleep.inputMeasurementIds,
      ...mood.inputMeasurementIds,
    ];
    const baselines = [...sleep.baselineUsed, ...mood.baselineUsed];
    findings.push(finding('combined-sleep-mood', 'trend', 'Sleep duration and mood both met the sustained lower-trend demo rule.', inputs, baselines));
    const archive = context?.archiveEvent;
    if (archive && archive.sol > checkin.sol - TREND_LOOKBACK_SOLS && archive.sol <= checkin.sol
      && context.events.some((event) => event.kind === 'shelter_protocol' && event.provenance === 'synthetic_demo'
        && event.startSol <= archive.sol && event.endSol >= archive.sol)) {
      findings.push(finding(
        'archive-replay-context',
        'contextual_association',
        `A synthetic shelter event and the ${archive.date} RadLab replay share Sol ${archive.sol} within the sleep and mood review window. Timing alone cannot establish a cause.`,
        inputs,
        baselines,
      ));
    }
  }

  const symptomResult = assessSymptoms(checkin, recent);
  domainStatuses.symptoms = symptomResult.status;
  findings.push(...symptomResult.findings);
  findings.sort((left, right) => RULES[right.ruleId].priority - RULES[left.ruleId].priority);
  const actionCardIds = [...new Set(findings.flatMap(({ ruleId }) => RULES[ruleId].actionCardIds))];

  let overallState: AssessmentState = 'no_concern_identified';
  if (dataQualityWarnings.length > 0) {
    overallState = 'remeasurement_recommended';
  } else if (sleep && mood) {
    overallState = 'escalation_recommended';
  } else if (findings.some(f => f.kind === 'trend')) {
    overallState = 'attention_required';
  } else if (findings.some(f => f.kind === 'observation')) {
    overallState = 'monitor';
  } else if (findings.some(f => f.kind === 'data_unavailable')) {
    overallState = 'insufficient_information';
  }

  return {
    checkinId: checkin.id,
    findings,
    domainStatuses,
    dataQualityWarnings,
    recommendedTier: sleep && mood ? 'crew_medical_officer' : 'self_care',
    actionCardIds: actionCardIds.length > 0 ? actionCardIds : ['record-and-monitor'],
    engineVersion: '1.2.0',
    overallState,
  };
}
