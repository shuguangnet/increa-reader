import { useEffect } from 'react'
import {
  init,
  reactRouterV7BrowserTracingIntegration,
  captureException,
  captureMessage,
  setTag,
  setUser,
} from '@sentry/react'
import { useLocation, useNavigationType, createRoutesFromChildren, matchRoutes } from 'react-router-dom'

// Sentry DSN — set via environment variable
// In development, Sentry is disabled unless VITE_SENTRY_DSN is explicitly set
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
const IS_PROD = import.meta.env.PROD
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'unknown'

/**
 * Initialize Sentry error tracking.
 * Call this once in the app entry point (main.tsx).
 *
 * Environment variables:
 * - VITE_SENTRY_DSN: Sentry DSN (required for production)
 * - VITE_APP_VERSION: App version for release tracking
 * - VITE_SENTRY_ENVIRONMENT: Environment name (defaults to 'production'/'development')
 */
export function initSentry() {
  if (!SENTRY_DSN && IS_PROD) {
    console.warn('[Sentry] DSN not configured. Error tracking disabled.')
    return
  }

  // Skip in development unless explicitly enabled
  if (!SENTRY_DSN && !IS_PROD) return

  init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? (IS_PROD ? 'production' : 'development'),
    release: APP_VERSION,

    integrations: [
      reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],

    // Performance monitoring
    tracesSampleRate: IS_PROD ? 0.1 : 1.0, // 10% in prod, 100% in dev

    // Session replay (optional — enable via env)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.VITE_SENTRY_REPLAY === 'true' ? 1.0 : 0,

    // Don't send errors in development
    enabled: IS_PROD || !!SENTRY_DSN,

    // Filter out common non-actionable errors
    beforeSend(event) {
      // Ignore browser extension errors
      if (event.exception?.values?.[0]?.stacktrace?.frames?.some(
        f => f.filename?.includes('extension://') || f.filename?.includes('chrome-extension://')
      )) {
        return null
      }

      // Ignore ResizeObserver loop errors (benign)
      if (event.exception?.values?.[0]?.value?.includes('ResizeObserver loop')) {
        return null
      }

      // Ignore network errors that are expected (offline, timeout)
      if (event.exception?.values?.[0]?.type === 'NetworkError') {
        return null
      }

      return event
    },
  })
}

/**
 * Set user context for error tracking.
 * Call when user logs in or user info changes.
 */
export function setSentryUser(user: { id: string; email?: string; username?: string } | null) {
  setUser(user)
}

/**
 * Set custom tags for error tracking.
 */
export function setSentryTag(key: string, value: string) {
  setTag(key, value)
}

/**
 * Manually capture an error.
 */
export function captureError(error: Error, context?: Record<string, unknown>) {
  captureException(error, { extra: context })
}

/**
 * Manually capture a message (info/warning).
 */
export function captureMessageEvent(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  captureMessage(message, { level })
}
