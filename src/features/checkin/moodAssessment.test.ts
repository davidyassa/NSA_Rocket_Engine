import { describe, expect, it } from 'vitest';
import {
  calculateBaseMoodScore,
  evaluateFullMoodAssessment,
  MOOD_QUESTIONS,
  type MoodMcqAnswers,
} from './moodAssessment';

describe('Crew Mood Assessment MCQ & Scoring Engine', () => {
  it('defines the 6 standardized multiple-choice questions with 5 options each', () => {
    expect(MOOD_QUESTIONS).toHaveLength(6);
    for (const q of MOOD_QUESTIONS) {
      expect(q.options).toHaveLength(5);
      const scores = q.options.map(o => o.score);
      expect(scores).toEqual([5, 4, 3, 2, 1]);
      expect(q.prompt).toBeTruthy();
    }
  });

  it('calculates Step 1 Base Mood Score correctly across classifications', () => {
    // 5 Optimal: all 5s -> mean 5.0 -> score 5
    const optimalAnswers: MoodMcqAnswers = {
      q1_emotional_state: 5,
      q2_sleep_restfulness: 5,
      q3_workload: 5,
      q4_crew_connection: 5,
      q5_focus_concentration: 5,
      q6_physical_comfort: 5,
    };
    const resOptimal = calculateBaseMoodScore(optimalAnswers);
    expect(resOptimal.baseScore).toBe(5);
    expect(resOptimal.rawMean).toBe(5.0);
    expect(resOptimal.classification).toBe('Optimal / High');
    expect(resOptimal.isComplete).toBe(true);

    // 4 Good: sum = 24 -> mean 4.0 -> score 4
    const goodAnswers: MoodMcqAnswers = {
      q1_emotional_state: 4,
      q2_sleep_restfulness: 4,
      q3_workload: 4,
      q4_crew_connection: 4,
      q5_focus_concentration: 4,
      q6_physical_comfort: 4,
    };
    const resGood = calculateBaseMoodScore(goodAnswers);
    expect(resGood.baseScore).toBe(4);
    expect(resGood.classification).toBe('Good / Stable');

    // 3 Neutral: sum = 18 -> mean 3.0 -> score 3
    const neutralAnswers: MoodMcqAnswers = {
      q1_emotional_state: 3,
      q2_sleep_restfulness: 3,
      q3_workload: 3,
      q4_crew_connection: 3,
      q5_focus_concentration: 3,
      q6_physical_comfort: 3,
    };
    const resNeutral = calculateBaseMoodScore(neutralAnswers);
    expect(resNeutral.baseScore).toBe(3);
    expect(resNeutral.classification).toBe('Neutral / Moderate');

    // 2 Low: sum = 12 -> mean 2.0 -> score 2
    const lowAnswers: MoodMcqAnswers = {
      q1_emotional_state: 2,
      q2_sleep_restfulness: 2,
      q3_workload: 2,
      q4_crew_connection: 2,
      q5_focus_concentration: 2,
      q6_physical_comfort: 2,
    };
    const resLow = calculateBaseMoodScore(lowAnswers);
    expect(resLow.baseScore).toBe(2);
    expect(resLow.classification).toBe('Low / Strained');

    // 1 Critical: sum = 6 -> mean 1.0 -> score 1
    const critAnswers: MoodMcqAnswers = {
      q1_emotional_state: 1,
      q2_sleep_restfulness: 1,
      q3_workload: 1,
      q4_crew_connection: 1,
      q5_focus_concentration: 1,
      q6_physical_comfort: 1,
    };
    const resCrit = calculateBaseMoodScore(critAnswers);
    expect(resCrit.baseScore).toBe(1);
    expect(resCrit.classification).toBe('Critical / Distressed');
  });

  it('Rule 1: flags incomplete data as Provisional when questions are omitted', () => {
    const partial: MoodMcqAnswers = {
      q1_emotional_state: 4,
      q2_sleep_restfulness: 4,
    };
    const res = evaluateFullMoodAssessment(partial);
    expect(res.isComplete).toBe(false);
    expect(res.isProvisional).toBe(true);
    expect(res.baseClassification).toBe('Provisional (Incomplete Data)');
    expect(res.modifiers.some(m => m.ruleId === 'entry-quality')).toBe(true);
  });

  it('Rule 2: applies combined sleep and mood reduction of 0.5 points and flags CMO review', () => {
    const answers: MoodMcqAnswers = {
      q1_emotional_state: 4,
      q2_sleep_restfulness: 2, // Q2 <= 2
      q3_workload: 4,
      q4_crew_connection: 4,
      q5_focus_concentration: 4,
      q6_physical_comfort: 4,
    };
    // Mean without modifiers = 22 / 6 = 3.67
    const res = evaluateFullMoodAssessment(answers, {
      sleepDurationBelowBaselineConsecutiveSols: 2,
    });
    expect(res.modifiers.some(m => m.ruleId === 'combined-sleep-mood')).toBe(true);
    expect(res.needsCmoReview).toBe(true);
    expect(res.adjustedScore).toBe(3.17); // 3.67 - 0.5
  });

  it('Rule 3: urgent symptoms (chest discomfort or shortness of breath) immediately override mood to 1', () => {
    const optimalAnswers: MoodMcqAnswers = {
      q1_emotional_state: 5,
      q2_sleep_restfulness: 5,
      q3_workload: 5,
      q4_crew_connection: 5,
      q5_focus_concentration: 5,
      q6_physical_comfort: 5,
    };
    const res = evaluateFullMoodAssessment(optimalAnswers, {
      symptomIds: ['chest_discomfort'],
    });
    expect(res.finalIntegerScore).toBe(1);
    expect(res.finalClassification).toBe('Critical / Distressed');
    expect(res.needsCmoReview).toBe(true);
    expect(res.modifiers.some(m => m.ruleId === 'urgent-symptoms')).toBe(true);
  });

  it('Rule 4: CO2 headache context caps mood score at 3 with environmental annotation', () => {
    const answers: MoodMcqAnswers = {
      q1_emotional_state: 5,
      q2_sleep_restfulness: 5,
      q3_workload: 5,
      q4_crew_connection: 5,
      q5_focus_concentration: 5,
      q6_physical_comfort: 3, // Q6 <= 3
    };
    const res = evaluateFullMoodAssessment(answers, {
      symptomIds: ['headache'],
      habitatCo2Mmhg: 3.4,
    });
    expect(res.environmentalCo2Factor).toBe(true);
    expect(res.adjustedScore).toBeLessThanOrEqual(3.0);
    expect(res.modifiers.some(m => m.ruleId === 'co2-headache-context')).toBe(true);
  });

  it('Rule 5: motion sickness and SANS screen reduce final score by 0.5 points', () => {
    const answers: MoodMcqAnswers = {
      q1_emotional_state: 4,
      q2_sleep_restfulness: 4,
      q3_workload: 4,
      q4_crew_connection: 4,
      q5_focus_concentration: 4,
      q6_physical_comfort: 4,
    };
    const res = evaluateFullMoodAssessment(answers, {
      symptomIds: ['dizziness', 'nausea'],
    });
    expect(res.modifiers.some(m => m.ruleId === 'motion-sickness-pattern')).toBe(true);
    expect(res.adjustedScore).toBe(3.5); // 4.0 - 0.5
  });

  it('Rule 6: low hydration or exercise adherence reduces score by 0.25 points when base is <= 3', () => {
    const answers: MoodMcqAnswers = {
      q1_emotional_state: 3,
      q2_sleep_restfulness: 3,
      q3_workload: 3,
      q4_crew_connection: 3,
      q5_focus_concentration: 3,
      q6_physical_comfort: 3,
    };
    const res = evaluateFullMoodAssessment(answers, {
      lowFluidConsecutiveSols: 2,
    });
    expect(res.modifiers.some(m => m.ruleId === 'countermeasure-adherence')).toBe(true);
    expect(res.adjustedScore).toBe(2.75); // 3.0 - 0.25
  });

  it('Rule 7: orthostatic check caps mood score at 3', () => {
    const answers: MoodMcqAnswers = {
      q1_emotional_state: 5,
      q2_sleep_restfulness: 5,
      q3_workload: 5,
      q4_crew_connection: 5,
      q5_focus_concentration: 5,
      q6_physical_comfort: 5,
    };
    const res = evaluateFullMoodAssessment(answers, {
      hasOrthostaticIntolerance: true,
    });
    expect(res.adjustedScore).toBe(3.0);
    expect(res.modifiers.some(m => m.ruleId === 'orthostatic-check')).toBe(true);
  });

  it('Rule 8: baseline change surfaces alert when score drops below personal baseline', () => {
    const answers: MoodMcqAnswers = {
      q1_emotional_state: 2,
      q2_sleep_restfulness: 2,
      q3_workload: 2,
      q4_crew_connection: 2,
      q5_focus_concentration: 2,
      q6_physical_comfort: 2,
    };
    const res = evaluateFullMoodAssessment(answers, {
      personalMedianBaseline: 4,
    });
    expect(res.finalIntegerScore).toBe(2);
    expect(res.modifiers.some(m => m.ruleId === 'baseline-change')).toBe(true);
    expect(res.needsCmoReview).toBe(true); // drop of 2 points triggers CMO
  });

  it('Rule 9: archive replay tags low mood during radiation shelter protocol', () => {
    const answers: MoodMcqAnswers = {
      q1_emotional_state: 2,
      q2_sleep_restfulness: 2,
      q3_workload: 2,
      q4_crew_connection: 2,
      q5_focus_concentration: 2,
      q6_physical_comfort: 2,
    };
    const res = evaluateFullMoodAssessment(answers, {
      hasRadiationShelterEvent: true,
      radiationEventId: 'radlab-sol-43',
    });
    expect(res.archiveReplayTag).toBe('radlab-sol-43');
    expect(res.modifiers.some(m => m.ruleId === 'archive-replay-context')).toBe(true);
  });
});
