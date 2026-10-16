// Xiaomi person scales (weight only). Protocol: github.com/lolouk44/xiaomi_mi_scale.
// Untested on hardware. decode() returns integer grams.
const LB_G = 453.59237;
const UUID_V1 = '0000181d-0000-1000-8000-00805f9b34fb';
const UUID_V2 = '0000181b-0000-1000-8000-00805f9b34fb';
const person = { unit: 'kg', tare: false };

// raw is the little-endian value (0.01 units); factor converts 0.01 units to grams.
const grams = (raw, perUnit) => Math.round(raw * 0.01 * perUnit);

export const xiaomiV1 = {
  id: 'xiaomi-v1',
  name: 'Xiaomi Mi Smart Scale',
  ...person,
  filters: [{ name: 'MI_SCALE' }, { name: 'MI SCALE2' }],
  decode(adv) {
    const d = adv.serviceData.get(UUID_V1);
    if (!d || d.length < 3) return null;
    const raw = d[1] | (d[2] << 8);
    const perUnit = { 0x22: 500, 0x03: LB_G, 0x12: 500 }[d[0]]; // kg (raw/200 kg), lbs, jin; load-removed codes fall through
    if (perUnit === undefined) return null;
    return { grams: grams(raw, perUnit), scaleId: adv.id ?? this.id };
  },
};

export const xiaomiV2 = {
  id: 'xiaomi-v2',
  name: 'Xiaomi Mi Body Composition Scale 2',
  ...person,
  filters: [{ name: 'MIBFS' }],
  decode(adv) {
    const d = adv.serviceData.get(UUID_V2);
    if (!d || d.length !== 13 || d[1] & 0x80) return null;
    const perUnit = { 0x02: 500, 0x03: LB_G }[d[0]];
    if (perUnit === undefined) return null;
    return { grams: grams(d[11] | (d[12] << 8), perUnit), scaleId: adv.id ?? this.id };
  },
};
