/**
 * Tauri Desktop Integration
 *
 * This module bridges the Tauri desktop runtime with the web frontend.
 * It handles:
 * - Python backend lifecycle (start/stop)
 * - Server URL configuration (auto-detect port)
 * - Folder selection dialog
 * - Graceful shutdown
 */

import { invoke } from '@tauri-apps/api/core'

export interface ServerInfo {
  running: boolean
  port: number | null
  pid: number | null
}

/** Check if running inside Tauri desktop */
export function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

/** Start the Python backend (desktop only) */
export async function startServer(): Promise<ServerInfo> {
  if (!isTauri()) throw new Error('Not running in Tauri')
  return invoke<ServerInfo>('start_server')
}

/** Stop the Python backend (desktop only) */
export async function stopServer(): Promise<ServerInfo> {
  if (!isTauri()) throw new Error('Not running in Tauri')
  return invoke<ServerInfo>('stop_server')
}

/** Get Python backend status (desktop only) */
export async function getServerStatus(): Promise<ServerInfo> {
  if (!isTauri()) throw new Error('Not running in Tauri')
  return invoke<ServerInfo>('get_server_status')
}

/** Open folder selection dialog (desktop only) */
export async function openFolderDialog(title = '选择知识库目录'): Promise<string | null> {
  if (!isTauri()) throw new Error('Not running in Tauri')
  return invoke<string | null>('open_folder_dialog', { title })
}

/**
 * Get the API base URL.
 * - Web mode: relative URL (proxied by Vite)
 * - Desktop mode: http://127.0.0.1:PORT
 */
export function getApiBaseUrl(): string {
  if (isTauri()) {
    // In desktop mode, connect to local Python backend
    const port = localStorage.getItem('increa-server-port') || '3002'
    return `http://127.0.0.1:${port}`
  }
  // Web mode — use relative URL
  return ''
}

/**
 * Initialize desktop environment.
 * Starts the Python backend and configures API URL.
 * Safe to call in web mode — returns immediately.
 */
export async function initDesktop(): Promise<void> {
  if (!isTauri()) return

  try {
    const status = await startServer()
    if (status.running && status.port) {
      localStorage.setItem('increa-server-port', status.port.toString())
      console.log(`[Tauri] Python server started on port ${status.port}`)
    }
  } catch (e) {
    console.error('[Tauri] Failed to start Python server:', e)
  }

  // Register cleanup on window close
  window.addEventListener('beforeunload', async () => {
    try {
      await stopServer()
    } catch {
      // Ignore errors during shutdown
    }
  })
}