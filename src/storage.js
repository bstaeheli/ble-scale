// Settings persistence: one JSON blob under one key, written with one setItem.
import { emptyTares } from './tares.js';

const KEY = 'waage.settings';
const BACKUP = 'waage.settings.broken';
const MAX = 5;

const defaults = () => ({ schemaVersion: 1, tares: emptyTares(), theme: 'auto', display: 'standby' });

function cleanTares(t) {
  const stack = (Array.isArray(t?.stack) ? t.stack : [])
    .filter((e) => e && typeof e.id === 'string' && Number.isInteger(e.grams) && e.grams > 0)
    .slice(0, MAX);
  const activeId = stack.some((e) => e.id === t?.activeId) ? t.activeId : null;
  return { stack, activeId };
}

export function loadSettings(storage) {
  let raw;
  try {
    raw = storage.getItem(KEY);
    if (raw == null) return defaults();
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') throw new Error('not an object');
    return {
      schemaVersion: 1,
      tares: cleanTares(o.tares),
      theme: ['auto', 'day', 'night'].includes(o.theme) ? o.theme : 'auto',
      display: ['awake', 'standby'].includes(o.display) ? o.display : 'standby',
    };
  } catch {
    // Keep the broken value for inspection; backup failure must not break startup.
    try { if (raw != null) storage.setItem(BACKUP, raw); } catch {}
    return defaults();
  }
}

// localStorage, or an in-memory stand-in when access throws (Safari with blocked site data).
export function safeStorage(get = () => localStorage) {
  try { return get(); } catch {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)) };
  }
}

export function saveSettings(storage, settings) {
  storage.setItem(KEY, JSON.stringify(settings));
}
