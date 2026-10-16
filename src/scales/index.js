import { ck829 } from './ck829.js';
import { xiaomiV1, xiaomiV2 } from './xiaomi.js';

export const drivers = [ck829, xiaomiV1, xiaomiV2];

export function decodeAdvertisement(adv) {
  for (const d of drivers) {
    const r = d.decode(adv);
    if (r) return { grams: r.grams, scaleId: `${d.id}:${r.scaleId}`, model: d.id, unit: d.unit, zeroReference: d.zeroReference, tare: d.tare };
  }
  return null;
}
