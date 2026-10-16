import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, saveSettings } from '../src/storage.js';

const fake = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), m };
};
const entry = (id, grams) => ({ id, grams, createdAt: 'c', lastUsedAt: 'l' });
const defaults = { schemaVersion: 1, tares: { stack: [], activeId: null }, theme: 'auto', display: 'standby' };

test('round trip with a single setItem call', () => {
  const s = fake();
  let calls = 0;
  const orig = s.setItem;
  s.setItem = (...a) => { calls++; orig(...a); };
  const settings = { schemaVersion: 1, tares: { stack: [entry('a', 100)], activeId: 'a' }, theme: 'night', display: 'awake' };
  saveSettings(s, settings);
  assert.equal(calls, 1);
  assert.deepEqual(loadSettings(s), settings);
});

test('missing key gives defaults', () => {
  assert.deepEqual(loadSettings(fake()), defaults);
});

test('invalid JSON gives defaults and is backed up', () => {
  const s = fake({ 'waage.settings': '{oops' });
  assert.deepEqual(loadSettings(s), defaults);
  assert.equal(s.m.get('waage.settings.broken'), '{oops');
});

test('invalid entries are filtered', () => {
  const stack = [entry('a', 0), entry('b', -5), entry('c', 1.5), entry('d', 50), entry('e', 60),
    entry('f', 70), entry('g', 80), entry('h', 90), entry('i', 99)];
  const s = fake({ 'waage.settings': JSON.stringify({ schemaVersion: 1, tares: { stack, activeId: 'zzz' }, theme: 'pink', display: 'x' }) });
  const r = loadSettings(s);
  assert.deepEqual(r.tares.stack.map((e) => e.id), ['d', 'e', 'f', 'g', 'h']);
  assert.equal(r.tares.activeId, null);
  assert.equal(r.theme, 'auto');
  assert.equal(r.display, 'standby');
});

test('valid activeId is kept', () => {
  const s = fake({ 'waage.settings': JSON.stringify({ tares: { stack: [entry('a', 5)], activeId: 'a' } }) });
  assert.equal(loadSettings(s).tares.activeId, 'a');
});

test('getItem throwing gives defaults', () => {
  const s = { getItem() { throw new Error('denied'); }, setItem() {} };
  assert.deepEqual(loadSettings(s), defaults);
});
