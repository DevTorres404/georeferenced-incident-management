const CACHE_NAME = 'sgi-cache-v4';
const STATIC_ASSETS = [
  '/css/app.css',
  '/dist/css/adminlte.min.css',
  '/plugins/fontawesome-free/css/all.min.css',
  '/plugins/overlayScrollbars/css/OverlayScrollbars.min.css',
  '/img/SGI_LOGO.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('Authorization')) return;

  const url = new URL(request.url);
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  const isApprovedStaticAsset = STATIC_ASSETS.includes(url.pathname);

  if (
    !isHttp ||
    url.origin !== self.location.origin ||
    request.mode === 'navigate' ||
    !isApprovedStaticAsset
  ) return;

  const fetchAndCache = () => fetch(request).then((response) => {
    if (response && response.status === 200) {
      const clone = response.clone();
      return caches.open(CACHE_NAME)
        .then((cache) => cache.put(request, clone))
        .then(() => response);
    }
    return response;
  });
  const matchOfflineFallback = () => caches.match(request).then((cached) => {
    if (cached || !url.search) return cached;
    return caches.match(url.pathname);
  });

  if (url.pathname === '/css/app.css') {
    event.respondWith(fetchAndCache().catch(matchOfflineFallback));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      return cached || fetchAndCache().catch(matchOfflineFallback);
    })
  );
});
