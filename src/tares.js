// MRU tare stack: pure functions, state is never mutated.
const MAX = 5;
const TOLERANCE = 2;

export const randomId = () => crypto.randomUUID();
const iso = (ms) => new Date(ms).toISOString();

export const emptyTares = () => ({ stack: [], activeId: null });

export function saveTare(state, grams, now, makeId = randomId) {
  if (!Number.isInteger(grams) || grams <= 0) throw new RangeError('grams must be a positive integer');
  // Closest entry within tolerance; strict < keeps the higher entry on ties.
  let hit = -1;
  state.stack.forEach((e, i) => {
    const d = Math.abs(e.grams - grams);
    if (d <= TOLERANCE && (hit < 0 || d < Math.abs(state.stack[hit].grams - grams))) hit = i;
  });
  const entry = hit >= 0
    ? { ...state.stack[hit], grams, lastUsedAt: iso(now) }
    : { id: makeId(), grams, createdAt: iso(now), lastUsedAt: iso(now) };
  const rest = state.stack.filter((_, i) => i !== hit);
  return { stack: [entry, ...rest].slice(0, MAX), activeId: entry.id };
}

export function selectTare(state, id, now) {
  const e = state.stack.find((x) => x.id === id);
  if (!e) return state;
  const stack = [{ ...e, lastUsedAt: iso(now) }, ...state.stack.filter((x) => x.id !== id)];
  return { stack, activeId: id };
}

export const selectNone = (state) => ({ ...state, activeId: null });

export const deleteTare = (state, id) => ({
  stack: state.stack.filter((e) => e.id !== id),
  activeId: state.activeId === id ? null : state.activeId,
});

export const activeGrams = (state) => state.stack.find((e) => e.id === state.activeId)?.grams ?? 0;
