import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTares, saveTare, selectTare, deleteTare, activeGrams } from '../src/tares.js';

let n = 0;
const mk = () => `id${++n}`;
const T0 = 1000;
const iso = (ms) => new Date(ms).toISOString();

function build(list) {
  let s = emptyTares();
  for (const g of [...list].reverse()) s = saveTare(s, g, T0, mk);
  return s;
}
const grams = (s) => s.stack.map((e) => e.grams);
const active = (s) => s.stack.find((e) => e.id === s.activeId);

test('empty state', () => {
  assert.deepEqual(emptyTares(), { stack: [], activeId: null });
  assert.equal(activeGrams(emptyTares()), 0);
});

test('save puts new tare on top and active', () => {
  const s = saveTare(build([320, 185, 740, 96, 510]), 430, 2000, mk);
  assert.deepEqual(grams(s), [430, 320, 185, 740, 96]);
  assert.equal(active(s).grams, 430);
  assert.equal(activeGrams(s), 430);
});

test('select moves to top, updates lastUsedAt only for it', () => {
  const s0 = build([430, 320, 185, 740, 96]);
  const s = selectTare(s0, s0.stack[2].id, 5000);
  assert.deepEqual(grams(s), [185, 430, 320, 740, 96]);
  assert.equal(s.activeId, s.stack[0].id);
  assert.equal(s.stack[0].lastUsedAt, iso(5000));
  assert.equal(s.stack[1].lastUsedAt, iso(T0));
});

test('save within tolerance replaces grams, keeps createdAt', () => {
  const s0 = build([430, 320, 185]);
  const created = s0.stack[1].createdAt;
  const s = saveTare(s0, 321, 9000, mk);
  assert.deepEqual(grams(s), [321, 430, 185]);
  assert.equal(s.stack[0].createdAt, created);
  assert.equal(s.stack[0].lastUsedAt, iso(9000));
  assert.equal(s.activeId, s.stack[0].id);
});

test('save outside tolerance adds new entry', () => {
  assert.deepEqual(grams(saveTare(build([320]), 323, 2000, mk)), [323, 320]);
});

test('tolerance tie goes to the higher entry in the list', () => {
  const s = saveTare(build([310, 314]), 312, 2000, mk);
  assert.deepEqual(grams(s), [312, 314]);
});

test('closest entry wins over earlier one', () => {
  const s = saveTare(build([310, 314]), 313, 2000, mk);
  assert.deepEqual(grams(s), [313, 310]);
});

test('selecting the active tare deactivates it, keeps order', () => {
  const s0 = build([300, 200, 100]);
  const s = selectTare(s0, s0.activeId, 5000);
  assert.deepEqual(s, { ...s0, activeId: null });
  assert.deepEqual(grams(s), [300, 200, 100]);
  assert.equal(activeGrams(s), 0);
});

test('delete active clears selection, delete other keeps it', () => {
  const s0 = build([30, 20, 10]);
  const a = s0.activeId;
  assert.equal(deleteTare(s0, a).activeId, null);
  const other = s0.stack[1].id;
  const s = deleteTare(s0, other);
  assert.equal(s.activeId, a);
  assert.deepEqual(grams(s), [30, 10]);
});

test('inputs are not mutated', () => {
  const s0 = build([30, 20, 10]);
  const copy = structuredClone(s0);
  saveTare(s0, 21, 2, mk); saveTare(s0, 99, 2, mk);
  selectTare(s0, s0.stack[2].id, 2); deleteTare(s0, s0.stack[0].id);
  assert.deepEqual(s0, copy);
});

test('invalid grams throw RangeError', () => {
  for (const g of [0, -5, 1.5, NaN, '5']) assert.throws(() => saveTare(emptyTares(), g, 0, mk), RangeError);
});

test('only the last 5 are kept', () => {
  let s = emptyTares();
  for (const g of [100, 200, 300, 400, 500, 600, 700]) s = saveTare(s, g, 0, mk);
  assert.deepEqual(grams(s), [700, 600, 500, 400, 300]);
});

test('default id generator yields unique ids', () => {
  let s = saveTare(emptyTares(), 100, 0);
  s = saveTare(s, 200, 0);
  assert.notEqual(s.stack[0].id, s.stack[1].id);
});
