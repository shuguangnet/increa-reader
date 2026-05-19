/**
 * Increa Reader — Unified Platform Abstraction Layer
 *
 * Provides a singleton `platform` object that detects the runtime environment
 * and bridges native capabilities (Tauri desktop, Web, PWA) behind a single interface.
 *
 * Design constraints:
 * - Zero dependencies — no Tauri SDK imports at module level
 * - Tauri APIs are loaded via dynamic `import('@tauri-apps/api/core')` only when needed
 * - Web/PWA mode completely skips Tauri code paths (no errors, no side-effects)
 * - Import { platform } from '@/lib/platform' and you're done
 */

// ---------------------------------------------------------------------------
// Platform type & capabilities
// ---------------------------------------------------------------------------

export type PlatformType = 'desktop' | 'mobile' | 'web'

export interface PlatformCapabilities {
  /** File system access (native on Tauri, limited on Web) */
  supportsFS: boolean
  /** System tray icon */
  supportsTray: boolean
  /** Push / system-level notifications */
  supportsNotifications: boolean
  /** Native folder-picker dialog */
  supportsFolderPicker: boolean
  /** Native window controls (minimize / maximize / close / setTitle) */
  supportsWindowControls: boolean
  /** Can start / stop a local server process */
  supportsServerControl: boolean
  /** Can install as a PWA */
  supportsPWA: boolean
  /** Clipboard access beyond navigator.clipboard */
  supportsClipboard: boolean
}

// ---------------------------------------------------------------------------
// Server info (mirrors Tauri rpc type)
// ---------------------------------------------------------------------------

export interface ServerInfo {
  running: boolean
  port: number | null
  pid: number | null
}

// ---------------------------------------------------------------------------
// Internal: type-safe dynamic Tauri invoke
// ---------------------------------------------------------------------------

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

let _tauriInvoke: TauriInvoke | null = null

/**
 * Dynamically load the Tauri `invoke` function.
 * Uses `new Function` to completely hide the import from Vite's static
 * analysis — @tauri-apps/api is an optional peer dependency only present
 * in desktop builds.  The import() is only executed when running in Tauri.
 */
async function loadTauriInvoke(): Promise<TauriInvoke> {
  if (_tauriInvoke) return _tauriInvoke
  // Use new Function to prevent Vite from resolving @tauri-apps at build time
  const dynamicImport = new Function('modulePath', 'return import(modulePath)')
  const mod = await dynamicImport('@tauri-apps/api/core')
  _tauriInvoke = mod.invoke as TauriInvoke
  return _tauriInvoke
}

/**
 * Dynamically load the Tauri getCurrentWindow helper.
 * Same new Function trick — Vite cannot see the import path.
 */
async function loadTauriWindow(): Promise<any> {
  const dynamicImport = new Function('modulePath', 'return import(modulePath)')
  const mod = await dynamicImport('@tauri-apps/api/window')
  return mod.getCurrentWindow()
}

// ---------------------------------------------------------------------------
// Platform detection (evaluated once at import time)
// ---------------------------------------------------------------------------

const _hasWindow = typeof window !== 'undefined'
const _hasTauri = _hasWindow && !!(window as any).__TAURI_INTERNALS__
const _hasNavigator = typeof navigator !== 'undefined'

/** True when running inside the Tauri desktop shell */
export const isTauri = (): boolean => _hasTauri

/** True when the user-agent indicates a mobile device */
export const isMobile = (): boolean =>
  _hasNavigator && /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)

/** True when the app is running as an installed PWA (detected via display-mode or standalone) */
export const isPWA = (): boolean =>
  _hasWindow &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true)

/** True when running as a desktop application (Tauri) */
export const isDesktop = (): boolean => _hasTauri

/** True when running in a regular web browser (not Tauri, not PWA) */
export const isWeb = (): boolean => _hasWindow && !_hasTauri && !isPWA()

/** Returns the coarse platform category */
export function getPlatformType(): PlatformType {
  if (isTauri()) return 'desktop'
  if (isMobile()) return 'mobile'
  return 'web'
}

// ---------------------------------------------------------------------------
// API base URL
// ---------------------------------------------------------------------------

const SERVER_PORT_KEY = 'increa-server-port'
const DEFAULT_PORT = '3002'

/**
 * Get the API base URL.
 * - Tauri desktop → `http://127.0.0.1:PORT` (port from localStorage or default)
 * - Web / PWA → `''` (relative URL, proxied by Vite / reverse-proxy)
 */
export function getApiBase(): string {
  if (_hasTauri) {
    const port = _hasWindow ? localStorage.getItem(SERVER_PORT_KEY) || DEFAULT_PORT : DEFAULT_PORT
    return `http://127.0.0.1:${port}`
  }
  return ''
}

/** Persist a discovered server port (Tauri desktop only). */
export function setServerPort(port: number): void {
  if (_hasWindow) {
    localStorage.setItem(SERVER_PORT_KEY, String(port))
  }
}

// ---------------------------------------------------------------------------
// Platform capabilities (lazy-computed)
// ---------------------------------------------------------------------------

let _caps: PlatformCapabilities | null = null

export function getCapabilities(): PlatformCapabilities {
  if (_caps) return _caps
  const tauri = isTauri()
  _caps = {
    supportsFS: tauri,
    supportsTray: tauri,
    supportsNotifications: tauri || (_hasWindow && 'Notification' in window),
    supportsFolderPicker: tauri,
    supportsWindowControls: tauri,
    supportsServerControl: tauri,
    supportsPWA: _hasWindow && 'serviceWorker' in navigator,
    supportsClipboard: _hasNavigator && !!(navigator as any).clipboard,
  }
  return _caps
}

// ---------------------------------------------------------------------------
// Native function bridges
// ---------------------------------------------------------------------------

/**
 * Open a native folder-picker dialog.
 * - Tauri: uses the `open_folder_dialog` command
 * - Web: returns null (no native picker available)
 */
export async function openFolderDialog(title = '选择知识库目录'): Promise<string | null> {
  if (!_hasTauri) return null
  const invoke = await loadTauriInvoke()
  return invoke<string | null>('open_folder_dialog', { title })
}

/**
 * Start the Python backend server (Tauri desktop only).
 * On web this is a no-op that returns a stopped ServerInfo.
 */
export async function startServer(): Promise<ServerInfo> {
  if (!_hasTauri) return { running: false, port: null, pid: null }
  const invoke = await loadTauriInvoke()
  return invoke<ServerInfo>('start_server')
}

/**
 * Stop the Python backend server (Tauri desktop only).
 * On web this is a no-op that returns a stopped ServerInfo.
 */
export async function stopServer(): Promise<ServerInfo> {
  if (!_hasTauri) return { running: false, port: null, pid: null }
  const invoke = await loadTauriInvoke()
  return invoke<ServerInfo>('stop_server')
}

/**
 * Get the Python backend server status (Tauri desktop only).
 * On web returns a stub indicating no local server.
 */
export async function getServerStatus(): Promise<ServerInfo> {
  if (!_hasTauri) return { running: false, port: null, pid: null }
  const invoke = await loadTauriInvoke()
  return invoke<ServerInfo>('get_server_status')
}

// ---------------------------------------------------------------------------
// Window controls (Tauri desktop only)
// ---------------------------------------------------------------------------

interface TauriWindow {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  setTitle(title: string): Promise<void>
}

async function _getCurrentWindow(): Promise<TauriWindow | null> {
  if (!_hasTauri) return null
  try {
    const win = await loadTauriWindow()
    return win as TauriWindow
  } catch {
    return null
  }
}

/** Minimize the application window. No-op on Web. */
export async function minimizeWindow(): Promise<void> {
  const win = await _getCurrentWindow()
  await win?.minimize()
}

/** Toggle maximize / restore the application window. No-op on Web. */
export async function toggleMaximizeWindow(): Promise<void> {
  const win = await _getCurrentWindow()
  await win?.toggleMaximize()
}

/** Close the application window. No-op on Web. */
export async function closeWindow(): Promise<void> {
  const win = await _getCurrentWindow()
  await win?.close()
}

/** Set the window title. No-op on Web. */
export async function setWindowTitle(title: string): Promise<void> {
  const win = await _getCurrentWindow()
  await win?.setTitle(title)
}

// ---------------------------------------------------------------------------
// File drop events (Tauri desktop only)
// ---------------------------------------------------------------------------

type FileDropCallback = (paths: string[]) => void
type UnlistenFn = () => void

/**
 * Listen for Tauri native file-drop events.
 * The callback receives an array of file paths when files are dropped onto the window.
 * Returns an unsubscribe function. No-op on Web.
 */
export async function onFileDrop(callback: FileDropCallback): Promise<UnlistenFn> {
  if (!_hasTauri) return () => {}
  try {
    const { getCurrentWindow } = await import(/* @vite-ignore */ '@tauri-apps' + '/api/window')
    const win = getCurrentWindow()
    const unlisten = await win.listen('tauri://drag-drop', (event: { payload: { paths: string[] } }) => {
      callback(event.payload.paths)
    })
    return unlisten
  } catch {
    return () => {}
  }
}

// ---------------------------------------------------------------------------
// Native menu events (Tauri desktop only)
// ---------------------------------------------------------------------------

type MenuActionCallback = (action: string) => void

/**
 * Listen for native menu action events from the Tauri menu bar or tray.
 * The callback receives the menu item id (e.g. "open-repo", "toggle-sidebar").
 * Returns an unsubscribe function. No-op on Web.
 */
export async function onMenuAction(callback: MenuActionCallback): Promise<UnlistenFn> {
  if (!_hasTauri) return () => {}
  try {
    const { getCurrentWindow } = await import(/* @vite-ignore */ '@tauri-apps' + '/api/window')
    const win = getCurrentWindow()
    const unlisten = await win.listen('menu-action', (event: { payload: string }) => {
      callback(event.payload)
    })
    return unlisten
  } catch {
    return () => {}
  }
}

// ---------------------------------------------------------------------------
// Window bounds persistence
// ---------------------------------------------------------------------------

const WINDOW_BOUNDS_KEY = 'increa-window-bounds'

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

/**
 * Save the current window position and size to localStorage.
 * Only functional in Tauri desktop mode. No-op on Web.
 */
export async function saveWindowBounds(): Promise<void> {
  if (!_hasTauri) return
  try {
    const { getCurrentWindow } = await import(/* @vite-ignore */ '@tauri-apps' + '/api/window')
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
    if (_hasWindow) {
      localStorage.setItem(WINDOW_BOUNDS_KEY, JSON.stringify(bounds))
    }
  } catch (e) {
    console.warn('[platform] Failed to save window bounds:', e)
  }
}

/**
 * Restore the saved window position and size from localStorage.
 * Only functional in Tauri desktop mode. No-op on Web.
 */
export async function restoreWindowBounds(): Promise<void> {
  if (!_hasTauri) return
  try {
    if (!_hasWindow) return
    const raw = localStorage.getItem(WINDOW_BOUNDS_KEY)
    if (!raw) return
    const bounds: WindowBounds = JSON.parse(raw)
    if (
      typeof bounds.x !== 'number' ||
      typeof bounds.y !== 'number' ||
      typeof bounds.width !== 'number' ||
      typeof bounds.height !== 'number'
    ) {
      return
    }
    const { getCurrentWindow } = await import(/* @vite-ignore */ '@tauri-apps' + '/api/window')
    const { LogicalPosition, LogicalSize } = await import(/* @vite-ignore */ '@tauri-apps' + '/api/dpi')
    const win = getCurrentWindow()
    if (bounds.maximized) {
      await win.maximize()
    } else {
      await win.setPosition(new LogicalPosition(bounds.x, bounds.y))
      await win.setSize(new LogicalSize(bounds.width, bounds.height))
    }
  } catch (e) {
    console.warn('[platform] Failed to restore window bounds:', e)
  }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

let _initialised = false

/**
 * Initialise the platform layer.
 *
 * In Tauri mode this starts the local Python server, persists the port,
 * and registers cleanup on window close.
 * In Web / PWA mode this is a safe no-op.
 *
 * Call once at app bootstrap (e.g. in `main.tsx` or a layout effect).
 */
export async function initPlatform(): Promise<void> {
  if (_initialised) return
  _initialised = true

  if (!_hasTauri) return

  try {
    const status = await startServer()
    if (status.running && status.port) {
      setServerPort(status.port)
      console.log(`[platform] Tauri backend started on port ${status.port}`)
    }
  } catch (e) {
    console.error('[platform] Failed to start Tauri backend:', e)
  }

  // Restore window position and size
  restoreWindowBounds().catch(() => {})

  // Graceful shutdown
  if (_hasWindow) {
    window.addEventListener('beforeunload', async () => {
      try {
        await stopServer()
      } catch {
        // Ignore errors during shutdown
      }
    })

    // Save window bounds on close
    window.addEventListener('beforeunload', () => {
      // Synchronous attempt to trigger async save
      saveWindowBounds().catch(() => {})
    })
  }
}

// ---------------------------------------------------------------------------
// Singleton facade — the preferred import for consumers
// ---------------------------------------------------------------------------

export const platform = {
  // Detection
  isTauri,
  isPWA,
  isMobile,
  isDesktop,
  isWeb,
  get type(): PlatformType {
    return getPlatformType()
  },

  // Capabilities
  get caps(): PlatformCapabilities {
    return getCapabilities()
  },

  // API
  getApiBase,
  setServerPort,

  // Server lifecycle
  startServer,
  stopServer,
  getServerStatus,

  // Native dialogs
  openFolderDialog,

  // Window controls
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  setWindowTitle,

  // Window bounds persistence
  saveWindowBounds,
  restoreWindowBounds,

  // Native events
  onFileDrop,
  onMenuAction,

  // Init
  init: initPlatform,
} as const