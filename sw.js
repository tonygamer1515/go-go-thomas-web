const CACHE = 'gogo-thomas-1-1-v5';
const SHELL = [
  './', './index.html', './styles.css', './game.js', './manifest.webmanifest',
  './assets/vendor/three.min.js', './assets/vendor/OBJLoader.js', './assets/vendor/fflate.min.js',
  './assets/offline-data.js', './assets/images/logo.png', './assets/images/splash.jpg',
  './assets/images/app-icon-192.png', './assets/images/app-icon-512.png', './assets/images/apple-touch-icon.png'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin || request.url.endsWith('.apk')) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && !request.headers.has('range')) {
      const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
