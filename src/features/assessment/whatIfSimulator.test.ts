import { describe, expect, it } from 'vitest';
import { evaluateCheckin } from '../../engine';
import { type DailyCheckin } from '../../contracts';

describe('What-If Scenario Projection (D4)', () => {
  it('correctly predicts clearing of sustained lower-trend when sleep and mood recover', () => {
    // Synthetic history matching Sol 43 where sols 39, 41, 42 were low
    const lowSols = new Set([39, 41, 42]);
    const history: DailyCheckin[] = Array.from({ length: 43 }, (_, index) => {
      const sol = index + 1;
      return {
        id: `checkin-${sol}`,
        astronautId: 'crew-1',
        sol,
        submittedAtUtc: new Date(1700000000000 + sol * 88775000).toISOString(),
        measurements: [
          {
            id: `m-sleep-${sol}`,
            astronautId: 'crew-1',
            metric: 'sleep_duration',
            value: sol === 43 ? 4.5 : (lowSols.has(sol) ? 5.0 : 7.5),
            unit: 'h',
            observedAtUtc: new Date().toISOString(),
            provenance: 'synthetic_demo',
          },
          {
            id: `m-mood-${sol}`,
            astronautId: 'crew-1',
            metric: 'mood',
            value: sol === 43 ? 2 : (lowSols.has(sol) ? 2 : 4),
            unit: 'score_1_5',
            observedAtUtc: new Date().toISOString(),
            provenance: 'synthetic_demo',
          },
        ],
        symptoms: [],
        note: '',
      };
    });

    // Current Sol 43 assessment
    const sol43 = history[42];
    const assessment43 = evaluateCheckin(sol43, history.slice(0, 42));
    expect(assessment43.recommendedTier).toBe('crew_medical_officer');

    // Hypothetical Sol 44 with healthy recovery: Sleep=8h, Mood=4
    const hypothetical44: DailyCheckin = {
      id: 'what-if-sol-44',
      astronautId: 'crew-1',
      sol: 44,
      submittedAtUtc: new Date(1700000000000 + 44 * 88775000).toISOString(),
      measurements: [
        {
          id: 'hypo-sleep-44',
          astronautId: 'crew-1',
          metric: 'sleep_duration',
          value: 8.0,
          unit: 'h',
          observedAtUtc: new Date().toISOString(),
          provenance: 'derived',
        },
        {
          id: 'hypo-mood-44',
          astronautId: 'crew-1',
          metric: 'mood',
          value: 4,
          unit: 'score_1_5',
          observedAtUtc: new Date().toISOString(),
          provenance: 'derived',
        },
      ],
      symptoms: [],
      note: 'Hypothetical recovery',
    };

    // Projected assessment for Sol 44
    const assessment44 = evaluateCheckin(hypothetical44, history);
    // In lookback window [40, 41, 42, 43, 44]:
    // Sol 40 = 7.5 (normal)
    // Sol 41 = 5.0 (low)
    // Sol 42 = 5.0 (low)
    // Sol 43 = 4.5 (low)
    // Sol 44 = 8.0 (normal)
    // 3 of 5 are low, so sustained lower trend still triggers on Sol 44
    expect(assessment44.recommendedTier).toBe('crew_medical_officer');

    // Hypothetical Sol 45 with continued healthy recovery: Sleep=8h, Mood=4
    const historyWith44 = [...history, hypothetical44];
    const hypothetical45: DailyCheckin = {
      id: 'what-if-sol-45',
      astronautId: 'crew-1',
      sol: 45,
      submittedAtUtc: new Date(1700000000000 + 45 * 88775000).toISOString(),
      measurements: [
        {
          id: 'hypo-sleep-45',
          astronautId: 'crew-1',
          metric: 'sleep_duration',
          value: 8.0,
          unit: 'h',
          observedAtUtc: new Date().toISOString(),
          provenance: 'derived',
        },
        {
          id: 'hypo-mood-45',
          astronautId: 'crew-1',
          metric: 'mood',
          value: 4,
          unit: 'score_1_5',
          observedAtUtc: new Date().toISOString(),
          provenance: 'derived',
        },
      ],
      symptoms: [],
      note: 'Hypothetical recovery sol 45',
    };

    // Lookback window [41, 42, 43, 44, 45]:
    // Sol 41 = 5.0 (low)
    // Sol 42 = 5.0 (low)
    // Sol 43 = 4.5 (low)
    // Sol 44 = 8.0 (normal)
    // Sol 45 = 8.0 (normal)
    // Only 3 of 5 low. On Sol 46: window [42, 43, 44, 45, 46] -> 2 of 5 low -> CLEARS!
    const historyWith45 = [...historyWith44, hypothetical45];
    const hypothetical46: DailyCheckin = {
      id: 'what-if-sol-46',
      astronautId: 'crew-1',
      sol: 46,
      submittedAtUtc: new Date(1700000000000 + 46 * 88775000).toISOString(),
      measurements: [
        {
          id: 'hypo-sleep-46',
          astronautId: 'crew-1',
          metric: 'sleep_duration',
          value: 8.0,
          unit: 'h',
          observedAtUtc: new Date().toISOString(),
          provenance: 'derived',
        },
        {
          id: 'hypo-mood-46',
          astronautId: 'crew-1',
          metric: 'mood',
          value: 4,
          unit: 'score_1_5',
          observedAtUtc: new Date().toISOString(),
          provenance: 'derived',
        },
      ],
      symptoms: [],
      note: 'Hypothetical recovery sol 46',
    };

    const assessment46 = evaluateCheckin(hypothetical46, historyWith45);
    // Sol 46 only has 2 of 5 low (42, 43), so sustained trend CLEARS!
    expect(assessment46.recommendedTier).toBe('self_care');
  });
});
