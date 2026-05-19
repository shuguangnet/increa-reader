/**
 * Increa Reader — Desktop (Tauri) Entry Point
 *
 * This is the main entry point for the desktop build.
 * It initialises the Tauri platform layer first, then renders
 * the same React app as the web version.
 *
 * In Tauri mode:
 *  - The Python backend is auto-started
 *  - API base URL is configured to http://127.0.0.1:PORT
 *  - Window controls (minimize/maximize/close) are native
 *
 * In web mode this degrades gracefully (initPlatform is a no-op).
 */

import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from '../../ui/src/app/app.tsx'
import { initPlatform } from './tauri'
import '../../ui/src/style.css'

// Initialise the platform layer (start Python backend in Tauri, no-op on web)
initPlatform().catch((err) => {
  console.error('[desktop] Platform init failed:', err)
})

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)