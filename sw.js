const CACHE_NAME = 'flashcard-text-cache-v1';
// Added paths for icons, though browser might fetch them via manifest anyway
const urlsToCache = [
    '/', // Represents the root directory index (important!)
    '/flashcards.html',
    '/manifest.json',
    'https://cdn.tailwindcss.com', // Tailwind styles
    '/icon-192.png', // Optional, but good to cache if provided
    '/icon-512.png'  // Optional, but good to cache if provided
];

// Install event: Cache essential files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache:', CACHE_NAME);
                // Use addAll which attempts to cache all URLs. If one fails, the whole operation fails.
                // Alternatively, cache individually and log errors if needed.
                return cache.addAll(urlsToCache).catch(error => {
                   console.error('Failed to cache one or more resources during install:', error);
                   // Even if some non-essential files fail (like icons), let the SW install.
                   // Re-throw for critical files if necessary. Here we let it proceed.
                });
            })
            .then(() => self.skipWaiting()) // Activate the new service worker immediately
    );
});

// Activate event: Clean up old caches
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of uncontrolled clients
    );
});

// Fetch event: Serve from cache first, fallback to network
self.addEventListener('fetch', event => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Strategy: Cache first, then network
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Cache hit - return response
                if (cachedResponse) {
                    // console.log('Serving from cache:', event.request.url);
                    return cachedResponse;
                }

                // Not in cache - fetch from network
                // console.log('Fetching from network:', event.request.url);
                return fetch(event.request).then(
                    networkResponse => {
                        // Check if we received a valid response
                        if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
                            return networkResponse;
                        }

                        // IMPORTANT: Clone the response. A response is a stream
                        // and because we want the browser to consume the response
                        // as well as the cache consuming the response, we need
                        // to clone it so we have two streams.
                        const responseToCache = networkResponse.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                // console.log('Caching new resource:', event.request.url);
                                cache.put(event.request, responseToCache);
                            });

                        return networkResponse;
                    }
                ).catch(error => {
                    console.error('Fetch failed; returning offline page instead.', error);
                    // Optional: return a fallback offline page/resource here
                    // e.g., return caches.match('/offline.html');
                });
            })
    );
});