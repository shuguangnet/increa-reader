import { useCallback, useEffect, useRef, useState } from 'react'

type SWUpdateStatus = 'idle' | 'update-available' | 'updating'

const APP_VERSION_KEY = 'app-version'

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
        localStorage.setItem(APP_VERSION_KEY, 'v3')
      } catch {
        // ignore
      }
      setAppVersion('v3')
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
    const cache = await caches.open('increa-reader-v3')
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