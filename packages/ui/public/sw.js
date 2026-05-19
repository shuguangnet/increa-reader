/// <reference lib="webworker" />

const CACHE_NAME = 'increa-reader-v3'
const API_CACHE_NAME = 'increa-api-v3'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/vite.svg',
]

// API endpoints to cache (Network First strategy)
const CACHEABLE_API_PATTERNS = [
  /\/api\/workspace\/tree$/,
  /\/api\/workspace\/repos$/,
  /\/api\/tags$/,
  /\/api\/config\/api-settings$/,
]

const API_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Install: pre-cache static assets (App Shell)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  )
  self.skipWaiting()
})

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  )
  self.clients.claim()
})

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Fetch: Cache First for static assets, Network First for API, navigation fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET requests
  if (event.request.method !== 'GET') return

  // Skip cross-origin requests (except API on same origin)
  if (url.origin !== self.location.origin) return

  // Skip Vite HMR and dev server requests
  if (url.pathname.startsWith('/@') || url.pathname.includes('/__vite_hmr')) return

  // API requests: Network First with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(event.request))
    return
  }

  // Navigation requests: Network First with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(event.request))
    return
  }

  // Static assets: Cache First
  event.respondWith(cacheFirst(event.request))
})

// Cache First strategy — for static assets
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
  }
}

// Network First with API cache — for API requests
async function networkFirstWithCache(request) {
  const url = new URL(request.url)
  const isCacheable = CACHEABLE_API_PATTERNS.some(pattern => pattern.test(url.pathname))

  try {
    const response = await fetch(request)
    if (response.ok && isCacheable) {
      const cache = await caches.open(API_CACHE_NAME)
      // Store with timestamp header for TTL
      const responseToCache = response.clone()
      const headers = new Headers(responseToCache.headers)
      headers.set('sw-cache-timestamp', Date.now().toString())
      const body = await responseToCache.blob()
      const cachedResponse = new Response(body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers,
      })
      cache.put(request, cachedResponse)
    }
    return response
  } catch {
    // Network failed: try cache
    const cached = await caches.match(request)
    if (cached) {
      // Check TTL
      const timestamp = cached.headers.get('sw-cache-timestamp')
      if (timestamp) {
        const age = Date.now() - parseInt(timestamp, 10)
        if (age < API_CACHE_TTL) {
          return cached
        }
      }
      // Return stale cache anyway when offline
      return cached
    }
    return new Response(JSON.stringify({ error: 'Offline', data: null }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// Network First with offline fallback — for navigation
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    // Fall back to cached index.html for SPA routing
    const indexHtml = await caches.match('/index.html')
    if (indexHtml) return indexHtml
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
  }
}

// Background Sync — for offline file operations
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-file-operations') {
    event.waitUntil(replayOfflineOperations())
  }
})

async function replayOfflineOperations() {
  // This will be handled by the frontend —
  // the app stores operations in IndexedDB when offline,
  // and the sync event triggers replay
  const allClients = await self.clients.matchAll()
  for (const client of allClients) {
    client.postMessage({ type: 'REPLAY_OFFLINE_OPERATIONS' })
  }
}

// Push notification handler (for future use)
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'Increa Reader', {
      body: data.body || '',
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      tag: data.tag || 'default',
    }),
  )
})