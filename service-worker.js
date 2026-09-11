const CACHE_NAME = 'toe-connect-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/submit.html',
  '/tips.html',
  '/allies.html',
  '/ally-submit.html',
  '/submit-tip.html',
  '/favicon.svg',
  '/icon-192.png',
  '/favicon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Network-first for pages and functions (so listings/tips stay fresh),
// falling back to cache only when offline.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/.netlify/functions/')) {
    // Never cache API calls — always go to the network.
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
