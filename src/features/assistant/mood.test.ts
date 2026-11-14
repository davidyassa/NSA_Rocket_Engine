import { describe, expect, it } from 'vitest';
import { moodReply, parseMoodAnswer } from './mood';

describe('spoken mood answers', () => {
  it('understands digits, number words and option words', () => {
    expect(parseMoodAnswer('Four', 0)).toBe(4);
    expect(parseMoodAnswer('I would say 2', 0)).toBe(2);
    expect(parseMoodAnswer('maybe three', 0)).toBe(3);
    expect(parseMoodAnswer('I feel calm and steady', 0)).toBe(4);
    expect(parseMoodAnswer('banana', 0)).toBeNull();
  });

  it('routes a low mood check to a person', () => {
    const low = moodReply({ q1_emotional_state: 2, q2_sleep_restfulness: 2, q3_workload: 2, q4_crew_connection: 2, q5_focus_concentration: 2, q6_physical_comfort: 2 });
    expect(low.text).toMatch(/crew medical officer/);
    const good = moodReply({ q1_emotional_state: 5, q2_sleep_restfulness: 4, q3_workload: 4, q4_crew_connection: 5, q5_focus_concentration: 4, q6_physical_comfort: 4 });
    expect(good.text).toMatch(/steady/);
  });
});
