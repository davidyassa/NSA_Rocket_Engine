import { describe, expect, it } from 'vitest';
import { ACTION_CARDS } from '.';
import { MEDICAL_KIT, kitItemStatus, kitSummary } from './medicalKit';

describe('supplies on board', () => {
  const base = MEDICAL_KIT.urine_strips;

  it('puts expiry first, then low stock, then expiring soon', () => {
    expect(kitItemStatus({ ...base, expiresSol: 40, quantity: 1 }, 43)).toBe('expired');
    expect(kitItemStatus({ ...base, quantity: 5, expiresSol: 50 }, 43)).toBe('low');
    expect(kitItemStatus({ ...base, expiresSol: 60 }, 43)).toBe('expires_soon');
    expect(kitItemStatus(base, 43)).toBe('ok');
  });

  it('summarises the Sol 43 demo supplies', () => {
    const summary = kitSummary(43);
    expect(summary.expired).toBe(0);
    expect(summary.low).toBe(2); // food bars, sickness bags
    expect(summary.expiresSoon).toBe(2); // drink pouches, probe covers
  });

  it('lists no medicines: only food, equipment and general supplies', () => {
    for (const item of Object.values(MEDICAL_KIT)) {
      expect(['food', 'equipment', 'supply']).toContain(item.kind);
      expect(`${item.name} ${item.use}`).not.toMatch(/tablet|capsule|dose|medicine|drug|mg\b/i);
    }
  });

  it('every supply named by an action card exists', () => {
    for (const card of Object.values(ACTION_CARDS)) {
      for (const id of card.kitItemIds ?? []) expect(MEDICAL_KIT[id], `${card.id} → ${id}`).toBeDefined();
    }
  });
});
