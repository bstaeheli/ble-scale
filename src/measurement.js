// Measurement state machine. All methods take `now` (ms) explicitly.
const WINDOW_MS = 5000;

export class Measurement {
  constructor(opts = {}) {
    this.o = { staleMs: 6000, hintMs: 20000, steadyFrames: 3, steadyMs: 1500, steadyRangeG: 1, ...opts };
    this.phase = 'disconnected';
    this.connectedAt = 0;
    this._clear();
  }

  _clear() {
    this.raw = null;
    this.lastT = null;
    this.samples = [];
    this.scaleId = null;
    this.staleTotal = null;
    this.unit = null;
    this.tare = null;
  }

  connect(now) {
    this._clear();
    this.phase = 'live';
    this.connectedAt = now;
  }

  disconnect() {
    this.phase = 'disconnected';
    this.samples = [];
  }

  frame({ grams, scaleId, unit = 'g', tare = true }, now) {
    if (this.phase === 'disconnected') return false;
    if (this.scaleId !== null && scaleId !== this.scaleId) return false;
    this.scaleId = scaleId;
    this.unit = unit;
    this.tare = tare;
    if (this.phase === 'stale') {
      this.phase = 'live';
      this.staleTotal = null;
      this.samples = [];
    }
    this.raw = grams;
    this.lastT = now;
    this.samples.push({ t: now, g: grams });
    this.samples = this.samples.filter((s) => now - s.t <= WINDOW_MS);
    return true;
  }

  tick(now) {
    if (this.phase === 'live' && this.lastT !== null && now - this.lastT > this.o.staleMs) {
      this.staleTotal = this.raw;
      this.samples = [];
      this.phase = 'stale';
    }
  }

  isSteady(now) {
    const s = this.samples.filter((x) => now - x.t <= WINDOW_MS);
    if (s.length === 0) return false;
    // Trailing run: walk back from the newest sample while the run stays within steadyRangeG.
    let lo = s[s.length - 1].g, hi = lo, i = s.length - 1;
    while (i > 0) {
      const g = s[i - 1].g;
      if (Math.max(hi, g) - Math.min(lo, g) > this.o.steadyRangeG) break;
      lo = Math.min(lo, g); hi = Math.max(hi, g); i--;
    }
    const run = s.slice(i);
    const last = run[run.length - 1];
    return (
      new Set(run.map((x) => x.t)).size >= this.o.steadyFrames &&
      last.t - run[0].t >= this.o.steadyMs &&
      now - last.t <= this.o.staleMs
    );
  }

  view(now) {
    const since = this.lastT ?? this.connectedAt;
    return {
      phase: this.phase,
      raw: this.raw,
      total: this.phase === 'live' ? this.raw : null,
      staleTotal: this.staleTotal,
      ageMs: this.lastT === null ? null : now - this.lastT,
      steady: this.isSteady(now),
      hint: this.phase !== 'disconnected' && now - since > this.o.hintMs,
      scaleId: this.scaleId,
      unit: this.unit,
      tare: this.tare,
    };
  }
}
