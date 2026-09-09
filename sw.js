/* Flat build: the entire app is index.html, so the precache is five files.
   Cache-first for the shell (it never changes between deploys), and a runtime
   cache for the Google Fonts stylesheet + woff2 so the app looks right offline. */
const V = 'pmx-flat-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest',
               'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const font = /fonts\.(googleapis|gstatic)\.com/.test(r.url);
  if (!font && new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, {ignoreSearch: !font}).then(hit => hit || fetch(r)
    .then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(V).then(c => c.put(r, copy));
      }
      return res;
    })
    .catch(() => caches.match('index.html'))));
});
