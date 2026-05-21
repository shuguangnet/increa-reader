/**
 * use-file-drop.ts
 *
 * Monitors file drag-and-drop events on the document and provides:
 *   - `isOver`: whether a drag operation is currently hovering over the app
 *   - `dropHandler`: an event handler for the `drop` event that processes dropped files
 *
 * Supported file formats: .md, .txt, .pdf, .html, .json, .markdown, .org, .rst, .csv, .xml, .yaml, .yml, .toml
 *
 * In Tauri desktop mode, the hook also listens for native Tauri file-drop events
 * (emitted by the Tauri runtime as `tauri://drag-drop`).
 */

import { useCallback, useEffect, useState } from 'react'
import { isDesktop } from '@/lib/platform'

const SUPPORTED_EXTENSIONS = [
  '.md',
  '.markdown',
  '.txt',
  '.pdf',
  '.html',
  '.json',
  '.org',
  '.rst',
  '.csv',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
]

function isSupportedFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return SUPPORTED_EXTENSIONS.some(ext => lower.endsWith(ext))
}

export interface DroppedFile {
  name: string
  path: string
}

export interface UseFileDropResult {
  /** Whether a drag operation is currently hovering over the app window */
  isOver: boolean
  /** Handler to attach to the root element's onDrop event */
  dropHandler: (e: DragEvent) => void
}

/**
 * React hook for handling file drag-and-drop.
 *
 * @param onDropFiles - Callback invoked with the list of supported files that were dropped.
 *                       In Tauri mode, paths are native filesystem paths.
 * @returns `{ isOver, dropHandler }`
 */
export function useFileDrop(onDropFiles: (files: DroppedFile[]) => void): UseFileDropResult {
  const [isOver, setIsOver] = useState(false)

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsOver(false)

      if (!e.dataTransfer) return

      const files: DroppedFile[] = []

      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i]
        if (file && isSupportedFile(file.name)) {
          // In Tauri, the `path` property exists on File objects via the Tauri polyfill
          const filePath = (file as File & { path?: string }).path || file.name
          files.push({ name: file.name, path: filePath })
        }
      }

      if (files.length > 0) {
        onDropFiles(files)
      }
    },
    [onDropFiles],
  )

  useEffect(() => {
    // Native HTML drag events
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer?.types.includes('Files')) {
        setIsOver(true)
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
    }

    const handleDragLeave = (e: DragEvent) => {
      // Only set isOver to false when leaving the document entirely
      if (!e.relatedTarget) {
        setIsOver(false)
      }
    }

    document.addEventListener('dragenter', handleDragEnter)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)

    // Tauri-specific: listen for native drag-drop events
    let unlistenTauriDrop: (() => void) | null = null
    let unlistenTauriOver: (() => void) | null = null
    let unlistenTauriLeave: (() => void) | null = null

    if (isDesktop()) {
      ;(async () => {
        try {
          const { getCurrentWindow } = await import(
            /* @vite-ignore */ '@tauri-apps' + '/api/window'
          )
          const win = getCurrentWindow()

          // Listen for Tauri drag-drop event
          unlistenTauriDrop = await win.listen('tauri://drag-drop', (event: unknown) => {
            setIsOver(false)
            const payload = (event as { payload: { paths: string[] } }).payload
            const files: DroppedFile[] = payload.paths
              .filter((p: string) => isSupportedFile(p))
              .map((p: string) => {
                const name = p.split('/').pop() || p.split('\\').pop() || p
                return { name, path: p }
              })
            if (files.length > 0) {
              onDropFiles(files)
            }
          })

          // Listen for Tauri drag-over (for visual feedback)
          unlistenTauriOver = await win.listen('tauri://drag-over', () => {
            setIsOver(true)
          })

          // Listen for Tauri drag-leave
          unlistenTauriLeave = await win.listen('tauri://drag-leave', () => {
            setIsOver(false)
          })
        } catch (err) {
          console.warn('[use-file-drop] Failed to setup Tauri drag-drop listener:', err)
        }
      })()
    }

    return () => {
      document.removeEventListener('dragenter', handleDragEnter)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
      unlistenTauriDrop?.()
      unlistenTauriOver?.()
      unlistenTauriLeave?.()
    }
  }, [handleDrop, onDropFiles])

  return { isOver, dropHandler: handleDrop }
}
