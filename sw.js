const CACHE_NAME = 'setlist-studio-v2';
const API_CACHE_NAME = 'api-cache-v2';
const OFFLINE_PDF_CACHE = 'offline-pdfs-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME && cacheName !== OFFLINE_PDF_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Intercept manual offline-pdf virtual paths
  if (url.origin === location.origin && url.pathname.startsWith('/offline-pdf/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(OFFLINE_PDF_CACHE);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;
        
        // If not found in offline-pdf path, this is problematic as it's a virtual path
        return new Response('Not found in offline storage', { status: 404 });
      })()
    );
    return;
  }

  // 2. Handle Supabase API and Storage requests
  const isStorageRequest = url.hostname.includes('supabase.co') && 
    (url.pathname.includes('/storage/v1/object/public/') || url.pathname.includes('/storage/v1/object/sign/'));
  const isRestRequest = url.hostname.includes('supabase.co') && url.pathname.includes('/rest/v1/');
  
  if ((isStorageRequest || isRestRequest) && request.method === 'GET') {
    event.respondWith(
      (async () => {
        // For Storage, we first try to find the file by its normalized path (song ID usually)
        // Extract filename/path: e.g. media/parts/123-abc.pdf
        let storageKey = '';
        if (isStorageRequest) {
          const parts = url.pathname.split('/');
          const objectPath = parts.slice(parts.indexOf('object') + 3).join('/'); // Skip object/public/bucket/
          if (objectPath) {
            storageKey = `/offline-pdf/${objectPath}`;
            
            // Check the dedicated offline cache first
            const offlineCache = await caches.open(OFFLINE_PDF_CACHE);
            const offlineMatch = await offlineCache.match(storageKey);
            if (offlineMatch) return offlineMatch;
          }
        }

        // Normal flow: check general API cache or fetch
        const cacheMatchRequest = isStorageRequest ? new Request(storageKey) : request;
        const cachedResponse = await caches.match(cacheMatchRequest);
        if (cachedResponse) return cachedResponse;

        try {
          const response = await fetch(request.clone());
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            const cache = await caches.open(API_CACHE_NAME);
            
            if (isStorageRequest && storageKey) {
              cache.put(storageKey, responseToCache);
            } else {
              cache.put(request, responseToCache);
            }
          }
          return response;
        } catch (error) {
          // Fallback if offline
          const fallbackResponse = await caches.match(storageKey || request);
          if (fallbackResponse) return fallbackResponse;
          
          throw new Error('Offline and not in cache');
        }
      })()
    );
    return;
  }

  // Handle local static assets
  if (request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        // Cache new static assets
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      }).catch(() => {
        // Fallback for offline mode if asset is not in cache
        if (request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});
