import { useCallback, useEffect, useRef, useState } from 'react'
import { isStandalonePWA } from './use-pwa'

/**
 * Hook to handle PWA install prompt.
 * Returns install function and whether the app is installable.
 */
export function usePWAInstall() {
  const [installable, setInstallable] = useState(false)
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Already installed as PWA
    if (isStandalonePWA()) return

    const handler = (e: Event) => {
      e.preventDefault()
      deferredPromptRef.current = e as BeforeInstallPromptEvent
      setInstallable(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // If install was completed or dismissed
    const installedHandler = () => {
      setInstallable(false)
      deferredPromptRef.current = null
    }
    window.addEventListener('appinstalled', installedHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  const install = useCallback(async () => {
    const prompt = deferredPromptRef.current
    if (!prompt) return false
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    deferredPromptRef.current = null
    setInstallable(false)
    return outcome === 'accepted'
  }, [])

  return { installable, install, isStandalone: isStandalonePWA() }
}

/**
 * Extended type for BeforeInstallPromptEvent
 */
type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}