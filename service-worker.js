const CACHE_NAME = 'gymnote-v1';
const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './assets/dexie.min.js',
  './assets/chart.umd.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  'https://cdn.tailwindcss.com'
];

// Install event - cache app shell
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        console.log('App shell cached, skipping waiting');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated, claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip cross-origin requests that aren't in our cache
  if (!event.request.url.startsWith(self.location.origin) && 
      !APP_SHELL.includes(event.request.url)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.match(event.request)
          .then(response => {
            if (response) {
              // Found in cache, return it
              return response;
            }
            
            // Not in cache, fetch from network
            return fetch(event.request)
              .then(networkResponse => {
                // Cache successful responses for app shell resources
                if (networkResponse.status === 200) {
                  const responseClone = networkResponse.clone();
                  cache.put(event.request, responseClone);
                }
                return networkResponse;
              })
              .catch(() => {
                // Network failed, return offline page for navigations
                if (event.request.mode === 'navigate') {
                  return cache.match('./index.html');
                }
                throw new Error('Network error and no cache available');
              });
          });
      })
  );
});

// Listen for messages from the app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Notify clients when a new version is available
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

console.log('Service Worker loaded');