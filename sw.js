// Service Worker for Matthew Anderson's Portfolio
// Version: 1.0.0

const CACHE_NAME = 'portfolio-v1.0.0';
const RUNTIME_CACHE = 'portfolio-runtime-v1';
const API_CACHE = 'portfolio-api-v1';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/projects-data.json',
    '/manifest.json',
    '/offline.html'
];

// API endpoints to cache with network-first strategy
const API_ROUTES = [
    'https://api.github.com/users/and3rn3t',
    'https://api.github.com/users/and3rn3t/repos'
];

// Install event - cache critical assets
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Precaching assets');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch((error) => {
                console.error('[Service Worker] Precaching failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => {
                            // Delete old caches
                            return cacheName.startsWith('portfolio-') && 
                                   cacheName !== CACHE_NAME &&
                                   cacheName !== RUNTIME_CACHE &&
                                   cacheName !== API_CACHE;
                        })
                        .map((cacheName) => {
                            console.log('[Service Worker] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip chrome-extension and other non-http(s) requests
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // API requests - Network First strategy
    if (isAPIRequest(url)) {
        event.respondWith(networkFirstStrategy(request, API_CACHE));
        return;
    }

    // Static assets - Cache First strategy
    if (isStaticAsset(url)) {
        event.respondWith(cacheFirstStrategy(request, CACHE_NAME));
        return;
    }

    // Default - Stale While Revalidate strategy
    event.respondWith(staleWhileRevalidateStrategy(request, RUNTIME_CACHE));
});

// Check if request is to an API endpoint
function isAPIRequest(url) {
    return url.hostname === 'api.github.com' ||
           url.pathname.includes('/api/') ||
           API_ROUTES.some(route => url.href.startsWith(route));
}

// Check if request is for a static asset
function isStaticAsset(url) {
    const staticExtensions = ['.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.svg', '.woff', '.woff2'];
    return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

// Cache First Strategy - Fast, good for static assets
async function cacheFirstStrategy(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.error('[Service Worker] Fetch failed:', error);
        return getOfflineFallback(request);
    }
}

// Network First Strategy - Fresh data, good for APIs
async function networkFirstStrategy(request, cacheName) {
    const cache = await caches.open(cacheName);
    
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.log('[Service Worker] Network failed, using cache');
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        return getOfflineFallback(request);
    }
}

// Stale While Revalidate Strategy - Balance of speed and freshness
async function staleWhileRevalidateStrategy(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    const fetchPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        })
        .catch((error) => {
            console.log('[Service Worker] Network request failed:', error);
        });
    
    return cachedResponse || fetchPromise || getOfflineFallback(request);
}

// Get offline fallback page
async function getOfflineFallback(request) {
    const cache = await caches.open(CACHE_NAME);
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
        const offlinePage = await cache.match('/offline.html');
        if (offlinePage) {
            return offlinePage;
        }
    }
    
    // Return a basic offline response
    return new Response('Offline - Content not available', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({
            'Content-Type': 'text/plain'
        })
    });
}

// Listen for messages from the client
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            })
        );
    }
});

// Background sync for form submissions
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-form-submissions') {
        event.waitUntil(syncFormSubmissions());
    }
});

async function syncFormSubmissions() {
    // Implement form submission sync logic here
    console.log('[Service Worker] Syncing form submissions');
}

// Push notification support (optional)
self.addEventListener('push', (event) => {
    if (!event.data) {
        return;
    }

    const data = event.data.json();
    const title = data.title || 'Portfolio Update';
    const options = {
        body: data.body || 'New content available',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    const urlToOpen = event.notification.data.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                // Check if there's already a window open
                for (const client of windowClients) {
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window if none exists
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

console.log('[Service Worker] Loaded');
