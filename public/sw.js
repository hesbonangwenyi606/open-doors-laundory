const CACHE_NAME = 'open-doors-v2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/assets/logo.jpg',
  '/assets/laundry-machines.jpg',
  '/assets/process.jpg',
  '/assets/pricing-guide-full.jpg',
  '/assets/quality.jpg',
  '/assets/storefront.jpg',
  '/assets/chuna-mall.jpg',
  '/assets/hours.jpg',
];

const API_CACHE = 'open-doors-api-v1';
const OUTBOX_CACHE = 'open-doors-outbox-v1';

// Only public, unauthenticated GET endpoints may be cached. Authenticated
// admin responses (/api/admin/*) must NEVER be served stale.
const PUBLIC_API_PREFIXES = ['/api/process', '/api/site-settings', '/api/receipts/'];

function isPublicApiGet(request, url) {
  return (
    request.method === 'GET' &&
    PUBLIC_API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== API_CACHE && name !== OUTBOX_CACHE)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Non-GET API traffic (login, bookings, sync) is the app's job: the
  // Dexie outbox in the page owns offline queueing with idempotency keys,
  // so the service worker passes these straight through and never invents
  // success responses or replays authenticated bodies from a cache.
  if (request.method !== 'GET') {
    return;
  }

  // SPA navigation while offline: serve the cached app shell so the PWA
  // (including /offline-pos) boots without internet.
  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback(request));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (isPublicApiGet(request, url)) {
      event.respondWith(networkFirst(request));
    } else {
      event.respondWith(fetch(request));
    }
  } else if (url.pathname.startsWith('/assets/') || url.pathname.match(/\.(js|css|woff2|ico|png|jpg|jpeg|svg)$/)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

async function navigationFallback(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match('/index.html');
    if (cached) return cached;
    return new Response('Offline. Reconnect to load this page.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 404 });
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-outbox') {
    event.waitUntil(notifyClientsToSync());
  }
});

// Background Sync cannot replay the Dexie outbox (it lives in the page's
// IndexedDB); instead wake the page so IT can run processOutbox().
async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'SYNC_OUTBOX' });
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
