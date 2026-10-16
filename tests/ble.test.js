import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/ble.js';

const dv = (arr) => new DataView(Uint8Array.from([9, ...arr]).buffer, 1);

test('normalize keeps company 0, converts DataViews, lowercases service UUIDs', () => {
  const a = normalize({
    device: { id: 'dev1', name: 'LFSc' },
    name: 'LFSc',
    manufacturerData: new Map([[0, dv([1, 2, 3])]]),
    serviceData: new Map([['0000181D-0000-1000-8000-00805F9B34FB', dv([4, 5])]]),
  });
  assert.equal(a.id, 'dev1');
  assert.equal(a.name, 'LFSc');
  assert.deepEqual([...a.manufacturerData.keys()], [0]);
  assert.ok(a.manufacturerData.get(0) instanceof Uint8Array);
  assert.deepEqual([...a.manufacturerData.get(0)], [1, 2, 3]);
  assert.deepEqual([...a.serviceData.get('0000181d-0000-1000-8000-00805f9b34fb')], [4, 5]);
});

test('normalize always sets id and serviceData', () => {
  const a = normalize({ manufacturerData: new Map() });
  assert.equal(a.id, null);
  assert.ok(a.serviceData instanceof Map);
  assert.equal(a.serviceData.size, 0);
});
