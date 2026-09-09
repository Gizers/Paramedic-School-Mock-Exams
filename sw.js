/* ---------------------------------------------------------------
   Service worker.
   - App shell: cache-first, refreshed in the background.
   - Question data: stale-while-revalidate so updated banks land
     without ever leaving you stranded offline.
   - Slide images: cache-first, capped so the store stays sane.
   --------------------------------------------------------------- */

const VERSION   = 'v1-class';
const SHELL     = 'pmx-shell-' + VERSION;
const DATA      = 'pmx-data-' + VERSION;
const MEDIA     = 'pmx-media-' + VERSION;
const FONTS     = 'pmx-fonts-' + VERSION;
const KEEP      = [SHELL, DATA, MEDIA, FONTS];

const SHELL_URLS = [
  './',
  'index.html',
  'css/app.css',
  'js/main.js',
  'js/util.js',
  'js/store.js',
  'js/data.js',
  'js/srs.js',
  'js/session.js',
  'js/views/home.js',
  'js/views/build.js',
  'js/views/quiz.js',
  'js/views/results.js',
  'js/views/progress.js',
  'js/views/reference.js',
  'js/views/settings.js',
  'data/manifest.json',
  'manifest.webmanifest',
  'icons/icon.svg'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('pmx-') && KEEP.indexOf(k) === -1).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', ev => {
  if (ev.data === 'skipWaiting') self.skipWaiting();
});

function isData(url)  { return url.pathname.includes('/data/'); }
function isMedia(url) { return url.pathname.includes('/media/'); }

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Webfonts live on Google's CDN. Cache whatever loads so the app keeps its
  // typography offline after the first online visit; system fonts cover the rest.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    ev.respondWith(
      caches.open(FONTS).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          cache.put(req, res.clone());
          return res;
        } catch (e) {
          return new Response('', { status: 504 });
        }
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  if (isMedia(url)) {
    ev.respondWith(
      caches.open(MEDIA).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          return new Response('', { status: 504 });
        }
      })
    );
    return;
  }

  if (isData(url)) {
    ev.respondWith(
      caches.open(DATA).then(async cache => {
        const hit = await cache.match(req);
        const net = fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        return hit || net.then(r => r || new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
      })
    );
    return;
  }

  // app shell
  ev.respondWith(
    caches.open(SHELL).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (hit) { net; return hit; }
      const res = await net;
      if (res) return res;
      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      return new Response('Offline', { status: 503 });
    })
  );
});
