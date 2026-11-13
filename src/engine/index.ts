import {
  HEALTH_DOMAINS,
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
  CO2_LIMIT_MMHG,
  CORE_METRIC_IDS,
  EXERCISE_TARGET_MIN,
  FLUID_TARGET_L,
  MOTION_SICKNESS_SYMPTOMS,
  ORTHOSTATIC,
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
    } else if (measurement.status === 'rejected_low_quality') {
      issue = `${metadata.label} was rejected because its signal quality was insufficient. Repeat the measurement.`;
    } else if (measurement.status === 'missing' || measurement.status === 'corrected') {
      issue = `${metadata.label} is not an active measurement and was excluded from the assessment.`;
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

  const standingSystolic = measurements.get('bp_systolic_standing');
  const standingDiastolic = measurements.get('bp_diastolic_standing');
  if (seen.has('bp_systolic_standing') || seen.has('bp_diastolic_standing')) {
    let pairIssue: string | undefined;
    if (!standingSystolic || !standingDiastolic) {
      pairIssue = 'Enter both standing blood pressure values together.';
    } else if (standingSystolic.value <= standingDiastolic.value) {
      pairIssue = 'Standing systolic blood pressure must be greater than diastolic.';
    }
    if (pairIssue) {
      issues.set('bp_systolic_standing', issues.get('bp_systolic_standing') ?? pairIssue);
      issues.set('bp_diastolic_standing', issues.get('bp_diastolic_standing') ?? pairIssue);
      measurements.delete('bp_systolic_standing');
      measurements.delete('bp_diastolic_standing');
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

function present(checkin: DailyCheckin, id: string): boolean {
  return checkin.symptoms.some((symptom) => symptom.id === id && symptom.present);
}

/** Stand-up test: seated vs standing on the same check-in. */
function assessOrthostatic(current: ReviewedCheckin): Finding | null {
  const m = current.measurements;
  const seatedSys = m.get('bp_systolic'); const seatedDia = m.get('bp_diastolic'); const seatedHr = m.get('heart_rate');
  const standSys = m.get('bp_systolic_standing'); const standDia = m.get('bp_diastolic_standing'); const standHr = m.get('heart_rate_standing');
  const parts: string[] = [];
  const inputs: string[] = [];
  if (seatedSys && seatedDia && standSys && standDia) {
    const sysDrop = seatedSys.value - standSys.value;
    const diaDrop = seatedDia.value - standDia.value;
    if (sysDrop >= ORTHOSTATIC.systolicDrop || diaDrop >= ORTHOSTATIC.diastolicDrop) {
      parts.push(`blood pressure fell by ${sysDrop}/${diaDrop} mmHg`);
      inputs.push(seatedSys.id, seatedDia.id, standSys.id, standDia.id);
    }
  }
  if (seatedHr && standHr) {
    const rise = standHr.value - seatedHr.value;
    if (rise >= ORTHOSTATIC.heartRateRise) {
      parts.push(`pulse rose by ${rise} bpm`);
      inputs.push(seatedHr.id, standHr.id);
    }
  }
  if (!parts.length) return null;
  return finding('orthostatic-check', 'observation', `On standing, ${parts.join(' and ')} (stand-up test). Show the Crew Medical Officer.`, inputs);
}

/** Count recent logged sols where a reading meets a condition. */
function countRecent(metric: MetricId, recent: readonly ReviewedCheckin[], test: (value: number) => boolean) {
  const readings = metricReadings(metric, recent);
  return { readings, count: readings.filter(({ value }) => test(value)).length };
}

function assessHydration(current: ReviewedCheckin, recent: readonly ReviewedCheckin[]): Finding | null {
  const today = current.measurements.get('fluid_intake');
  if (!today || today.value >= FLUID_TARGET_L) return null;
  const { readings, count } = countRecent('fluid_intake', recent, (value) => value < FLUID_TARGET_L);
  if (count >= MIN_TREND_READINGS) {
    return finding('hydration-low', 'trend', `Fluid intake was below ${FLUID_TARGET_L} L on ${count} of the last ${TREND_LOOKBACK_SOLS} sols.`, readings.map(({ id }) => id));
  }
  return finding('hydration-low', 'observation', `Fluid intake was ${today.value} L, below the ${FLUID_TARGET_L} L demo minimum.`, [today.id]);
}

function assessExercise(current: ReviewedCheckin, recent: readonly ReviewedCheckin[]): Finding | null {
  if (!current.measurements.get('exercise_minutes')) return null;
  const { readings, count } = countRecent('exercise_minutes', recent, (value) => value < EXERCISE_TARGET_MIN);
  if (count < MIN_TREND_READINGS) return null;
  return finding('countermeasure-adherence', 'trend', `Exercise was below the ${EXERCISE_TARGET_MIN}-minute target on ${count} of the last ${TREND_LOOKBACK_SOLS} sols. This tracks the countermeasure, not muscle or bone directly.`, readings.map(({ id }) => id));
}

function assessMotionSickness(checkin: DailyCheckin): Finding | null {
  const reported = MOTION_SICKNESS_SYMPTOMS.filter((id) => present(checkin, id));
  if (reported.length < 2) return null;
  const labels = checkin.symptoms.filter((s) => (reported as readonly string[]).includes(s.id)).map((s) => s.label.toLowerCase());
  return finding('motion-sickness-pattern', 'observation', `Possible space motion sickness: ${labels.join(', ')} reported together.`);
}

function assessSans(checkin: DailyCheckin): Finding | null {
  const vision = present(checkin, 'vision_changes');
  const fullness = present(checkin, 'head_fullness');
  if (!vision && !fullness) return null;
  return finding('sans-screen', 'observation', vision
    ? 'Blurred or changed vision reported. A Crew Medical Officer eye check is recommended (fluid shift can affect the eyes).'
    : 'Puffy face or head fullness reported, a sign of fluid shift. Keep watching and report any vision change.');
}

function assessCo2(recent: readonly ReviewedCheckin[], context?: AssessmentContext): Finding | null {
  const environment = context?.environment;
  if (!environment?.length) return null;
  const hits = recent.filter(({ checkin }) => present(checkin, 'headache')
    && (environment.find((sample) => sample.sol === checkin.sol)?.co2Mmhg ?? 0) >= CO2_LIMIT_MMHG);
  if (!hits.length) return null;
  const detail = hits.map(({ checkin }) => `Sol ${checkin.sol} (${environment.find((s) => s.sol === checkin.sol)?.co2Mmhg} mmHg)`).join(', ');
  return finding('co2-headache-context', 'contextual_association', `Headaches were reported when habitat CO2 was at or above ${CO2_LIMIT_MMHG} mmHg: ${detail}. Timing alone cannot establish a cause.`);
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

  for (const metric of CORE_METRIC_IDS) {
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
  const urgentSymptoms = checkin.symptoms.filter(symptom => symptom.present
    && (symptom.id === 'chest_discomfort' || symptom.id === 'shortness_of_breath'));
  if (urgentSymptoms.length > 0) {
    findings.push(finding(
      'urgent-symptoms',
      'observation',
      `${urgentSymptoms.map(symptom => symptom.label).join(' and ')} reported. Crew Medical Officer review is recommended without waiting for a baseline or trend.`,
    ));
  }
  // Entry problems in the optional readings (e.g. a reversed standing pair) mark the cardiovascular area for re-entry.
  if (current.issues.has('bp_systolic_standing') || current.issues.has('heart_rate_standing')) {
    domainStatuses.cardiovascular = 'check_entry';
  }
  const orthostatic = assessOrthostatic(current);
  if (orthostatic) {
    findings.push(orthostatic);
    if (statusPriority.change_from_baseline > statusPriority[domainStatuses.cardiovascular]) domainStatuses.cardiovascular = 'change_from_baseline';
  }
  const hydration = assessHydration(current, recent);
  if (hydration) findings.push(hydration);
  const exercise = assessExercise(current, recent);
  if (exercise) findings.push(exercise);
  const motionSickness = assessMotionSickness(checkin);
  if (motionSickness) findings.push(motionSickness);
  const sans = assessSans(checkin);
  if (sans) findings.push(sans);
  const co2 = assessCo2(recent, context);
  if (co2) findings.push(co2);
  const needsMedicalOfficer = urgentSymptoms.length > 0 || Boolean(sleep && mood) || Boolean(orthostatic)
    || present(checkin, 'vision_changes') || present(checkin, 'vomiting');

  findings.sort((left, right) => RULES[right.ruleId].priority - RULES[left.ruleId].priority);
  const actionCardIds = [...new Set(findings.flatMap(({ ruleId }) => RULES[ruleId].actionCardIds))];

  let overallState: AssessmentState = 'no_concern_identified';
  if (needsMedicalOfficer) {
    overallState = 'escalation_recommended';
  } else if (dataQualityWarnings.length > 0) {
    overallState = 'remeasurement_recommended';
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
    recommendedTier: needsMedicalOfficer ? 'crew_medical_officer' : 'self_care',
    actionCardIds: actionCardIds.length > 0 ? actionCardIds : ['record-and-monitor'],
    engineVersion: '1.4.0',
    overallState,
  };
}
