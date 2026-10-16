// App wiring: BLE scan -> decoder -> measurement -> DOM. Only module with DOM access.
import * as ble from './ble.js';
import { decodeAdvertisement } from './scales/index.js';
import { Measurement } from './measurement.js';
import { saveTare, selectTare, selectNone, deleteTare, activeGrams } from './tares.js';
import { loadSettings, saveSettings, safeStorage } from './storage.js';

const $ = (id) => document.getElementById(id);
const el = {
  state: $('state'), more: $('more'), big: $('big'), tares: $('tares'), row: $('tare-row'), zero: $('zero'), save: $('save'),
  toast: $('toast'), toastText: $('toast-text'), undo: $('undo'), sheet: $('sheet'), wake: $('wake-status'),
  connect: $('connect'), disconnect: $('disconnect'), rezero: $('rezero'), diag: $('diag'), version: $('version'),
};

const demo = new URLSearchParams(location.search).get('demo') === '1';
const scanner = demo ? demoScanner() : ble;
const KNOWN_NAMES = ['LFSc', 'MI_SCALE', 'MI SCALE2', 'MIBFS'];
const NO_SCAN = 'Bluetooth-Scan nicht verfügbar. Seite in Safari mit beacio öffnen.';

const m = new Measurement();
const store = safeStorage();
let settings = loadSettings(store);
const diag = { frames: [], events: 0, dropped: 0, hex: '–', rejected: '–', model: null };
let scanError = null;

// ---------- formatting ----------
const fmtInt = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 });
const noNegZero = (n) => n + 0; // -0 + 0 === +0
const fmtG = (g) => fmtInt.format(noNegZero(Math.round(g)));
const fmtKg = (g) => noNegZero(Math.round(g / 10) / 100).toFixed(2).replace('.', ',');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const two = (n) => String(n).padStart(2, '0');
function fmtDate(iso) {
  const d = new Date(iso);
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  return d.toDateString() === new Date().toDateString() ? `heute ${time}` : `${two(d.getDate())}.${two(d.getMonth() + 1)}. ${time}`;
}
const toHex = (b) => (b ? Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ') : '–');

// ---------- persistence ----------
function persist() {
  const { tares, theme, display } = settings;
  try { saveSettings(store, { schemaVersion: 1, tares, theme, display }); } catch {}
}

// ---------- scanning ----------
function onAdvertisement(adv) {
  if (document.visibilityState !== 'visible') return;
  diag.events++;
  const now = performance.now();
  const dec = decodeAdvertisement(adv);
  const payload = adv.manufacturerData.get(0) ?? adv.serviceData.values().next().value ?? adv.manufacturerData.values().next().value;
  if (!dec) {
    if (adv.manufacturerData.has(0) || KNOWN_NAMES.includes(adv.name)) { diag.dropped++; diag.rejected = toHex(payload); }
    return;
  }
  if (m.frame(dec, now)) {
    diag.model = dec.model;
    diag.hex = toHex(payload);
    diag.frames.push(now);
    while (diag.frames[0] < now - 5000) diag.frames.shift();
  }
  scheduleRender();
}

// Synchronous up to requestLEScan: must be called directly from a tap handler.
function connect() {
  if (!scanner.scanAvailable()) { scanError = NO_SCAN; render(); return; }
  scanError = null;
  m.connect(performance.now());
  const fail = (err) => {
    m.disconnect();
    scanError = `Scan fehlgeschlagen: ${err?.message ?? err}`;
    render();
  };
  try { scanner.startScan(onAdvertisement).catch(fail); } catch (err) { fail(err); }
  render();
}

function disconnect() {
  scanner.stopScan();
  m.disconnect();
  render();
}

// ---------- tares ----------
let toastTimer = 0;
function changeTares(next, message) {
  const prev = settings.tares;
  settings.tares = next;
  persist();
  if (message) {
    el.toastText.textContent = message;
    el.toast.hidden = false;
    el.undo.onclick = () => { settings.tares = prev; persist(); hideToast(); render(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }
  render();
}
function hideToast() { el.toast.hidden = true; el.undo.onclick = null; }

function canSave(v) { return v.phase === 'live' && v.tare === true && v.steady && v.total > 0; }

function saveCurrent() {
  const v = m.view(performance.now());
  if (!canSave(v)) return;
  changeTares(saveTare(settings.tares, v.total, Date.now()), `${fmtG(v.total)} g als Tara gespeichert`);
}

let taresKey = null;
function renderTares() {
  const key = JSON.stringify(settings.tares);
  if (key === taresKey) return; // re-creating buttons during beacio bursts swallows iOS taps
  taresKey = key;
  const { stack, activeId } = settings.tares;
  const items = [];
  for (let i = 0; i < 5; i++) {
    const e = stack[i];
    if (!e) { const li = document.createElement('li'); li.className = 'empty'; items.push(li); continue; }
    const li = el.row.content.firstElementChild.cloneNode(true);
    li.classList.toggle('on', e.id === activeId);
    li.querySelector('b').textContent = `${fmtG(e.grams)} g`;
    li.querySelector('.pick span').textContent = fmtDate(e.lastUsedAt);
    li.querySelector('.pick').setAttribute('aria-pressed', String(e.id === activeId));
    li.querySelector('.pick').onclick = () => changeTares(selectTare(settings.tares, e.id, Date.now()));
    li.querySelector('.del').onclick = () => changeTares(deleteTare(settings.tares, e.id), `${fmtG(e.grams)} g gelöscht`);
    items.push(li);
  }
  el.tares.replaceChildren(...items);
  const none = activeId === null;
  el.zero.classList.toggle('on', none);
  el.zero.setAttribute('aria-pressed', String(none));
}

// ---------- rendering ----------
let bigHtml = null;
function setBig(html, stale) {
  el.big.classList.toggle('stale', stale);
  if (html !== bigHtml) { bigHtml = html; el.big.innerHTML = html; } // only touch the DOM on change
}
function setState(cls, text) {
  if (el.state.className !== `state ${cls}`) el.state.className = `state ${cls}`;
  if (el.state.textContent !== text) el.state.textContent = text;
}
const num = (g, unit) => (unit === 'kg' ? `<span class="num">${fmtKg(g)}<small>kg</small></span>` : `<span class="num">${fmtG(g)}<small>g</small></span>`);

function render() {
  const now = performance.now();
  const v = m.view(now);
  const tareOn = v.tare !== false;
  const T = tareOn ? activeGrams(settings.tares) : 0;

  if (v.phase === 'disconnected') {
    setState('off', 'Waage nicht verbunden');
    setBig(`<span class="connect">Waage verbinden</span><span class="sub">${scanError ? esc(scanError) : (scanner.scanAvailable() ? 'Waage einschalten, dann tippen.' : NO_SCAN)}</span>`, false);
  } else if (v.phase === 'needEmpty') {
    setState('warn', 'Leerwert nötig');
    const sub = v.raw === null
      ? (v.hint ? 'Keine Daten. Waage einschalten.' : 'Warte auf Waage …')
      : `Waage zeigt ${fmtG(v.raw)} g · ${v.steady ? 'ruhig' : 'unruhig'}`;
    setBig(`<span class="prompt-box${v.steady ? ' ready' : ''}"><span class="prompt">Waage leer? Antippen</span><span class="sub">${sub}</span></span>`, false);
  } else if (v.phase === 'live') {
    setState('live', 'Live');
    const sub = !tareOn ? 'Personenwaage' : T ? `netto · Tara ${fmtG(T)} g` : 'netto · ohne Tara';
    setBig(`${num(v.total - T, v.unit)}<span class="sub">${sub}</span>`, false);
  } else {
    const ago = Math.round((v.ageMs ?? 0) / 1000);
    setState('warn', `Nicht aktuell · vor ${ago} s`);
    const value = v.staleTotal === null ? '<span class="num">–</span>' : num(v.staleTotal - T, v.unit);
    const sub = v.hint ? 'Waage antippen zum Aufwecken.<br>Danach Waage leeren und bestätigen.' : `vor ${ago} s`;
    setBig(`${value}<span class="sub">${sub}</span>`, true);
  }

  el.save.disabled = !canSave(v);
  renderTares();

  const connected = v.phase !== 'disconnected';
  el.connect.hidden = connected;
  el.disconnect.hidden = !connected;
  el.rezero.disabled = v.phase !== 'live';
  if (el.sheet.open) renderDiag(v, now);
}

function renderDiag(v, now) {
  const recent = diag.frames.filter((t) => now - t <= 5000).length;
  el.diag.textContent = [
    `Zustand: ${v.phase}`,
    `Rohwert R: ${v.raw ?? '–'} g`,
    `Leerwert Z: ${v.zero ?? '–'} g`,
    `Waage: ${v.scaleId ?? '–'} (${diag.model ?? '–'})`,
    `Frames/s: ${(recent / 5).toFixed(1)}`,
    `Events: ${diag.events}`,
    `Verworfen: ${diag.dropped}`,
    `Letzte Nutzdaten: ${diag.hex}`,
    `Zuletzt verworfen: ${diag.rejected}`,
    `requestLEScan: ${ble.scanAvailable() ? 'verfügbar' : 'nicht verfügbar'}${demo ? ' (Demo aktiv)' : ''}`,
    `Wake Lock: ${'wakeLock' in navigator ? (wakeLock ? 'gehalten' : 'nicht gehalten') : 'nicht verfügbar'}`,
  ].join('\n');
}

let rafPending = false;
function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; render(); });
}

// ---------- theme and wake lock ----------
function applyTheme() {
  const t = { day: 'light', night: 'dark' }[settings.theme];
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

let wakeLock = null;
async function updateWakeLock() {
  if (settings.display !== 'awake') {
    await wakeLock?.release().catch(() => {});
    wakeLock = null;
    el.wake.textContent = 'Bildschirm darf sich ausschalten.';
    return;
  }
  if (!('wakeLock' in navigator)) { el.wake.textContent = 'Wach halten wird von diesem Browser nicht unterstützt.'; return; }
  if (document.visibilityState !== 'visible' || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    el.wake.textContent = 'Bildschirm bleibt wach.';
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
      if (settings.display === 'awake') el.wake.textContent = 'Bildschirm bleibt nicht wach (Sperre aufgehoben).';
    });
  } catch (err) {
    el.wake.textContent = `Bildschirm kann nicht wach gehalten werden (${err?.name ?? err}).`;
  }
}

// ---------- events ----------
el.big.addEventListener('click', () => {
  const now = performance.now();
  const v = m.view(now);
  if (v.phase === 'disconnected') connect();
  else if (v.phase === 'needEmpty') { if (m.confirmEmpty(now)) render(); }
  else if (v.phase === 'live') saveCurrent(); // canSave() rejects person scales (tare false)
});
el.save.addEventListener('click', saveCurrent);
el.zero.addEventListener('click', () => changeTares(selectNone(settings.tares)));
el.more.addEventListener('click', () => { el.sheet.showModal(); render(); });
el.connect.addEventListener('click', () => { el.sheet.close(); connect(); });
el.disconnect.addEventListener('click', disconnect);
el.rezero.addEventListener('click', () => { m.resetZero(); el.sheet.close(); render(); });

for (const r of document.querySelectorAll('input[name=theme]')) {
  r.checked = r.value === settings.theme;
  r.addEventListener('change', () => { settings.theme = r.value; persist(); applyTheme(); });
}
for (const r of document.querySelectorAll('input[name=display]')) {
  r.checked = r.value === settings.display;
  r.addEventListener('change', () => { settings.display = r.value; persist(); updateWakeLock(); });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') updateWakeLock();
  else { scanner.stopScan(); m.disconnect(); }
  render();
});

setInterval(() => { m.tick(performance.now()); render(); }, 250);

applyTheme();
updateWakeLock();
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- demo: synthetic CK829 frames instead of BLE (?demo=1) ----------
function demoScanner() {
  let timer = 0;
  const frame = (grams) => {
    const f = new Uint8Array(18);
    f.set([0xcf, 0xe9, 0x09, 0x19, 0x41, 0xd8, 0xca, 0x01, 0x04]);
    const mag = Math.abs(grams);
    f[9] = mag & 0xff;
    f[10] = mag >> 8;
    f.fill(grams < 0 ? 0xff : 0, 11, 14);
    f[14] = 0x04;
    f[16] = f.slice(6, 16).reduce((a, b) => a ^ b, 0);
    f[17] = 0xff;
    return f;
  };
  return {
    scanAvailable: () => true,
    startScan(cb) {
      clearInterval(timer);
      const t0 = performance.now();
      timer = setInterval(() => cb({
        id: 'demo', name: 'LFSc', serviceData: new Map(),
        manufacturerData: new Map([[0, frame(performance.now() - t0 < 3000 ? 0 : 843)]]),
      }), 100);
      return Promise.resolve();
    },
    stopScan() { clearInterval(timer); },
  };
}

// ---------- version (version.txt is written by the Pages workflow) ----------
fetch('version.txt', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.text() : Promise.reject()))
  .then((t) => t.trim() || Promise.reject())
  .catch(() => 'dev')
  .then((v) => { el.version.textContent = `Version ${v}`; });
