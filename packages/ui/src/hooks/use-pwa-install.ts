import { useCallback, useEffect, useRef, useState } from 'react'
import { isStandalonePWA } from './use-pwa'

const DISMISS_KEY = 'pwa-install-dismissed'
const THANKS_DURATION = 5000

/**
 * Detect if running on iOS Safari (where beforeinstallprompt doesn't fire)
 */
function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) && ua.indexOf('CriOS') === -1 && ua.indexOf('FxiOS') === -1
}

/**
 * Hook to handle PWA install prompt.
 * Returns install function, installability, and iOS-specific guidance.
 */
export function usePWAInstall() {
  const [installable, setInstallable] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [showThanks, setShowThanks] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem(DISMISS_KEY) === 'true'
    } catch {
      return false
    }
  })
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

    // If install was completed
    const installedHandler = () => {
      setInstallable(false)
      setShowIOSGuide(false)
      deferredPromptRef.current = null
      setShowThanks(true)
      // Auto-dismiss thanks message
      setTimeout(() => setShowThanks(false), THANKS_DURATION)
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
    const outcome = await prompt.userChoice
    deferredPromptRef.current = null
    setInstallable(false)
    return outcome.outcome === 'accepted'
  }, [])

  const showIOSInstallGuide = useCallback(() => {
    setShowIOSGuide(true)
  }, [])

  const dismissIOSGuide = useCallback(() => {
    setShowIOSGuide(false)
  }, [])

  const dismissPermanently = useCallback(() => {
    setDismissed(true)
    setInstallable(false)
    setShowIOSGuide(false)
    try {
      localStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      // localStorage unavailable
    }
  }, [])

  const dismissThanks = useCallback(() => {
    setShowThanks(false)
  }, [])

  // Derive whether we should show the install prompt
  const shouldShowInstall = !dismissed && !isStandalonePWA() && (installable || isIOSSafari())
  const isIOS = isIOSSafari()

  return {
    installable,
    install,
    isStandalone: isStandalonePWA(),
    shouldShowInstall,
    isIOS,
    showIOSGuide,
    showIOSInstallGuide,
    dismissIOSGuide,
    dismissed,
    dismissPermanently,
    showThanks,
    dismissThanks,
  }
}

/**
 * Extended type for BeforeInstallPromptEvent
 */
type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}