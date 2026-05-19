/**
 * use-window-restore.ts
 *
 * Persists window position and size (x, y, width, height, maximized) to localStorage,
 * and restores them on mount. Only active when running in Tauri desktop mode.
 *
 * The hook also saves bounds periodically as a safety net so the position is
 * remembered across app restarts.
 */

import { useEffect } from 'react'
import { isDesktop } from '@/lib/platform'

const WINDOW_BOUNDS_KEY = 'increa-window-bounds'

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

/**
 * Persist the current window position/size to localStorage.
 * Called automatically on interval and beforeunload.
 */
export async function saveWindowBounds(): Promise<void> {
  if (!isDesktop()) return

  try {
    // @ts-expect-error — optional peer dependency, not present in web builds
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()

    const position = await win.outerPosition()
    const size = await win.innerSize()
    const maximized = await win.isMaximized()

    const bounds: WindowBounds = {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
      maximized,
    }

    localStorage.setItem(WINDOW_BOUNDS_KEY, JSON.stringify(bounds))
  } catch (e) {
    console.warn('[use-window-restore] Failed to save window bounds:', e)
  }
}

/**
 * Restore window position/size from localStorage.
 * Called automatically on mount in Tauri desktop mode.
 */
export async function restoreWindowBounds(): Promise<void> {
  if (!isDesktop()) return

  try {
    const raw = localStorage.getItem(WINDOW_BOUNDS_KEY)
    if (!raw) return

    const bounds: WindowBounds = JSON.parse(raw)

    // Validate the parsed data
    if (
      typeof bounds.x !== 'number' ||
      typeof bounds.y !== 'number' ||
      typeof bounds.width !== 'number' ||
      typeof bounds.height !== 'number'
    ) {
      return
    }

    // @ts-expect-error — optional peer dependency, not present in web builds
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    // @ts-expect-error — optional peer dependency, not present in web builds
    const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi')
    const win = getCurrentWindow()

    if (bounds.maximized) {
      await win.maximize()
    } else {
      await win.setPosition(new LogicalPosition(bounds.x, bounds.y))
      await win.setSize(new LogicalSize(bounds.width, bounds.height))
    }
  } catch (e) {
    console.warn('[use-window-restore] Failed to restore window bounds:', e)
  }
}

/**
 * React hook that restores window position on mount and saves on unload.
 * Only functional in Tauri desktop mode; no-op on the web.
 */
export function useWindowRestore() {
  useEffect(() => {
    if (!isDesktop()) return

    // Restore position on mount
    restoreWindowBounds().catch(() => {})

    // Periodically save bounds (every 5 seconds) as a safety net
    const interval = setInterval(() => {
      saveWindowBounds().catch(() => {})
    }, 5000)

    return () => {
      clearInterval(interval)
      // Final save on unmount
      saveWindowBounds().catch(() => {})
    }
  }, [])
}