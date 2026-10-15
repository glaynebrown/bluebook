/* Lets the book open without internet in the kitchen.
   App files: network first, so an update you upload shows up right away; the saved copy is the fallback.
   Fonts: saved copy first -- those never change. */
const APP_CACHE = 'bb-app-v35';
const APP_FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'scale.js', 'store.js', 'cloud.js', 'firebase-config.js', 'ink.js', 'cook.js', 'manifest.json', 'icon-192.png', 'apple-touch-icon.png',
  'data/book.js', 'data/sides.js', 'data/soups.js', 'data/entrees.js', 'data/desserts.js', 'data/drinks.js', 'data/holiday.js',
];
// Mom's photos and the covers, saved in the background so the whole book works offline.
const EXTRA = ['cover-portrait.jpg', 'cover-landscape.jpg', 'icon-512.png',
  'photos/au-gratin.jpg', 'photos/bean-dip.jpg', 'photos/black-bean-salad.jpg', 'photos/broccoli-cherry-salad.jpg', 'photos/chinese-coleslaw.jpg', 'photos/cowboy-caviar.jpg', 'photos/cranberry-relish.jpg', 'photos/dads-turkey.jpg', 'photos/diana-banana-bread.jpg', 'photos/honey-carrots.jpg', 'photos/judy-corn-casserole.jpg', 'photos/lazy-lasagna.jpg', 'photos/letter-book.jpg', 'photos/letter-mom.jpg', 'photos/lime-jello-mold.jpg', 'photos/menu-kings-hawaiian.jpg', 'photos/menu-pumpkin-pie.jpg', 'photos/moms-mead.jpg', 'photos/nicks-sangria.jpg', 'photos/rice-krispie-treats.jpg', 'photos/sloppy-joes.jpg', 'photos/spinach-salad.jpg', 'photos/sweet-potato-delight.jpg', 'photos/taco-salad.jpg', 'photos/thanksgiving-stuffing.jpg', 'photos/toll-house-cookies.jpg', 'photos/whitefish-parmesan.jpg'];
const HOME = new URL('./', self.location).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE)
    .then(cache => Promise.allSettled(APP_FILES.map(url => cache.add(url))).then(() => { Promise.allSettled(EXTRA.map(url => cache.add(url))); }))
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
  if (url.startsWith('https://fonts.g') || url.startsWith('https://www.gstatic.com/firebasejs/')) {
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
