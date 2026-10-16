import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Measurement } from '../src/measurement.js';

const f = (grams, scaleId = 'A') => ({ grams, scaleId });

test('connect goes straight to live, total is the scale reading', () => {
  const m = new Measurement();
  m.connect(0);
  assert.equal(m.view(0).phase, 'live');
  assert.equal(m.view(0).total, null);
  m.frame(f(843), 100);
  assert.equal(m.view(100).total, 843);
  m.frame(f(-20), 200);
  assert.equal(m.view(200).total, -20);
});

test('burst of frames at one instant is not steady', () => {
  const m = new Measurement();
  m.connect(0);
  for (let i = 0; i < 30; i++) m.frame(f(0), 0);
  assert.equal(m.isSteady(0), false);
});

test('jittery frames are not steady', () => {
  const m = new Measurement();
  m.connect(0);
  m.frame(f(0), 0);
  m.frame(f(0), 750);
  m.frame(f(2), 1500);
  assert.equal(m.isSteady(1500), false);
});

test('other scaleId is ignored', () => {
  const m = new Measurement();
  m.connect(0);
  assert.equal(m.frame(f(10, 'A'), 0), true);
  assert.equal(m.frame(f(99, 'B'), 100), false);
  assert.equal(m.view(100).raw, 10);
  assert.equal(m.view(100).scaleId, 'A');
});

test('stale keeps last total, next frame is live again', () => {
  const m = new Measurement();
  m.connect(0);
  const t = 1500;
  m.frame(f(300), t + 100);
  m.tick(t + 100 + 6000);
  assert.equal(m.view(t + 6100).phase, 'live');
  m.tick(t + 100 + 6001);
  const v = m.view(t + 6101);
  assert.equal(v.phase, 'stale');
  assert.equal(v.staleTotal, 300);
  assert.equal(v.total, null);
  m.frame(f(310), t + 7000);
  assert.equal(m.view(t + 7000).phase, 'live');
  assert.equal(m.view(t + 7000).total, 310);
  assert.equal(m.view(t + 7000).staleTotal, null);
});

test('disconnect ignores frames', () => {
  const m = new Measurement();
  m.connect(0);
  m.frame(f(1), 0);
  m.disconnect();
  assert.equal(m.frame(f(2), 100), false);
  assert.equal(m.view(100).phase, 'disconnected');
});

test('hint after 20 s without frames', () => {
  const m = new Measurement();
  m.connect(1000);
  assert.equal(m.view(1000 + 19999).hint, false);
  assert.equal(m.view(1000 + 20001).hint, true);
});

test('burst counts as one delivery for steadiness', () => {
  const m = new Measurement();
  m.connect(0);
  m.frame(f(0), 0);
  for (let i = 0; i < 30; i++) m.frame(f(0), 1500);
  assert.equal(m.isSteady(1500), false);
  m.frame(f(0), 1600);
  assert.equal(m.isSteady(1600), true);
});

test('person scale exposes unit and tare flag', () => {
  const m = new Measurement();
  m.connect(0);
  assert.equal(m.view(0).unit, null);
  m.frame({ grams: 72350, scaleId: 'S', unit: 'kg', tare: false }, 100);
  const v = m.view(100);
  assert.equal(v.phase, 'live');
  assert.equal(v.total, 72350);
  assert.equal(v.unit, 'kg');
  assert.equal(v.tare, false);
});

test('person scale: frame after stale returns straight to live', () => {
  const m = new Measurement();
  m.connect(0);
  const r = (g) => ({ grams: g, scaleId: 'S', unit: 'kg', tare: false });
  m.frame(r(70000), 0);
  m.tick(7000);
  assert.equal(m.view(7000).phase, 'stale');
  m.frame(r(71000), 8000);
  assert.equal(m.view(8000).phase, 'live');
  assert.equal(m.view(8000).total, 71000);
});

test('kitchen scale readings expose unit/tare', () => {
  const m = new Measurement();
  m.connect(0);
  m.frame({ grams: 0, scaleId: 'A', unit: 'g', tare: true }, 0);
  assert.equal(m.view(0).unit, 'g');
  assert.equal(m.view(0).tare, true);
});

test('steady at change + 1.5 s, not before', () => {
  const m = new Measurement();
  m.connect(0);
  for (let t = 0; t <= 3000; t += 100) m.frame(f(0), t);
  for (let t = 3100; t <= 4500; t += 100) m.frame(f(843), t);
  assert.equal(m.isSteady(4500), false);
  m.frame(f(843), 4600);
  assert.equal(m.isSteady(4600), true);
});
