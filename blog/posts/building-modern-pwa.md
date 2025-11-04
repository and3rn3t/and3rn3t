---
title: "Building a Modern Progressive Web App"
date: "2025-11-03"
author: "Matthew Anderson"
tags: ["pwa", "web-development", "javascript", "service-worker"]
category: "tutorial"
excerpt: "Learn how to transform a static website into a fully-functional Progressive Web App with offline support, installability, and native app features."
featured: true
---

# Building a Modern Progressive Web App

Progressive Web Apps (PWAs) have revolutionized how we think about web applications. They combine the best of web and native apps, offering offline functionality, installability, and app-like experiences.

## Why PWAs Matter

In today's mobile-first world, users expect:

- ⚡ **Fast loading times** - Even on slow connections
- 📱 **Installability** - Add to home screen like native apps
- 🔌 **Offline functionality** - Work without internet connection
- 🔔 **Push notifications** - Re-engage users effectively
- 🎯 **App-like experience** - Smooth, native-feeling interactions

## The Core Components

### 1. Web App Manifest

The manifest.json file defines your app's appearance and behavior:

```json
{
  "name": "My Portfolio",
  "short_name": "Portfolio",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#00d4ff",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}
```

### 2. Service Worker

The service worker is the heart of your PWA:

```javascript
// sw.js
const CACHE_NAME = 'portfolio-v1';
const STATIC_ASSETS = [
  '/',
  '/styles.css',
  '/script.js',
  '/offline.html'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
```

### 3. Cache Strategies

Different caching strategies for different scenarios:

**Cache First** (best for static assets):
```javascript
async function cacheFirst(request) {
  const cached = await caches.match(request);
  return cached || fetch(request);
}
```

**Network First** (best for dynamic content):
```javascript
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    return await caches.match(request);
  }
}
```

## Implementation Steps

### Step 1: Create the Manifest
Add the manifest link to your HTML:
```html
<link rel="manifest" href="/manifest.json">
```

### Step 2: Register the Service Worker
```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('SW registered:', reg))
    .catch(err => console.error('SW error:', err));
}
```

### Step 3: Add Install Prompt
```javascript
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallButton();
});

async function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('Install outcome:', outcome);
    deferredPrompt = null;
  }
}
```

## Performance Benefits

After implementing PWA features, you'll see:

- 📊 **90%+ cache hit rate** on return visits
- ⚡ **60% faster load times** with cached assets
- 🚀 **Lighthouse PWA score** of 100
- 📱 **Native app experience** on all devices

## Browser Support

PWAs work across all modern browsers:

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Service Worker | ✅ | ✅ | ✅ | ✅ |
| Manifest | ✅ | ✅ | ✅ | ✅ |
| Add to Home | ✅ | ✅ | ✅ | ✅ |
| Push Notifications | ✅ | ✅ | ⚠️ | ✅ |

## Best Practices

1. **Start Simple** - Begin with basic offline support
2. **Cache Wisely** - Don't cache everything, be selective
3. **Update Gracefully** - Handle service worker updates properly
4. **Test Thoroughly** - Test offline scenarios extensively
5. **Monitor Performance** - Track cache hit rates and load times

## Conclusion

PWAs represent the future of web development. They offer native app experiences without the complexity of app stores and platform-specific development.

Ready to make your site a PWA? Start with the manifest, add a service worker, and iterate from there!

---

**Resources:**
- [MDN PWA Guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Google PWA Checklist](https://web.dev/pwa-checklist/)
- [Service Worker Cookbook](https://serviceworke.rs/)
