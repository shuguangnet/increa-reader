/// <reference lib="webworker" />

// ══════════════════════════════════════════════════════════════════════
// Increa Reader — Service Worker v5
//
// Cache strategies:
//   1. Static assets (JS/CSS/images)   → Cache First (fast load, bg revalidate)
//   2. API data (tree, config, tags)   → Stale-While-Revalidate (instant + fresh)
//   3. API content (views, pdf text)    → Stale-While-Revalidate (instant + fresh)
//   4. API streaming (chat/query SSE)  → Network Only (never cache)
//   5. Navigation (HTML pages)         → Network First + offline fallback
//   6. Fonts & icons                   → Cache First (immutable, long TTL)
//   7. Screenshot/manifest assets      → Cache First (rarely change)
// ══════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'v6'
const CACHE_NAME = `increa-reader-${CACHE_VERSION}`
const STATIC_CACHE = `increa-static-${CACHE_VERSION}`
const API_CACHE = `increa-api-${CACHE_VERSION}`
const FONT_CACHE = `increa-fonts-${CACHE_VERSION}`
const NAV_CACHE = `increa-nav-${CACHE_VERSION}`

// ── Config ──────────────────────────────────────────────────────────
const API_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const NAV_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const API_CACHE_MAX_ENTRIES = 150
const STATIC_CACHE_MAX_ENTRIES = 400
const NAV_CACHE_MAX_ENTRIES = 20

// Pre-cache App Shell on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon-180.png',
]

// API paths that use Stale-While-Revalidate
const SWR_API_PATTERNS = [
  /\/api\/workspace\/tree$/,
  /\/api\/workspace\/repos$/,
  /\/api\/tags$/,
  /\/api\/config\/api-settings$/,
  // Content endpoints: file views and PDF page text (small, cacheable)
  /\/api\/views\//,
  /\/api\/pdf\/page\//,
]

// API paths that should NEVER be cached (streams, mutations, large binary)
const NEVER_CACHE_API_PATTERNS = [
  /\/api\/chat\/query/,       // SSE streaming endpoint
  /\/api\/pdf\/page-render/,  // Large binary responses (SVG/PNG)
  /\/api\/preview/,           // Dynamic binary preview
  /\/api\/temp-image\//,     // Temporary images — may be cleaned up server-side
]

// Immutable asset patterns (font files, hashed Vite assets)
const IMMUTABLE_PATTERNS = [
  /\.(woff2?|ttf|otf|eot)$/i,
  /\/assets\/[a-f0-9]{8,}\.\w+\./, // Vite hashed assets like /assets/abc12345.xxx.js
]


// ══════════════════════════════════════════════════════════════════════
// Strategy 1: Cache First (static assets, fonts, hashed resources)
// ══════════════════════════════════════════════════════════════════════
async function cacheFirst(request, cacheName = STATIC_CACHE) {
  const cached = await caches.match(request)
  if (cached) {
    // Revalidate in background for non-font resources
    if (cacheName !== FONT_CACHE) {
      fetch(request).then((freshResponse) => {
        if (freshResponse.ok) {
          caches.open(cacheName).then((cache) => cache.put(request, freshResponse))
        }
      }).catch(() => {})
    }
    return cached
  }

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
  }
}


// ══════════════════════════════════════════════════════════════════════
// Strategy 2: Stale-While-Revalidate (API data endpoints)
// Returns cached immediately, updates cache in background
// ══════════════════════════════════════════════════════════════════════
async function staleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE)
  const cached = await cache.match(request)

  // Check if the cached entry is stale beyond TTL
  let isExpired = false
  if (cached) {
    const timestamp = cached.headers.get('sw-cache-timestamp')
    if (timestamp) {
      const age = Date.now() - parseInt(timestamp, 10)
      // If older than 2x TTL, mark as expired but still return it
      isExpired = age > API_CACHE_TTL_MS * 2
    }
  }

  // Fetch fresh data in the background
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        const responseToCache = response.clone()
        const headers = new Headers(responseToCache.headers)
        headers.set('sw-cache-timestamp', Date.now().toString())
        headers.set('sw-cache-source', 'swr')
        responseToCache.blob().then((body) => {
          const cachedResponse = new Response(body, {
            status: responseToCache.status,
            statusText: responseToCache.statusText,
            headers,
          })
          cache.put(request, cachedResponse)
        })
      }
      return response
    })
    .catch(() => null)

  if (cached) {
    // Return stale immediately, let background fetch update cache
    fetchPromise.catch(() => {}) // swallow unhandled rejection
    return cached
  }

  // No cache: wait for network
  try {
    const response = await fetchPromise
    if (response) return response
  } catch {
    // Network also failed
  }

  return new Response(JSON.stringify({ error: 'Offline', data: null }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  })
}


// ══════════════════════════════════════════════════════════════════════
// Strategy 3: Network First with offline fallback (navigation)
// ══════════════════════════════════════════════════════════════════════
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(NAV_CACHE)
      const headers = new Headers(response.headers)
      headers.set('sw-cache-timestamp', Date.now().toString())
      const body = await response.blob()
      const cachedResponse = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
      cache.put(request, cachedResponse)
      // Return original response (already consumed body, need to re-fetch)
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    }
    return response
  } catch {
    // Try exact match first
    const cached = await caches.match(request)
    if (cached) return cached

    // Check if the cached navigation is still within TTL
    const navCached = await caches.match(request, { cacheName: NAV_CACHE })
    if (navCached) {
      const timestamp = navCached.headers.get('sw-cache-timestamp')
      if (timestamp && (Date.now() - parseInt(timestamp, 10)) < NAV_CACHE_TTL_MS) {
        return navCached
      }
    }

    // Fall back to cached index.html for SPA routing
    const indexHtml = await caches.match('/index.html')
    if (indexHtml) return indexHtml

    // Last resort: offline page
    return new Response(OFFLINE_PAGE, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}


// ══════════════════════════════════════════════════════════════════════
// Strategy 4: Network Only (SSE streams, large binary, mutations)
// ══════════════════════════════════════════════════════════════════════
async function networkOnly(request) {
  try {
    return await fetch(request)
  } catch {
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}


// ── Cache Pruning ────────────────────────────────────────────────────
async function pruneCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return

  // Delete oldest entries first (they're at the start of the keys list)
  const deleteCount = keys.length - maxEntries
  for (let i = 0; i < deleteCount; i++) {
    await cache.delete(keys[i])
  }
}

async function pruneStaleApiEntries() {
  const cache = await caches.open(API_CACHE)
  const keys = await cache.keys()
  const now = Date.now()
  let deleted = 0

  for (const request of keys) {
    const response = await cache.match(request)
    if (!response) continue
    const timestamp = response.headers.get('sw-cache-timestamp')
    if (timestamp) {
      const age = now - parseInt(timestamp, 10)
      if (age > API_CACHE_TTL_MS * 6) {
        // Entry is more than 6x TTL (30 min) — delete it
        await cache.delete(request)
        deleted++
      }
    }
  }
  return deleted
}


// ── Offline page ─────────────────────────────────────────────────────
const OFFLINE_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>离线 — Increa Reader</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           display: flex; justify-content: center; align-items: center;
           min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    .container { text-align: center; padding: 2rem; max-width: 420px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #94a3b8; margin-bottom: 1.5rem; line-height: 1.6; }
    button { background: #3b82f6; color: white; border: none; padding: 0.75rem 1.5rem;
             border-radius: 8px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #2563eb; }
    .details { margin-top: 1rem; font-size: 0.85rem; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📡 无法连接到服务器</h1>
    <p>请检查你的网络连接，然后点击下方按钮重试。</p>
    <button onclick="window.location.reload()">重新加载</button>
    <div class="details" id="details"></div>
  </div>
  <script>
    document.getElementById('details').textContent = '离线时间: ' + new Date().toLocaleString('zh-CN');
  </script>
</body>
</html>`


// ══════════════════════════════════════════════════════════════════════
// Service Worker Lifecycle
// ══════════════════════════════════════════════════════════════════════

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        // Cache APP_SHELL resources — individual failures shouldn't block install
        return Promise.allSettled(
          APP_SHELL.map((url) =>
            cache.add(url).catch((err) => {
              console.warn(`[SW] Failed to cache ${url}:`, err)
            })
          )
        )
      })
      .then(() => {
        // Activate immediately without waiting for existing tabs to close
        self.skipWaiting()
      })
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) =>
            key !== CACHE_NAME &&
            key !== STATIC_CACHE &&
            key !== API_CACHE &&
            key !== FONT_CACHE &&
            key !== NAV_CACHE
          )
          .map((key) => caches.delete(key))
      )
    ).then(() => Promise.all([
      pruneStaleApiEntries(),
      pruneCache(STATIC_CACHE, STATIC_CACHE_MAX_ENTRIES),
      pruneCache(API_CACHE, API_CACHE_MAX_ENTRIES),
      pruneCache(NAV_CACHE, NAV_CACHE_MAX_ENTRIES),
    ])).then(() => {
      // Take control of all clients immediately
      self.clients.claim()
    })
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data && event.data.type === 'PRUNE_CACHES') {
    event.waitUntil(
      Promise.all([
        pruneCache(STATIC_CACHE, STATIC_CACHE_MAX_ENTRIES),
        pruneCache(API_CACHE, API_CACHE_MAX_ENTRIES),
        pruneStaleApiEntries(),
      ])
    )
  }
  if (event.data && event.data.type === 'CLEAR_ALL_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(keys.map((key) => caches.delete(key)))
      ).then(() => self.clients.claim())
    )
  }
})


// ══════════════════════════════════════════════════════════════════════
// Fetch Event — Route Requests to Strategies
// ══════════════════════════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Only handle GET requests
  if (event.request.method !== 'GET') return

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return

  // Skip Vite HMR / dev server
  if (url.pathname.startsWith('/@') || url.pathname.includes('/__vite_hmr')) return

  // Skip range requests (partial content, typically video/audio)
  if (event.request.headers.get('range')) return

  // ── Route: Never-cache API (SSE streams, large binary) ──
  if (NEVER_CACHE_API_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(networkOnly(event.request))
    return
  }

  // ── Route: SWR API data endpoints ──
  if (SWR_API_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(staleWhileRevalidate(event.request))
    return
  }

  // ── Route: Other API calls — Network Only (mutations, dynamic data) ──
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnly(event.request))
    return
  }

  // ── Route: Navigation (HTML pages) ──
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event.request))
    return
  }

  // ── Route: Fonts — cache with long-lived dedicated cache ──
  if (IMMUTABLE_PATTERNS[0].test(url.pathname)) {
    event.respondWith(cacheFirst(event.request, FONT_CACHE))
    return
  }

  // ── Route: Hashed static assets — Cache First (immutable) ──
  if (IMMUTABLE_PATTERNS[1].test(url.pathname)) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE))
    return
  }

  // ── Route: Other static assets — Cache First ──
  event.respondWith(cacheFirst(event.request, STATIC_CACHE))
})


// ── Background Sync ──────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-file-operations') {
    event.waitUntil(replayOfflineOperations())
  }
})

async function replayOfflineOperations() {
  const allClients = await self.clients.matchAll()
  for (const client of allClients) {
    client.postMessage({ type: 'REPLAY_OFFLINE_OPERATIONS' })
  }
}

// ── Push Notification Handler ─────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'Increa Reader', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'default',
      vibrate: data.vibrate || [100, 50, 100],
      data: {
        url: data.url || '/',
      },
    })
  )
})

// ── Notification Click Handler ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      // Open new window
      return self.clients.openWindow(urlToOpen)
    })
  )
})