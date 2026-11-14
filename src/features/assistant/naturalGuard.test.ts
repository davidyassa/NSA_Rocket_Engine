import { describe, expect, it } from 'vitest';
import { canRewrite, verifyRewrite } from './naturalGuard';

const checked = 'Your sleep on Sol 43: 4.5 h. Your usual is 7.5 h. Talk to your crew medical officer today.';

describe('on-device model guard', () => {
  it('accepts a faithful, warmer rewording', () => {
    const r = verifyRewrite(checked, 'You slept 4.5 hours on Sol 43, well under your usual 7.5. It would be good to talk to your crew medical officer today.');
    expect(r.ok).toBe(true);
  });

  it('rejects new numbers, medicines, diagnoses and doctor claims', () => {
    expect(verifyRewrite(checked, 'You slept 4.5 hours; most people need 8. Talk to your crew medical officer.').ok).toBe(false);
    expect(verifyRewrite(checked, 'Take melatonin tonight and talk to your crew medical officer.').ok).toBe(false);
    expect(verifyRewrite(checked, 'You have insomnia. Talk to your crew medical officer.').ok).toBe(false);
    expect(verifyRewrite(checked, 'As a doctor, I think you should rest. Talk to your crew medical officer.').ok).toBe(false);
  });

  it('rejects added statements, as the real model produced for the CO2 question', () => {
    const co2 = 'CO2 (mmHg). Carbon dioxide in the habitat air. NASA keeps the 1-hour average at or below 3 mmHg because higher levels cause headaches and tiredness.';
    const realModelOutput = 'CO2 in the habitat air can indeed cause headaches and tiredness. It\'s important to maintain a safe level of CO2 in the habitat to prevent discomfort and potential long-term effects on the astronauts\' well-being.';
    const verdict = verifyRewrite(co2, realModelOutput);
    expect(verdict.ok).toBe(false);
    expect(verifyRewrite(co2, 'Higher carbon dioxide in the habitat air can cause headaches and tiredness, so NASA keeps the 1-hour average at or below 3 mmHg.').ok).toBe(true);
  });

  it('rejects a rewrite that drops the crew medical officer', () => {
    expect(verifyRewrite(checked, 'You slept 4.5 hours, less than your usual 7.5. Try to rest tonight.').ok).toBe(false);
  });

  it('never rewrites safety replies', () => {
    expect(canRewrite({ kind: 'crisis', text: 'Please talk to your crew medical officer or a crewmate right now, in person.', sources: [] })).toBe(false);
    expect(canRewrite({ kind: 'personal', text: checked, sources: [] })).toBe(true);
  });
});
