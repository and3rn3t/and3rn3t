// Service Worker for Matthew Anderson's Portfolio
// BUILD_ID is stamped with the commit SHA by pages.yml at deploy time, so every
// deploy gets a new cache name and the browser sees a byte-different worker.
const BUILD_ID = '__BUILD_SHA__';

const CACHE_NAME = `portfolio-${BUILD_ID}`;
const RUNTIME_CACHE = `portfolio-runtime-${BUILD_ID}`;
const API_CACHE = `portfolio-api-${BUILD_ID}`;

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/main.js',
    '/modules/debug.js',
    '/modules/error-handler.js',
    '/modules/theme.js',
    '/modules/navigation.js',
    '/fonts/inter-variable.woff2',
    '/icons/sprite.svg',
    '/projects-data.json',
    '/manifest.json',
    '/offline.html',
];

// Install event - cache critical assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then(cache => {
                // Cache individually so one missing asset doesn't abort the whole install
                return Promise.allSettled(
                    PRECACHE_ASSETS.map(asset =>
                        cache.add(asset).catch(error => {
                            console.warn('[Service Worker] Failed to precache:', asset, error);
                        })
                    )
                );
            })
            .then(() => self.skipWaiting())
            .catch(error => {
                console.error('[Service Worker] Precaching failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches
            .keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => {
                            // Delete old caches
                            return (
                                cacheName.startsWith('portfolio-') &&
                                cacheName !== CACHE_NAME &&
                                cacheName !== RUNTIME_CACHE &&
                                cacheName !== API_CACHE
                            );
                        })
                        .map(cacheName => {
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', event => {
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

    // Skip external analytics (Cloudflare, Google Analytics, etc.)
    const externalAnalytics = [
        'cloudflareinsights.com',
        'cloudflare.com/beacon',
        'google-analytics.com',
        'googletagmanager.com',
        'analytics.google.com',
    ];

    if (externalAnalytics.some(domain => url.hostname.includes(domain))) {
        // Let browser handle these directly, no caching
        return;
    }

    // API requests - Network First strategy
    if (isAPIRequest(url)) {
        event.respondWith(networkFirstStrategy(request, API_CACHE));
        return;
    }

    // Our own data files and pages change without a code deploy - always try the network
    if (isFreshContent(request, url)) {
        event.respondWith(networkFirstStrategy(request, RUNTIME_CACHE));
        return;
    }

    // Code: serve instantly from cache, refresh in the background
    if (isCode(url)) {
        event.respondWith(staleWhileRevalidateStrategy(request, CACHE_NAME));
        return;
    }

    // Immutable-ish binaries (fonts, images, wasm) - Cache First strategy
    if (isStaticAsset(url)) {
        event.respondWith(cacheFirstStrategy(request, CACHE_NAME));
        return;
    }

    // Default - Stale While Revalidate strategy
    event.respondWith(staleWhileRevalidateStrategy(request, RUNTIME_CACHE));
});

// Check if request is to an API endpoint
function isAPIRequest(url) {
    return url.hostname === 'api.github.com' || url.pathname.includes('/api/');
}

// Pages and JSON data (github-data.json, posts-data.json, ...) must stay fresh
function isFreshContent(request, url) {
    return request.mode === 'navigate' || url.pathname.endsWith('.json');
}

function isCode(url) {
    return url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
}

// Check if request is for a static asset
function isStaticAsset(url) {
    const staticExtensions = ['.wasm', '.png', '.jpg', '.jpeg', '.svg', '.woff', '.woff2'];
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
    } catch (_error) {
        // Fall back to this cache, then to anything precached at install
        const cachedResponse = (await cache.match(request)) || (await caches.match(request));

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
        .then(networkResponse => {
            if (networkResponse && networkResponse.ok) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        })
        .catch(() => {
            return null; // Return null instead of undefined
        });

    // Return cached response immediately if available
    if (cachedResponse) {
        // Update cache in background
        fetchPromise.catch(() => {}); // Silently fail background update
        return cachedResponse;
    }

    // Wait for network response or return fallback
    const networkResponse = await fetchPromise;
    return networkResponse || getOfflineFallback(request);
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
            'Content-Type': 'text/plain',
        }),
    });
}
