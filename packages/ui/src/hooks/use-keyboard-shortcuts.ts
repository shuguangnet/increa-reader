import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui-store'

export function useKeyboardShortcuts() {
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel)
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen)
  const setSearchPanelOpen = useUIStore((s) => s.setSearchPanelOpen)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey

      // Ctrl+K / Cmd+K: Open command palette
      if (mod && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
        return
      }

      // Ctrl+P / Cmd+P: Quick open file (same as command palette in file mode)
      if (mod && !e.shiftKey && e.key === 'p') {
        e.preventDefault()
        setCommandPaletteOpen(true)
        return
      }

      // Ctrl+Shift+F: Global search
      if (mod && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        setCommandPaletteOpen(false)
        setSearchPanelOpen(true)
        return
      }

      // Ctrl+B: Toggle left panel
      if (mod && !e.shiftKey && e.key === 'b') {
        e.preventDefault()
        toggleLeftPanel()
        return
      }

      // Ctrl+J: Toggle right chat panel
      if (mod && !e.shiftKey && e.key === 'j') {
        e.preventDefault()
        toggleRightPanel()
        return
      }

      // Ctrl+/: Show shortcuts help
      if (mod && e.key === '/') {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }

      // Ctrl+S / Cmd+S: Prevent browser default save; file save handled by editor
      if (mod && e.key === 's') {
        e.preventDefault()
        return
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [toggleLeftPanel, toggleRightPanel, setCommandPaletteOpen, setShortcutsOpen, setSearchPanelOpen])
}