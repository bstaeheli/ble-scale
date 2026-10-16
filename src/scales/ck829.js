const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(':');

export const ck829 = {
  id: 'ck829',
  name: 'CK829 (LFSc)',
  unit: 'g',
  tare: true,
  filters: [{ namePrefix: 'LFSc', manufacturerData: [{ companyIdentifier: 0x0000 }] }],
  decode(adv) {
    const f = adv.manufacturerData.get(0x0000);
    if (!f || f.length !== 18) return null;
    if (f[6] !== 0xca || f[7] !== 0x01 || f[8] !== 0x04) return null;
    if (f[14] !== 0x04 || f[17] !== 0xff || (f[15] !== 0 && f[15] !== 1)) return null;
    let x = 0;
    for (let i = 6; i < 16; i++) x ^= f[i];
    if (x !== f[16]) return null;
    const neg = f[11] === 0xff && f[12] === 0xff && f[13] === 0xff;
    if (!neg && (f[11] || f[12] || f[13])) return null;
    const mag = f[9] | (f[10] << 8);
    return { grams: neg ? -mag : mag, scaleId: hex(f.subarray(0, 6)) };
  },
};
