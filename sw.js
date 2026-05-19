const CACHE_NAME = 'setlist-studio-v2';
const API_CACHE_NAME = 'api-cache-v2';
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
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
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

  // Handle Supabase API and Storage requests
  const isStorageRequest = url.hostname.includes('supabase.co') && 
    (url.pathname.includes('/storage/v1/object/public/') || url.pathname.includes('/storage/v1/object/sign/'));
  const isRestRequest = url.hostname.includes('supabase.co') && url.pathname.includes('/rest/v1/');
  
  if ((isStorageRequest || isRestRequest) && request.method === 'GET') {
    event.respondWith(
      (async () => {
        // For Storage (PDFs/Images), use Cache-First strategy to prefer offline downloads
        if (isStorageRequest) {
          const cachedResponse = await caches.match(request, { ignoreSearch: true });
          if (cachedResponse) {
            return cachedResponse;
          }
        }

        try {
          const response = await fetch(request.clone());
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            const cache = await caches.open(API_CACHE_NAME);
            cache.put(request, responseToCache);
          }
          return response;
        } catch (error) {
          // Fallback if network fails
          const matchOptions = isStorageRequest ? { ignoreSearch: true } : {};
          const cachedResponse = await caches.match(request, matchOptions);
          
          if (cachedResponse) {
            return cachedResponse;
          }
          
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
