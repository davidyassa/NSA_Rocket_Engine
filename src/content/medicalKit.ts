/**
 * Supplies on board (synthetic demo inventory).
 *
 * Far from Earth there is no resupply, so Sol Check shows how much is left of
 * the non-drug supplies its suggestions mention: food, drink pouches and simple
 * health-check equipment. It deliberately lists NO medicines and never
 * recommends, doses or prescribes treatment: those decisions stay with the
 * Crew Medical Officer and the flight surgeon.
 */

export interface KitItem {
  id: string;
  name: string;
  /** what it is for, in everyday words */
  use: string;
  kind: 'food' | 'equipment' | 'supply';
  quantity: number;
  unit: string;
  /** below this count the item is flagged as running low */
  minQuantity: number;
  /** last mission sol the item is good for; null = does not expire */
  expiresSol: number | null;
}

export const MEDICAL_KIT: Record<string, KitItem> = {
  energy_bars: { id: 'energy_bars', name: 'High-energy food bars', use: 'Extra calories when meals are skipped or appetite is low', kind: 'food', quantity: 14, unit: 'bars', minQuantity: 20, expiresSol: 400 },
  drink_pouches: { id: 'drink_pouches', name: 'Electrolyte drink pouches', use: 'Flavoured drinks that make it easier to drink enough', kind: 'food', quantity: 30, unit: 'pouches', minQuantity: 12, expiresSol: 60 },
  urine_strips: { id: 'urine_strips', name: 'Urine test strips', use: 'Check for blood in urine (kidney-stone warning sign)', kind: 'equipment', quantity: 25, unit: 'strips', minQuantity: 10, expiresSol: 200 },
  eye_chart: { id: 'eye_chart', name: 'Near-vision chart and eye-exam light', use: 'Simple eye check for vision changes', kind: 'equipment', quantity: 1, unit: 'kit', minQuantity: 1, expiresSol: null },
  sickness_bags: { id: 'sickness_bags', name: 'Sealable sickness bags', use: 'Vomiting during space motion sickness', kind: 'supply', quantity: 8, unit: 'bags', minQuantity: 10, expiresSol: null },
  thermometer_covers: { id: 'thermometer_covers', name: 'Thermometer probe covers', use: 'Hygienic temperature checks', kind: 'supply', quantity: 40, unit: 'covers', minQuantity: 15, expiresSol: 65 },
};

export type KitStatus = 'expired' | 'low' | 'expires_soon' | 'ok';

/** Sols before expiry that count as "expires soon". */
export const EXPIRY_WARNING_SOLS = 30;

export const KIT_STATUS_TEXT: Record<KitStatus, string> = {
  expired: 'Expired: do not use; tell your crew medical officer',
  low: 'Running low: no resupply, so use sparingly',
  expires_soon: 'Expires soon',
  ok: 'Available',
};

/** Most important problem first. */
export function kitItemStatus(item: KitItem, currentSol: number): KitStatus {
  if (item.expiresSol !== null && currentSol > item.expiresSol) return 'expired';
  if (item.quantity < item.minQuantity) return 'low';
  if (item.expiresSol !== null && item.expiresSol - currentSol <= EXPIRY_WARNING_SOLS) return 'expires_soon';
  return 'ok';
}

export function kitSummary(currentSol: number) {
  const items = Object.values(MEDICAL_KIT).map((item) => ({ item, status: kitItemStatus(item, currentSol) }));
  const count = (status: KitStatus) => items.filter((entry) => entry.status === status).length;
  return { items, expired: count('expired'), low: count('low'), expiresSoon: count('expires_soon') };
}
