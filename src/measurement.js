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
    this.zero = null;
    this.scaleId = null;
    this.staleTotal = null;
    this.unit = null;
    this.tare = null;
  }

  connect(now) {
    this._clear();
    this.phase = 'needEmpty';
    this.connectedAt = now;
  }

  disconnect() {
    this.phase = 'disconnected';
    this.zero = null;
    this.samples = [];
  }

  frame({ grams, scaleId, unit = 'g', zeroReference = true, tare = true }, now) {
    if (this.phase === 'disconnected') return false;
    if (this.scaleId !== null && scaleId !== this.scaleId) return false;
    this.scaleId = scaleId;
    this.unit = unit;
    this.tare = tare;
    if (this.phase === 'stale') {
      this.phase = 'needEmpty';
      this.staleTotal = null;
      this.samples = [];
    }
    if (!zeroReference) {
      this.zero = 0;
      this.phase = 'live';
    }
    this.raw = grams;
    this.lastT = now;
    this.samples.push({ t: now, g: grams });
    this.samples = this.samples.filter((s) => now - s.t <= WINDOW_MS);
    return true;
  }

  tick(now) {
    if ((this.phase === 'needEmpty' || this.phase === 'live') && this.lastT !== null && now - this.lastT > this.o.staleMs) {
      this.staleTotal = this.zero !== null ? this.raw - this.zero : null;
      this.zero = null;
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

  confirmEmpty(now) {
    if (this.phase !== 'needEmpty' || !this.isSteady(now)) return false;
    this.zero = this.raw;
    this.phase = 'live';
    return true;
  }

  resetZero() {
    if (this.phase !== 'live') return;
    this.zero = null;
    this.phase = 'needEmpty';
  }

  view(now) {
    const since = this.lastT ?? this.connectedAt;
    return {
      phase: this.phase,
      raw: this.raw,
      zero: this.zero,
      total: this.phase === 'live' ? this.raw - this.zero : null,
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
