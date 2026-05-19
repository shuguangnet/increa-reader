import { useCallback, useEffect, useRef, useState } from 'react'

type SWUpdateStatus = 'idle' | 'update-available' | 'updating'

/**
 * Register the service worker for PWA offline support.
 * Called once on app mount.
 * Returns update status and a function to apply the update.
 */
export function useServiceWorkerUpdate() {
  const [updateStatus, setUpdateStatus] = useState<SWUpdateStatus>('idle')
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service Worker registered, scope:', reg.scope)
          registrationRef.current = reg

          // Check for updates on load
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing
            if (!newWorker) return
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available!
                console.log('[PWA] New version available')
                setUpdateStatus('update-available')
              }
            })
          })

          // Also check if there's already a waiting worker
          if (reg.waiting && navigator.serviceWorker.controller) {
            setUpdateStatus('update-available')
          }
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
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
  }, [])

  const dismissUpdate = useCallback(() => {
    setUpdateStatus('idle')
  }, [])

  return { updateStatus, applyUpdate, dismissUpdate }
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