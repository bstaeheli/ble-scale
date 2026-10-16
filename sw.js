// Offline support: precache the app, then network-first with cache fallback.
// Bump CACHE on each release.
const CACHE = 'waage-v3';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'fonts/archivo.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/app.js',
  'src/ble.js',
  'src/measurement.js',
  'src/storage.js',
  'src/tares.js',
  'src/scales/index.js',
  'src/scales/ck829.js',
  'src/scales/xiaomi.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }) // revalidate: skip the 10 min HTTP cache
    .then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })
    .catch(() => caches.match(req, { ignoreSearch: true })
      .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
