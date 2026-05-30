import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/app.tsx'
import { registerServiceWorker } from './hooks/use-pwa'
import { initSentry } from './lib/sentry'
import './style.css'

// Initialize Sentry error tracking (no-op if VITE_SENTRY_DSN is not set)
initSentry()

// Register PWA service worker for offline support
registerServiceWorker()

// NOTE: StrictMode is temporarily disabled because Zustand persist middleware
// with React 19's useSyncExternalStore causes an infinite re-render loop.
// The getSnapshot result must be cached, but Zustand's persist hydration
// creates new object references on each call in StrictMode.
// TODO: Re-enable StrictMode after migrating to skipHydration pattern.
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
