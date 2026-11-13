/**
 * Onboard medical kit (synthetic demo inventory).
 *
 * Far from Earth there is no resupply and no evacuation, so advice is only
 * useful if the kit can support it. Each action card can name the kit items it
 * relies on, and Sol Check shows their stock and expiry next to the advice.
 * Sol Check never suggests doses or substitutes medicines: those decisions stay
 * with the Crew Medical Officer and the flight surgeon.
 *
 * Medicines degrade faster in space, partly from radiation (Du et al., AAPS J
 * 2011). Items marked radiationSensitive are flagged for a potency check after
 * a solar particle event. Which items are marked is a demo choice, not lab data.
 */

export interface KitItem {
  id: string;
  name: string;
  /** what it is for, in everyday words */
  use: string;
  kind: 'medicine' | 'supplement' | 'food' | 'equipment';
  quantity: number;
  unit: string;
  /** below this count the item is flagged as running low */
  minQuantity: number;
  /** last mission sol the item is good for; null = does not expire */
  expiresSol: number | null;
  radiationSensitive: boolean;
  /** only the Crew Medical Officer may hand it out */
  cmoOnly: boolean;
}

export const MEDICAL_KIT: Record<string, KitItem> = {
  ors: { id: 'ors', name: 'Oral rehydration salts', use: 'Replace water and salts after vomiting, diarrhoea or heavy sweating', kind: 'medicine', quantity: 24, unit: 'sachets', minQuantity: 10, expiresSol: 900, radiationSensitive: false, cmoOnly: false },
  paracetamol: { id: 'paracetamol', name: 'Paracetamol (acetaminophen)', use: 'Headache, pain and fever', kind: 'medicine', quantity: 60, unit: 'tablets', minQuantity: 20, expiresSol: 700, radiationSensitive: true, cmoOnly: false },
  meclizine: { id: 'meclizine', name: 'Motion-sickness tablets (meclizine)', use: 'Space motion sickness', kind: 'medicine', quantity: 6, unit: 'tablets', minQuantity: 10, expiresSol: 520, radiationSensitive: true, cmoOnly: true },
  melatonin: { id: 'melatonin', name: 'Melatonin', use: 'Shifting sleep timing', kind: 'supplement', quantity: 30, unit: 'tablets', minQuantity: 10, expiresSol: 40, radiationSensitive: false, cmoOnly: false },
  potassium_citrate: { id: 'potassium_citrate', name: 'Potassium citrate', use: 'Lowers kidney-stone risk (prescribed by the Crew Medical Officer)', kind: 'medicine', quantity: 40, unit: 'tablets', minQuantity: 20, expiresSol: 300, radiationSensitive: true, cmoOnly: true },
  vitamin_d: { id: 'vitamin_d', name: 'Vitamin D supplement', use: 'Bone health without sunlight', kind: 'supplement', quantity: 90, unit: 'tablets', minQuantity: 30, expiresSol: 60, radiationSensitive: false, cmoOnly: false },
  energy_bars: { id: 'energy_bars', name: 'High-energy food bars', use: 'Extra calories when meals are skipped or appetite is low', kind: 'food', quantity: 14, unit: 'bars', minQuantity: 20, expiresSol: 400, radiationSensitive: false, cmoOnly: false },
  urine_strips: { id: 'urine_strips', name: 'Urine test strips', use: 'Check for blood in urine (kidney stones)', kind: 'equipment', quantity: 25, unit: 'strips', minQuantity: 10, expiresSol: 200, radiationSensitive: false, cmoOnly: false },
  eye_chart: { id: 'eye_chart', name: 'Near-vision chart and eye-exam light', use: 'Simple eye check for vision changes', kind: 'equipment', quantity: 1, unit: 'kit', minQuantity: 1, expiresSol: null, radiationSensitive: false, cmoOnly: false },
};

export type KitStatus = 'expired' | 'check_potency' | 'low' | 'expires_soon' | 'ok';

/** Sols before expiry that count as "expires soon". */
export const EXPIRY_WARNING_SOLS = 30;

export const KIT_STATUS_TEXT: Record<KitStatus, string> = {
  expired: 'Expired: ask your crew medical officer before using',
  check_potency: 'Check potency: a solar storm may have weakened it',
  low: 'Running low: no resupply, so use sparingly',
  expires_soon: 'Expires soon',
  ok: 'Available',
};

/** Most important problem first. Radiation flags apply once a radiation event has happened. */
export function kitItemStatus(item: KitItem, currentSol: number, radiationEventSols: readonly number[] = []): KitStatus {
  if (item.expiresSol !== null && currentSol > item.expiresSol) return 'expired';
  if (item.radiationSensitive && radiationEventSols.some((sol) => sol <= currentSol)) return 'check_potency';
  if (item.quantity < item.minQuantity) return 'low';
  if (item.expiresSol !== null && item.expiresSol - currentSol <= EXPIRY_WARNING_SOLS) return 'expires_soon';
  return 'ok';
}

export function kitSummary(currentSol: number, radiationEventSols: readonly number[] = []) {
  const items = Object.values(MEDICAL_KIT).map((item) => ({ item, status: kitItemStatus(item, currentSol, radiationEventSols) }));
  const count = (status: KitStatus) => items.filter((entry) => entry.status === status).length;
  return { items, expired: count('expired'), checkPotency: count('check_potency'), low: count('low'), expiresSoon: count('expires_soon') };
}
