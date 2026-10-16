import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ck829 } from '../src/scales/ck829.js';
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

const adv = (bytes) => ({ name: 'LFSc', manufacturerData: new Map([[0, bytes]]) });
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
  assert.equal(ck829.decode({ name: 'LFSc', manufacturerData: new Map([[1, frame(121)]]) }), null);
});

test('decodeAdvertisement tags model and prefixes scaleId', () => {
  assert.deepEqual(drivers, [ck829]);
  assert.deepEqual(decodeAdvertisement(adv(hex(REAL))), {
    grams: -207,
    scaleId: 'ck829:cf:e9:09:19:41:d8',
    model: 'ck829',
  });
});

test('unknown advertisement gives null', () => {
  assert.equal(decodeAdvertisement({ name: null, manufacturerData: new Map() }), null);
  assert.equal(decodeAdvertisement(adv(new Uint8Array(5))), null);
});
