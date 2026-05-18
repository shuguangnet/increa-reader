import { Command, Search, PanelLeft, PanelRight, FileText, FilePlus } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'

const SHORTCUTS = [
  { keys: 'Ctrl+K', description: 'Open command palette', icon: <Command className="size-3.5" /> },
  { keys: 'Ctrl+P', description: 'Quick open file', icon: <FileText className="size-3.5" /> },
  { keys: 'Ctrl+S', description: 'Save current file', icon: <FilePlus className="size-3.5" /> },
  { keys: 'Ctrl+Shift+F', description: 'Global search', icon: <Search className="size-3.5" /> },
  { keys: 'Ctrl+B', description: 'Toggle left panel', icon: <PanelLeft className="size-3.5" /> },
  { keys: 'Ctrl+J', description: 'Toggle chat panel', icon: <PanelRight className="size-3.5" /> },
  { keys: 'Ctrl+/', description: 'Show keyboard shortcuts', icon: <Command className="size-3.5" /> },
]

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone/.test(navigator.userAgent)

function formatKeys(keys: string) {
  if (!isMac) return keys
  return keys
    .replace('Ctrl+', '⌘+')
    .replace('Alt+', '⌥+')
    .replace('Shift+', '⇧+')
}

export function ShortcutsDialog() {
  const open = useUIStore((s) => s.shortcutsOpen)
  const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => setShortcutsOpen(false)}
      />
      <div className="relative z-[61] w-full max-w-md rounded-lg border bg-white p-6 shadow-2xl dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Command className="size-5" />
            Keyboard Shortcuts
          </h2>
          <button
            onClick={() => setShortcutsOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-1">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.keys}
              className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{shortcut.icon}</span>
                <span>{shortcut.description}</span>
              </div>
              <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">
                {formatKeys(shortcut.keys)}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t pt-3 text-center">
          <button
            onClick={() => {
              setShortcutsOpen(false)
              setCommandPaletteOpen(true)
            }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Open command palette →
          </button>
        </div>
      </div>
    </div>
  )
}