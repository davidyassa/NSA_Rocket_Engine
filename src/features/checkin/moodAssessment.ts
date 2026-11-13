/**
 * Crew Mood Assessment MCQ Specification & Scoring Engine
 *
 * Implements the 6-question standardized psychological/behavioral MCQ
 * and the 9 cross-metric clinical adjustment rules from the Crew Health System.
 */

export interface MoodMcqAnswers {
  q1_emotional_state?: number;
  q2_sleep_restfulness?: number;
  q3_workload?: number;
  q4_crew_connection?: number;
  q5_focus_concentration?: number;
  q6_physical_comfort?: number;
}

export interface MoodQuestionOption {
  score: number;
  label: string;
}

export interface MoodQuestion {
  id: keyof MoodMcqAnswers;
  number: number;
  title: string;
  prompt: string;
  options: readonly MoodQuestionOption[];
}

export const MOOD_QUESTIONS: readonly MoodQuestion[] = [
  {
    id: 'q1_emotional_state',
    number: 1,
    title: 'Emotional state & energy',
    prompt: 'How would you describe your overall emotional state and energy level right now?',
    options: [
      { score: 5, label: 'Very positive, energized, and motivated' },
      { score: 4, label: 'Generally good, calm, and steady' },
      { score: 3, label: 'Neutral, neither particularly good nor bad' },
      { score: 2, label: 'Somewhat low, irritable, or mentally drained' },
      { score: 1, label: 'Very low, overwhelmed, anxious, or deeply fatigued' },
    ],
  },
  {
    id: 'q2_sleep_restfulness',
    number: 2,
    title: 'Sleep restfulness & restoration',
    prompt: 'How restful and restorative did your sleep feel during your most recent rest period?',
    options: [
      { score: 5, label: 'Completely rested and refreshed upon waking' },
      { score: 4, label: 'Mostly rested with minor interruptions' },
      { score: 3, label: 'Adequate, though I feel slightly groggy' },
      { score: 2, label: 'Restless or fragmented, leaving me noticeably tired' },
      { score: 1, label: 'Extremely poor or severely lacking, feeling exhausted' },
    ],
  },
  {
    id: 'q3_workload',
    number: 3,
    title: 'Workload & mission schedule',
    prompt: 'How manageable does your current workload and mission schedule feel today?',
    options: [
      { score: 5, label: 'Easily manageable with extra mental capacity to spare' },
      { score: 4, label: 'Well-paced and comfortable to handle' },
      { score: 3, label: 'Moderate, requiring steady focus to keep up' },
      { score: 2, label: 'Heavy and stressful, feeling pressured to complete tasks' },
      { score: 1, label: 'Overwhelming and unmanageable, causing high frustration' },
    ],
  },
  {
    id: 'q4_crew_connection',
    number: 4,
    title: 'Crew connection & cooperation',
    prompt: 'How connected and cooperative do you feel with your fellow crewmates today?',
    options: [
      { score: 5, label: 'Strongly connected, supportive, and in sync with the team' },
      { score: 4, label: 'Cordial and comfortable during interactions' },
      { score: 3, label: 'Neutral, keeping mostly to myself without issues' },
      { score: 2, label: 'Slightly detached, misunderstood, or mildly annoyed by others' },
      { score: 1, label: 'Isolated, tense, or experiencing noticeable interpersonal friction' },
    ],
  },
  {
    id: 'q5_focus_concentration',
    number: 5,
    title: 'Focus & concentration',
    prompt: 'How well are you able to focus and concentrate on complex or routine tasks right now?',
    options: [
      { score: 5, label: 'Sharp, clear-headed, and highly focused' },
      { score: 4, label: 'Focused with only occasional minor distractions' },
      { score: 3, label: 'Average focus, requiring extra effort for detailed work' },
      { score: 2, label: 'Distracted, foggy, or struggling to maintain attention' },
      { score: 1, label: 'Unable to concentrate, experiencing severe mental fog or agitation' },
    ],
  },
  {
    id: 'q6_physical_comfort',
    number: 6,
    title: 'Physical comfort & attitude',
    prompt: 'How is your physical comfort affecting your outlook and attitude today?',
    options: [
      { score: 5, label: 'Feeling physically strong and completely comfortable' },
      { score: 4, label: 'Minor normal stiffness, not affecting my mood' },
      { score: 3, label: 'Noticeable mild discomfort, slightly distracting' },
      { score: 2, label: 'Bothersome physical symptoms making me irritable or sluggish' },
      { score: 1, label: 'Significant physical distress severely dragging down my mood' },
    ],
  },
] as const;

export interface MoodModifier {
  ruleId: string;
  name: string;
  adjustmentDescription: string;
  pointsDelta?: number;
  cappedAt?: number;
  forcedValue?: number;
  cmoReview?: boolean;
}

export interface MoodEvaluationContext {
  symptomIds?: readonly string[];
  sleepDuration?: number;
  sleepDurationBelowBaselineConsecutiveSols?: number;
  fluidIntakeLiters?: number;
  lowFluidConsecutiveSols?: number;
  exerciseMinutes?: number;
  lowExerciseConsecutiveSols?: number;
  hasOrthostaticIntolerance?: boolean;
  habitatCo2Mmhg?: number;
  hasRadiationShelterEvent?: boolean;
  radiationEventId?: string;
  personalMedianBaseline?: number;
}

export interface BaseMoodResult {
  rawMean: number | null;
  baseScore: number | null;
  classification: string;
  isComplete: boolean;
  answeredCount: number;
}

export interface FullMoodAssessmentResult {
  rawMean: number | null;
  baseScore: number | null;
  baseClassification: string;
  adjustedScore: number | null;
  finalIntegerScore: number | null;
  finalClassification: string;
  isComplete: boolean;
  isProvisional: boolean;
  modifiers: MoodModifier[];
  needsCmoReview: boolean;
  environmentalCo2Factor: boolean;
  archiveReplayTag: string | null;
}

/**
 * Step 1: Base MCQ Score Calculation
 * Sum the points from all 6 questions and divide by 6.
 * Returns Base Mood Score and classification.
 */
export function calculateBaseMoodScore(answers: MoodMcqAnswers): BaseMoodResult {
  const scores = [
    answers.q1_emotional_state,
    answers.q2_sleep_restfulness,
    answers.q3_workload,
    answers.q4_crew_connection,
    answers.q5_focus_concentration,
    answers.q6_physical_comfort,
  ];

  const validScores = scores.filter((s): s is number => typeof s === 'number' && Number.isFinite(s) && s >= 1 && s <= 5);
  const answeredCount = validScores.length;

  if (answeredCount === 0) {
    return {
      rawMean: null,
      baseScore: null,
      classification: 'Not measured',
      isComplete: false,
      answeredCount: 0,
    };
  }

  const sum = validScores.reduce((acc, val) => acc + val, 0);
  const mean = sum / answeredCount;
  const rawMean = Math.round(mean * 100) / 100;

  if (answeredCount < 6) {
    return {
      rawMean,
      baseScore: Math.max(1, Math.min(5, Math.round(mean))),
      classification: 'Provisional (Incomplete Data)',
      isComplete: false,
      answeredCount,
    };
  }

  // 6 of 6 answered: standard classification
  let baseScore = 3;
  let classification = 'Neutral / Moderate';
  if (mean >= 4.5) {
    baseScore = 5;
    classification = 'Optimal / High';
  } else if (mean >= 3.5) {
    baseScore = 4;
    classification = 'Good / Stable';
  } else if (mean >= 2.5) {
    baseScore = 3;
    classification = 'Neutral / Moderate';
  } else if (mean >= 1.5) {
    baseScore = 2;
    classification = 'Low / Strained';
  } else {
    baseScore = 1;
    classification = 'Critical / Distressed';
  }

  return {
    rawMean,
    baseScore,
    classification,
    isComplete: true,
    answeredCount: 6,
  };
}

/**
 * Step 2: Cross-Metric Adjustments and Evaluation Rules
 * Evaluates the 9 rules and calculates the finalized mood score (1 to 5).
 */
export function evaluateFullMoodAssessment(
  answers: MoodMcqAnswers,
  context: MoodEvaluationContext = {},
): FullMoodAssessmentResult {
  const base = calculateBaseMoodScore(answers);
  const modifiers: MoodModifier[] = [];
  let needsCmoReview = false;
  let environmentalCo2Factor = false;
  let archiveReplayTag: string | null = null;

  if (base.baseScore === null || base.rawMean === null) {
    return {
      rawMean: null,
      baseScore: null,
      baseClassification: 'Not measured',
      adjustedScore: null,
      finalIntegerScore: null,
      finalClassification: 'Not measured',
      isComplete: false,
      isProvisional: false,
      modifiers: [],
      needsCmoReview: false,
      environmentalCo2Factor: false,
      archiveReplayTag: null,
    };
  }

  let runningScore = base.rawMean;

  // Rule 1: Entry Quality & Data Unavailable
  const isProvisional = !base.isComplete;
  if (isProvisional) {
    modifiers.push({
      ruleId: 'entry-quality',
      name: 'Entry Quality / Incomplete Data',
      adjustmentDescription: `Provisional mood score: ${base.answeredCount} of 6 MCQ questions answered. Trend alerts held pending verification.`,
    });
  }

  // Rule 3: Urgent Symptoms (Immediate Override to 1)
  const symptoms = context.symptomIds ?? [];
  const hasUrgentSymptoms = symptoms.includes('chest_discomfort') || symptoms.includes('shortness_of_breath');
  if (hasUrgentSymptoms) {
    modifiers.push({
      ruleId: 'urgent-symptoms',
      name: 'Urgent Medical Symptoms Override',
      adjustmentDescription: 'Chest discomfort or shortness of breath reported. Mood status overridden to 1 (Critical / Medical Priority). Immediate CMO review triggered.',
      forcedValue: 1,
      cmoReview: true,
    });
    needsCmoReview = true;
    runningScore = 1.0;
  } else {
    // Rule 2: Combined Sleep and Mood
    const q2Score = answers.q2_sleep_restfulness;
    const sleepBelowBaselineConsecutive = context.sleepDurationBelowBaselineConsecutiveSols ?? 0;
    if (q2Score !== undefined && q2Score <= 2 && sleepBelowBaselineConsecutive >= 2) {
      runningScore -= 0.5;
      modifiers.push({
        ruleId: 'combined-sleep-mood',
        name: 'Combined Sleep and Mood Strain',
        adjustmentDescription: 'Question 2 score <= 2 and sleep duration below baseline for >= 2 consecutive sols: -0.5 points. CMO review recommended.',
        pointsDelta: -0.5,
        cmoReview: true,
      });
      needsCmoReview = true;
    }

    // Rule 4: CO2 Headache Context
    const q6Score = answers.q6_physical_comfort;
    const hasHeadache = symptoms.includes('headache');
    const co2Level = context.habitatCo2Mmhg ?? 0;
    if (q6Score !== undefined && q6Score <= 3 && hasHeadache && co2Level >= 3.0) {
      environmentalCo2Factor = true;
      if (runningScore > 3.0) {
        runningScore = 3.0;
      }
      modifiers.push({
        ruleId: 'co2-headache-context',
        name: 'Environmental CO2 Factor',
        adjustmentDescription: `Physical comfort score <= 3 and headache during habitat CO2 >= 3.0 mmHg (${co2Level} mmHg): Capped at 3.0 with environmental context annotation.`,
        cappedAt: 3,
      });
    }

    // Rule 5: Motion Sickness Pattern and SANS Screen
    const vestibularSymptoms = ['dizziness', 'vertigo', 'nausea', 'vomiting', 'balance_problems'];
    const sansSymptoms = ['vision_changes', 'head_fullness'];
    const hasVestibular = vestibularSymptoms.some(s => symptoms.includes(s));
    const hasSans = sansSymptoms.some(s => symptoms.includes(s));
    if (hasVestibular || hasSans) {
      runningScore -= 0.5;
      modifiers.push({
        ruleId: 'motion-sickness-pattern',
        name: 'Vestibular & Neuro-Ocular Physiological Strain',
        adjustmentDescription: 'Active motion sickness or visual/fluid shift symptoms: -0.5 points linked to physiological screen.',
        pointsDelta: -0.5,
      });
    }

    // Rule 6: Low Hydration & Countermeasure Adherence
    const lowFluidConsecutive = context.lowFluidConsecutiveSols ?? 0;
    const lowExerciseConsecutive = context.lowExerciseConsecutiveSols ?? 0;
    const baseMoodIsModerateOrLow = base.baseScore <= 3;
    if ((lowFluidConsecutive >= 2 || lowExerciseConsecutive >= 2) && baseMoodIsModerateOrLow) {
      runningScore -= 0.25;
      modifiers.push({
        ruleId: 'countermeasure-adherence',
        name: 'Countermeasure Adherence Deficit',
        adjustmentDescription: 'Fluid intake < 2.0 L or exercise < 90 min over >= 2 consecutive sols with base mood <= 3: -0.25 points. Hydration/exercise intervention recommended.',
        pointsDelta: -0.25,
      });
    }

    // Rule 7: Orthostatic Check
    if (context.hasOrthostaticIntolerance) {
      if (runningScore > 3.0) {
        runningScore = 3.0;
      }
      modifiers.push({
        ruleId: 'orthostatic-check',
        name: 'Orthostatic Cardiovascular Check',
        adjustmentDescription: 'Seated-to-standing blood pressure drop or pulse rise indicates potential orthostatic intolerance: Capped at 3.0 pending cardiovascular stability.',
        cappedAt: 3,
      });
    }
  }

  // Clamp final score between 1.0 and 5.0
  const adjustedScore = Math.max(1.0, Math.min(5.0, Math.round(runningScore * 100) / 100));

  // Determine final integer classification
  let finalIntegerScore = 3;
  let finalClassification = 'Neutral / Moderate';
  if (adjustedScore >= 4.5) {
    finalIntegerScore = 5;
    finalClassification = 'Optimal / High';
  } else if (adjustedScore >= 3.5) {
    finalIntegerScore = 4;
    finalClassification = 'Good / Stable';
  } else if (adjustedScore >= 2.5) {
    finalIntegerScore = 3;
    finalClassification = 'Neutral / Moderate';
  } else if (adjustedScore >= 1.5) {
    finalIntegerScore = 2;
    finalClassification = 'Low / Strained';
  } else {
    finalIntegerScore = 1;
    finalClassification = 'Critical / Distressed';
  }

  // Rule 8: Baseline Change & Sustained Trend
  const baseline = context.personalMedianBaseline;
  if (baseline !== undefined && Number.isFinite(baseline)) {
    const drop = baseline - finalIntegerScore;
    if (drop >= 1) {
      modifiers.push({
        ruleId: 'baseline-change',
        name: 'Personal Baseline Deviation',
        adjustmentDescription: `Final score of ${finalIntegerScore} is ${drop} point(s) below personal baseline median (${baseline}). CMO follow-up surfaced.`,
        cmoReview: drop >= 2,
      });
      if (drop >= 2) needsCmoReview = true;
    }
  }

  // Rule 9: Archive Replay Context (Radiation Shelter Tagging)
  if (finalIntegerScore <= 2 && context.hasRadiationShelterEvent) {
    archiveReplayTag = context.radiationEventId ?? 'shelter-protocol-event';
    modifiers.push({
      ruleId: 'archive-replay-context',
      name: 'Archive Replay Context',
      adjustmentDescription: `Mood score of ${finalIntegerScore} recorded during/following active radiation shelter protocol (${archiveReplayTag}). Acute confinement stress distinguished from chronic behavioral drift.`,
    });
  }

  return {
    rawMean: base.rawMean,
    baseScore: base.baseScore,
    baseClassification: base.classification,
    adjustedScore,
    finalIntegerScore,
    finalClassification,
    isComplete: base.isComplete,
    isProvisional,
    modifiers,
    needsCmoReview,
    environmentalCo2Factor,
    archiveReplayTag,
  };
}
