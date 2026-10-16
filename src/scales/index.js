import { ck829 } from './ck829.js';

export const drivers = [ck829];

export function decodeAdvertisement(adv) {
  for (const d of drivers) {
    const r = d.decode(adv);
    if (r) return { grams: r.grams, scaleId: `${d.id}:${r.scaleId}`, model: d.id };
  }
  return null;
}
