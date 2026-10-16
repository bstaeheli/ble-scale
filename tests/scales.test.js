import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ck829 } from '../src/scales/ck829.js';
import { xiaomiV1, xiaomiV2 } from '../src/scales/xiaomi.js';
import { drivers, decodeAdvertisement } from '../src/scales/index.js';

const ID = [0xcf, 0xe9, 0x09, 0x19, 0x41, 0xd8];
const xor = (f) => f.slice(6, 16).reduce((a, b) => a ^ b, 0);

function frame(grams, { id = ID, b15 = 0 } = {}) {
  const f = new Uint8Array(18);
  f.set(id, 0);
  f.set([0xca, 0x01, 0x04], 6);
  const mag = Math.abs(grams);
  f[9] = mag & 0xff;
  f[10] = mag >> 8;
  f.fill(grams < 0 ? 0xff : 0x00, 11, 14);
  f[14] = 0x04;
  f[15] = b15;
  f[16] = xor(f);
  f[17] = 0xff;
  return f;
}

const adv = (bytes) => ({ id: null, name: 'LFSc', manufacturerData: new Map([[0, bytes]]), serviceData: new Map() });
const hex = (s) => Uint8Array.from(s.split(' ').map((h) => parseInt(h, 16)));
const REAL = 'cf e9 09 19 41 d8 ca 01 04 cf 00 ff ff ff 04 00 fb ff';

test('ck829 metadata', () => {
  assert.equal(ck829.id, 'ck829');
  assert.equal(ck829.name, 'CK829 (LFSc)');
});

test('decodes grams', () => {
  for (const g of [0, 121, 468, 1208, -121]) {
    assert.deepEqual(ck829.decode(adv(frame(g))), { grams: g, scaleId: 'cf:e9:09:19:41:d8' });
  }
});

test('decodes the real frame', () => {
  assert.deepEqual(ck829.decode(adv(hex(REAL))), { grams: -207, scaleId: 'cf:e9:09:19:41:d8' });
});

test('byte 15 = 01 with matching XOR decodes', () => {
  assert.equal(ck829.decode(adv(frame(121, { b15: 1 }))).grams, 121);
});

test('rejects invalid frames', () => {
  const bad = (fn) => {
    const f = frame(121);
    fn(f);
    return ck829.decode(adv(f));
  };
  const refix = (f) => { f[16] = xor(f); };
  assert.equal(ck829.decode(adv(frame(121).slice(0, 17))), null);
  assert.equal(bad((f) => { f[16] ^= 1; }), null);
  assert.equal(bad((f) => { f[7] = 0x02; refix(f); }), null);
  assert.equal(bad((f) => { f[14] = 0x03; refix(f); }), null);
  assert.equal(bad((f) => { f.set([0x00, 0xff, 0x00], 11); refix(f); }), null);
  assert.equal(bad((f) => { f[17] = 0x00; }), null);
  assert.equal(bad((f) => { f[15] = 0x02; refix(f); }), null);
});

test('missing company 0x0000 gives null', () => {
  assert.equal(ck829.decode({ id: null, name: 'LFSc', manufacturerData: new Map([[1, frame(121)]]), serviceData: new Map() }), null);
});

test('decodeAdvertisement tags model and prefixes scaleId', () => {
  assert.deepEqual(drivers, [ck829, xiaomiV1, xiaomiV2]);
  assert.deepEqual(decodeAdvertisement(adv(hex(REAL))), {
    grams: -207,
    scaleId: 'ck829:cf:e9:09:19:41:d8',
    model: 'ck829',
    unit: 'g',
    tare: true,
  });
});

test('unknown advertisement gives null', () => {
  assert.equal(decodeAdvertisement({ id: null, name: null, manufacturerData: new Map(), serviceData: new Map() }), null);
  assert.equal(decodeAdvertisement(adv(new Uint8Array(5))), null);
});

const U1 = '0000181d-0000-1000-8000-00805f9b34fb';
const U2 = '0000181b-0000-1000-8000-00805f9b34fb';
const sadv = (uuid, bytes, id = null) => ({ id, name: null, manufacturerData: new Map(), serviceData: new Map([[uuid, Uint8Array.from(bytes)]]) });
const v1 = (ctrl, raw, id) => sadv(U1, [ctrl, raw & 0xff, raw >> 8], id);
const v2 = (b0, b1, raw, len = 13) => {
  const b = new Array(len).fill(0);
  b[0] = b0;
  b[1] = b1;
  if (len >= 13) { b[11] = raw & 0xff; b[12] = raw >> 8; }
  return sadv(U2, b);
};

test('driver capabilities', () => {
  assert.deepEqual([xiaomiV1.id, xiaomiV1.unit, xiaomiV1.tare], ['xiaomi-v1', 'kg', false]);
  assert.deepEqual([xiaomiV2.id, xiaomiV2.unit, xiaomiV2.tare], ['xiaomi-v2', 'kg', false]);
});

test('xiaomi v1 units', () => {
  assert.deepEqual(xiaomiV1.decode(v1(0x22, 14470, 'dev')), { grams: 72350, scaleId: 'dev' });
  assert.equal(xiaomiV1.decode(v1(0x22, 14470)).scaleId, 'xiaomi-v1');
  assert.equal(xiaomiV1.decode(v1(0x03, 15950)).grams, Math.round(159.5 * 453.59237));
  assert.equal(xiaomiV1.decode(v1(0x12, 14470)).grams, 72350);
});

test('xiaomi v1 rejects', () => {
  assert.equal(xiaomiV1.decode(v1(0xa2, 14470)), null);
  assert.equal(xiaomiV1.decode(v1(0x55, 14470)), null);
  assert.equal(xiaomiV1.decode(sadv(U1, [0x22, 1])), null);
  assert.equal(xiaomiV1.decode(adv(new Uint8Array(18))), null);
});

test('xiaomi v2', () => {
  assert.equal(xiaomiV2.decode(v2(0x02, 0x24, 14470)).grams, 72350);
  assert.equal(xiaomiV2.decode(v2(0x03, 0x24, 15950)).grams, Math.round(159.5 * 453.59237));
  assert.equal(xiaomiV2.decode(v2(0x02, 0xa4, 14470)), null);
  assert.equal(xiaomiV2.decode(v2(0x02, 0x24, 14470, 12)), null);
  assert.equal(xiaomiV2.decode(v2(0x07, 0x24, 14470)), null);
});

test('decodeAdvertisement for person scales', () => {
  assert.deepEqual(decodeAdvertisement(v1(0x22, 14470, 'dev')), {
    grams: 72350, scaleId: 'xiaomi-v1:dev', model: 'xiaomi-v1', unit: 'kg', tare: false,
  });
  assert.equal(decodeAdvertisement(v2(0x02, 0x24, 14470)).model, 'xiaomi-v2');
});
