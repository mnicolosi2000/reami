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

  // 1. Intercept manual offline-pdfs virtual paths
  if (url.origin === location.origin && url.pathname.startsWith('/offline-pdfs/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(OFFLINE_PDF_CACHE);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          console.log('[SW] Serving PDF from stable offline cache:', url.pathname);
          return cachedResponse;
        }
        
        console.warn('[SW] PDF not found in stable offline cache:', url.pathname);
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
        // For Storage, we first try to find the file by its stable ID (e.g. media/parts/{id}.pdf)
        let stableKey = '';
        if (isStorageRequest) {
          const parts = url.pathname.split('/');
          const objectPath = parts.slice(parts.indexOf('object') + 3).join('/'); // media/parts/123.pdf
          
          if (objectPath.startsWith('parts/')) {
            const songId = objectPath.replace('parts/', '').replace('.pdf', '');
            if (songId) {
              stableKey = `/offline-pdfs/${songId}`;
              
              // Check the dedicated offline cache first
              const offlineCache = await caches.open(OFFLINE_PDF_CACHE);
              const offlineMatch = await offlineCache.match(stableKey);
              if (offlineMatch) {
                console.log('[SW] Storage request matched stable offline cache:', stableKey);
                return offlineMatch;
              }
            }
          }
        }

        // Normal flow: check general API cache or fetch
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;

        try {
          const response = await fetch(request.clone());
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            const cache = await caches.open(API_CACHE_NAME);
            
            // We also store it in the API cache using the full request URL
            cache.put(request, responseToCache);
            
            // If it's a storage request, also update the stable key if we have it
            if (isStorageRequest && stableKey) {
              const stableCache = await caches.open(OFFLINE_PDF_CACHE);
              stableCache.put(stableKey, response.clone());
              console.log('[SW] Auto-cached storage request to stable key:', stableKey);
            }
          }
          return response;
        } catch (error) {
          // Fallback if offline
          console.log('[SW] Offline fallback for:', url.pathname);
          const fallbackResponse = await caches.match(stableKey || request);
          if (fallbackResponse) {
            console.log('[SW] Found fallback in cache');
            return fallbackResponse;
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
