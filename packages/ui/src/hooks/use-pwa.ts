import { useCallback, useEffect, useRef, useState } from 'react'

type SWUpdateStatus = 'idle' | 'update-available' | 'updating'

const APP_VERSION_KEY = 'app-version'
const CACHE_VERSION = 'v7'

/**
 * Get the current app version from the build or SW cache.
 */
function getAppVersion(): string {
  if (typeof window === 'undefined') return '1.0.0'
  try {
    return localStorage.getItem(APP_VERSION_KEY) || '1.0.0'
  } catch {
    return '1.0.0'
  }
}

/**
 * Register the service worker for PWA offline support.
 * Called once on app mount.
 * Returns update status, apply/dismiss functions, and app version.
 */
export function useServiceWorkerUpdate() {
  const [updateStatus, setUpdateStatus] = useState<SWUpdateStatus>('idle')
  const [appVersion, setAppVersion] = useState(getAppVersion)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          registrationRef.current = reg

          // Check for updates on load
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing
            if (!newWorker) return
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available!
                setUpdateStatus('update-available')
              }
            })
          })

          // Also check if there's already a waiting worker
          if (reg.waiting && navigator.serviceWorker.controller) {
            setUpdateStatus('update-available')
          }

          // Periodic update check (every 60 minutes)
          const interval = setInterval(() => {
            reg.update().catch(() => {
              // Update check failed, ignore
            })
          }, 60 * 60 * 1000)

          // Trigger cache pruning on registration to keep caches tidy
          if (reg.active) {
            reg.active.postMessage({ type: 'PRUNE_CACHES' })
          }

          return () => clearInterval(interval)
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err)
        })
    })
  }, [])

  const applyUpdate = useCallback(() => {
    const reg = registrationRef.current
    if (!reg || !reg.waiting) return

    setUpdateStatus('updating')

    // Tell the waiting service worker to skip waiting and become active
    reg.waiting.postMessage({ type: 'SKIP_WAITING' })

    // Listen for the controller change and reload
    const onControllerChange = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      // Update stored version
      try {
        localStorage.setItem(APP_VERSION_KEY, CACHE_VERSION)
      } catch {
        // ignore
      }
      setAppVersion(CACHE_VERSION)
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
  }, [])

  const dismissUpdate = useCallback(() => {
    setUpdateStatus('idle')
  }, [])

  return { updateStatus, applyUpdate, dismissUpdate, appVersion }
}

/**
 * Register the service worker for PWA offline support.
 * Called once on app mount. (Legacy API, use useServiceWorkerUpdate for update features)
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Handle updates
        reg.addEventListener('updatefound', () => {
          // no-op
        })

        // Prune caches on registration
        if (reg.active) {
          reg.active.postMessage({ type: 'PRUNE_CACHES' })
        }
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

/**
 * Clear all service worker caches. Useful for troubleshooting
 * or when a major version change requires a clean slate.
 */
export async function clearAllCaches(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  if (reg?.active) {
    reg.active.postMessage({ type: 'CLEAR_ALL_CACHES' })
  }

  // Also clear localStorage version to force re-cache
  try {
    localStorage.removeItem(APP_VERSION_KEY)
  } catch {
    // ignore
  }
}

/**
 * Hook to listen for online/offline status changes from the service worker.
 * Returns the current online status and listens for SW messages.
 *
 * The SW posts SW_ONLINE / SW_OFFLINE messages when connectivity changes.
 * This hook also listens to the browser's native online/offline events
 * for immediate feedback.
 */
export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof window === 'undefined') return true
    return navigator.onLine
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Listen to native browser events for immediate feedback
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Also listen for SW connectivity messages (more reliable in some scenarios)
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_ONLINE') {
        setIsOnline(true)
      } else if (event.data?.type === 'SW_OFFLINE') {
        setIsOnline(false)
      }
    }

    navigator.serviceWorker?.addEventListener('message', handleSWMessage)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage)
    }
  }, [])

  return { isOnline }
}

/**
 * Read shared data from PWA share_target.
 * Call this on app startup to check if content was shared into the app.
 */
export async function readShareData(): Promise<{
  text: string
  url: string
  title: string
  files: number
  timestamp: number
} | null> {
  if (typeof window === 'undefined') return null
  try {
    const cache = await caches.open(`increa-api-${CACHE_VERSION}`)
    const response = await cache.match('/__share_data__')
    if (!response) return null
    const data = await response.json()
    // Consume the share data (one-time read)
    await cache.delete('/__share_data__')
    return data
  } catch {
    return null
  }
}