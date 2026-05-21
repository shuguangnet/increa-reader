/**
 * Tauri Desktop Integration — Entry Point
 *
 * This module is the desktop-specific bootstrap that re-exports the unified
 * platform abstraction layer and provides a convenience wrapper for
 * initialising the Tauri desktop environment.
 *
 * IMPORTANT: Import from this module ONLY in desktop entry files
 * (e.g. desktop/main.ts). The rest of the app should import from
 * `@/lib/platform` which works in all environments (web, desktop, PWA).
 *
 * This module does NOT statically import @tauri-apps/api — all Tauri calls
 * go through the dynamic-loader pattern in platform.ts, keeping the web
 * build free of Tauri SDK code.
 */

// Re-export everything from the unified platform layer.
// Consumers can `import { platform, isTauri } from './tauri'` and it
// just works, delegating to the platform abstraction.
export {
  platform,
  isTauri,
  isDesktop,
  isWeb,
  isMobile,
  isPWA,
  getPlatformType,
  getApiBase,
  setServerPort,
  getCapabilities,
  startServer,
  stopServer,
  getServerStatus,
  openFolderDialog,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  setWindowTitle,
  initPlatform,
  type PlatformType,
  type PlatformCapabilities,
  type ServerInfo,
} from '@/lib/platform'
import { platform } from '@/lib/platform'

/**
 * Convenience helper for desktop entry points.
 *
 * Calls `initPlatform()` which, in Tauri mode:
 *  1. Starts the Python backend
 *  2. Persists the discovered port to localStorage
 *  3. Registers graceful-shutdown hooks
 *
 * In web/PWA mode this is a no-op, so it's safe to call unconditionally.
 */
export async function initDesktop(): Promise<void> {
  await platform.init()
}
