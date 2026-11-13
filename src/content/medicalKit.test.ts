import { describe, expect, it } from 'vitest';
import { ACTION_CARDS } from '.';
import { MEDICAL_KIT, kitItemStatus, kitSummary } from './medicalKit';

describe('onboard medical kit', () => {
  const base = MEDICAL_KIT.paracetamol;

  it('puts expiry first, then radiation potency, then low stock, then expiring soon', () => {
    expect(kitItemStatus({ ...base, expiresSol: 40 }, 43, [41])).toBe('expired');
    expect(kitItemStatus(base, 43, [41])).toBe('check_potency');
    expect(kitItemStatus(base, 43, [])).toBe('ok');
    expect(kitItemStatus({ ...base, radiationSensitive: false, quantity: 5 }, 43, [41])).toBe('low');
    expect(kitItemStatus({ ...base, radiationSensitive: false, expiresSol: 60 }, 43)).toBe('expires_soon');
  });

  it('only flags potency after a radiation event has actually happened', () => {
    expect(kitItemStatus(base, 40, [41])).toBe('ok');
  });

  it('summarises the Sol 43 demo kit after the Sol 41 solar storm', () => {
    const summary = kitSummary(43, [41]);
    expect(summary.expired).toBeGreaterThan(0); // melatonin
    expect(summary.checkPotency).toBeGreaterThan(0);
    expect(summary.low).toBeGreaterThan(0); // energy bars
  });

  it('every kit item named by an action card exists', () => {
    for (const card of Object.values(ACTION_CARDS)) {
      for (const id of card.kitItemIds ?? []) expect(MEDICAL_KIT[id], `${card.id} → ${id}`).toBeDefined();
    }
  });
});
