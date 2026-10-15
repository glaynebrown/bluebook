/* Lets the book open without internet in the kitchen.
   App files: network first, so an update you upload shows up right away; the saved copy is the fallback.
   Fonts: saved copy first -- those never change. */
const APP_CACHE = 'bb-app-v3';
const APP_FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'scale.js', 'store.js', 'manifest.json', 'cover-portrait.jpg', 'cover-landscape.jpg', 'icon-192.png', 'apple-touch-icon.png',
  'data/book.js', 'data/sides.js', 'data/soups.js', 'data/entrees.js', 'data/desserts.js', 'data/drinks.js', 'data/holiday.js',
];
const HOME = new URL('./', self.location).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE)
    .then(cache => Promise.allSettled(APP_FILES.map(url => cache.add(url))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== APP_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  if (url.startsWith('https://fonts.g')) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(APP_CACHE).then(c => c.put(req, copy));
      return res;
    })));
    return;
  }
  if (url.startsWith(HOME)) {
    event.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(APP_CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('./') : Response.error()))));
  }
});
