/**
 * Register the service worker for PWA offline support.
 * Called once on app mount.
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[PWA] Service Worker registered, scope:', reg.scope)

        // Handle updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              console.log('[PWA] New service worker activated, refresh for updates')
            }
          })
        })
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err)
      })
  })
}

/**
 * Check if the app is running as an installed PWA (standalone mode).
 */
export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone: boolean }).standalone === true
  )
}