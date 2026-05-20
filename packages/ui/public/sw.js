/// <reference lib="webworker" />

// ══════════════════════════════════════════════════════════════════════
// Increa Reader — Service Worker v4
//
// Cache strategies:
//   1. Static assets (JS/CSS/images) → Cache First (fast load, bg revalidate)
//   2. API data (tree, config, tags) → Stale-While-Revalidate (instant + fresh)
//   3. API streaming (chat/query SSE) → Network Only (never cache)
//   4. Navigation (HTML pages)      → Network First + offline fallback
//   5. Fonts & icons                → Cache First (immutable, long TTL)
// ══════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'v4'
const CACHE_NAME = `increa-reader-${CACHE_VERSION}`
const STATIC_CACHE = `increa-static-${CACHE_VERSION}`
const API_CACHE = `increa-api-${CACHE_VERSION}`
const FONT_CACHE = `increa-fonts-${CACHE_VERSION}`

// ── Config ──────────────────────────────────────────────────────────
const API_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const API_CACHE_MAX_ENTRIES = 100
const STATIC_CACHE_MAX_ENTRIES = 300

// Pre-cache App Shell on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
]

// API paths that use Stale-While-Revalidate
const SWR_API_PATTERNS = [
  /\/api\/workspace\/tree$/,
  /\/api\/workspace\/repos$/,
  /\/api\/tags$/,
  /\/api\/config\/api-settings$/,
]

// API paths that should NEVER be cached (streams, mutations)
const NEVER_CACHE_API_PATTERNS = [
  /\/api\/chat\/query/,      // SSE streaming endpoint
  /\/api\/pdf\/page-render/, // Large binary responses
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
  if (cached) return cached

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

  // Fetch fresh data in the background
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        // Clone before putting — response can only be consumed once
        const responseToCache = response.clone()
        const headers = new Headers(responseToCache.headers)
        headers.set('sw-cache-timestamp', Date.now().toString())
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
    // (Don't await fetchPromise — it runs in background)
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
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // Try exact match first
    const cached = await caches.match(request)
    if (cached) return cached

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

  for (const request of keys) {
    const response = await cache.match(request)
    if (!response) continue
    const timestamp = response.headers.get('sw-cache-timestamp')
    if (timestamp) {
      const age = now - parseInt(timestamp, 10)
      if (age > API_CACHE_TTL_MS * 2) {
        // Entry is more than 2x TTL — delete it
        await cache.delete(request)
      }
    }
  }
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
  </style>
</head>
<body>
  <div class="container">
    <h1>📡 无法连接到服务器</h1>
    <p>请检查你的网络连接，然后点击下方按钮重试。</p>
    <button onclick="window.location.reload()">重新加载</button>
  </div>
</body>
</html>`


// ══════════════════════════════════════════════════════════════════════
// Service Worker Lifecycle
// ══════════════════════════════════════════════════════════════════════

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)),
  )
  // Activate immediately without waiting for existing tabs to close
  self.skipWaiting()
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
            key !== FONT_CACHE
          )
          .map((key) => caches.delete(key)),
      ),
    ).then(() => pruneStaleApiEntries()),
  )
  // Take control of all clients immediately
  self.clients.claim()
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
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


// ── Periodic cache cleanup (via message trigger or idle) ──────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PRUNE_CACHES') {
    event.waitUntil(
      Promise.all([
        pruneCache(STATIC_CACHE, STATIC_CACHE_MAX_ENTRIES),
        pruneCache(API_CACHE, API_CACHE_MAX_ENTRIES),
        pruneStaleApiEntries(),
      ]),
    )
  }
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
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      tag: data.tag || 'default',
    }),
  )
})