/**
 * PokeScan Service Worker - PWA Offline Caching
 * Optimized for Vite Production & SPA Deployment
 */
const CACHE_NAME = 'pokescan-v2';
const CORE_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install Event - Pre-cache core shell safely
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Add core shell files individually to avoid total failure if one fails
      for (const asset of CORE_SHELL_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[SW] Falha ao pré-carregar asset do shell:', asset, err);
        }
      }
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up stale cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network-first with runtime dynamic caching for local assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignore browser extensions, non-http schemes, and external APIs
  if (!url.protocol.startsWith('http')) return;

  // For external dynamic APIs, bypass service worker cache
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('pokemontcg.io') ||
    url.hostname.includes('tcgdex.net') ||
    url.hostname.includes('er-api.com')
  ) {
    return;
  }

  // Network first with cache fallback for HTML navigation and local assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // If navigation request fails, return cached index.html
        if (event.request.mode === 'navigate') {
          const indexFallback = await caches.match('/index.html');
          if (indexFallback) return indexFallback;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});
