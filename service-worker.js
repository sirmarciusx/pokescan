/**
 * PokeScan Service Worker - PWA Offline Caching
 */
const CACHE_NAME = 'pokescan-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './src/styles/variables.css',
  './src/styles/main.css',
  './src/styles/scanner.css',
  './src/styles/card.css',
  './src/styles/collection.css',
  './src/styles/modal.css',
  './src/main.js',
  './src/services/soundService.js',
  './src/services/currencyService.js',
  './src/services/storageService.js',
  './src/services/pokemonApi.js',
  './src/services/geminiVision.js',
  './src/services/ocrService.js',
  './src/components/cameraScanner.js',
  './src/components/holographicCard.js',
  './src/components/cardDetailModal.js',
  './src/components/collectionView.js',
  './src/components/searchModal.js',
  './src/components/settingsModal.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn('Cache warning:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Network first with cache fallback
  if (e.request.method !== 'GET') return;
  
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cache successful local asset responses
        if (res && res.status === 200 && e.request.url.startsWith(self.location.origin)) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
