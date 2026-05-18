import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
// useMemo is used below for viewContext stabilization
import { useNavigate } from 'react-router-dom'
import {
  Command,
  FilePlus,
  FolderPlus,
  Moon,
  Search,
  Star,
  GitBranch,
  Network,
  FileText,
} from 'lucide-react'

import { useTheme } from '@/hooks/use-theme'
import { useFavoritesStore } from '@/stores/favorites-store'
import { useUIStore } from '@/stores/ui-store'
import { useViewContext } from '@/stores/view-context'
import { type TreeNode } from './api'

type PaletteItem = {
  id: string
  label: string
  sublabel?: string
  icon: React.ReactNode
  group: 'commands' | 'files'
  action: () => void
}

type FlatFile = {
  repo: string
  path: string
  name: string
}

function flattenTree(repo: string, nodes: TreeNode[], prefix = ''): FlatFile[] {
  const result: FlatFile[] = []
  for (const node of nodes) {
    const fullPath = prefix ? `${prefix}/${node.name}` : node.name
    if (node.type === 'file') {
      result.push({ repo, path: fullPath, name: node.name })
    }
    if (node.type === 'dir' && node.children) {
      result.push(...flattenTree(repo, node.children, fullPath))
    }
  }
  return result
}

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen)
  const navigate = useNavigate()
  const { toggle: toggleTheme } = useTheme()
  const addFavorite = useFavoritesStore((s) => s.addFavorite)
  const viewRepo = useViewContext((s) => s.repo)
  const viewPath = useViewContext((s) => s.path)
  const viewContext = useMemo(() => ({ repo: viewRepo, path: viewPath }), [viewRepo, viewPath])

  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<FlatFile[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Fetch files on open
  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)

    fetch('/api/workspace/tree')
      .then((res) => res.json())
      .then((data) => {
        const repoList: { name: string; files: TreeNode[] }[] = data.data || []
        const allFiles: FlatFile[] = []
        for (const repo of repoList) {
          allFiles.push(...flattenTree(repo.name, repo.files || []))
        }
        setFiles(allFiles)
      })
      .catch(console.error)
  }, [open])

  // Auto-focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const commands: PaletteItem[] = useMemo(
    () => [
      {
        id: 'new-file',
        label: 'New File',
        icon: <FilePlus className="size-4" />,
        group: 'commands',
        action: () => {
          setCommandPaletteOpen(false)
          window.dispatchEvent(new CustomEvent('increa:create-file', { detail: { type: 'file' } }))
        },
      },
      {
        id: 'new-folder',
        label: 'New Folder',
        icon: <FolderPlus className="size-4" />,
        group: 'commands',
        action: () => {
          setCommandPaletteOpen(false)
          window.dispatchEvent(new CustomEvent('increa:create-file', { detail: { type: 'dir' } }))
        },
      },
      {
        id: 'toggle-theme',
        label: 'Toggle Dark Mode',
        icon: <Moon className="size-4" />,
        group: 'commands',
        action: () => {
          toggleTheme()
          setCommandPaletteOpen(false)
        },
      },
      {
        id: 'global-search',
        label: 'Global Search',
        icon: <Search className="size-4" />,
        group: 'commands',
        action: () => {
          setCommandPaletteOpen(false)
          window.dispatchEvent(new CustomEvent('increa:open-search'))
        },
      },
      {
        id: 'knowledge-graph',
        label: 'Knowledge Graph',
        icon: <Network className="size-4" />,
        group: 'commands',
        action: () => {
          navigate('/graph')
          setCommandPaletteOpen(false)
        },
      },
      {
        id: 'favorite-file',
        label: 'Favorite Current File',
        icon: <Star className="size-4" />,
        group: 'commands',
        action: () => {
          if (viewContext.repo && viewContext.path) {
            addFavorite(viewContext.repo, viewContext.path)
          }
          setCommandPaletteOpen(false)
        },
      },
      {
        id: 'version-history',
        label: 'Version History',
        icon: <GitBranch className="size-4" />,
        group: 'commands',
        action: () => {
          window.dispatchEvent(new CustomEvent('increa:open-version-history'))
          setCommandPaletteOpen(false)
        },
      },
      {
        id: 'show-shortcuts',
        label: 'Show Keyboard Shortcuts',
        icon: <Command className="size-4" />,
        group: 'commands',
        action: () => {
          setCommandPaletteOpen(false)
          setShortcutsOpen(true)
        },
      },
    ],
    [toggleTheme, navigate, viewContext, addFavorite, setCommandPaletteOpen, setShortcutsOpen],
  )

  const filteredItems: PaletteItem[] = useMemo(() => {
    const q = query.toLowerCase().trim()

    const matchedCommands: PaletteItem[] = q
      ? commands.filter((c) => c.label.toLowerCase().includes(q))
      : commands

    const matchedFiles = q
      ? files.filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      : files.slice(0, 50)

    const fileItems: PaletteItem[] = matchedFiles.map((f) => ({
      id: `file:${f.repo}:${f.path}`,
      label: f.path,
      sublabel: f.repo,
      icon: <FileText className="size-4" />,
      group: 'files' as const,
      action: () => {
        navigate(`/views/${f.repo}/${f.path}`)
        setCommandPaletteOpen(false)
      },
    }))

    return [...matchedCommands, ...fileItems]
  }, [query, commands, files, navigate, setCommandPaletteOpen])

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action()
        }
        return
      }
    },
    [filteredItems, selectedIndex, setCommandPaletteOpen],
  )

  if (!open) return null

  const commandItems = filteredItems.filter((i) => i.group === 'commands')
  const fileItems = filteredItems.filter((i) => i.group === 'files')

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-4 md:pt-[15vh] md:px-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => setCommandPaletteOpen(false)}
      />
      <div className="relative z-[61] w-[calc(100%-2rem)] max-w-lg rounded-lg border bg-white shadow-2xl dark:bg-gray-900 md:w-full">
        {/* Search input */}
        <div className="flex items-center border-b px-3">
          <Command className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search files..."
            className="flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-auto py-1">
          {commandItems.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">Commands</div>
              {commandItems.map((item, i) => {
                const globalIndex = i
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      selectedIndex === globalIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/50'
                    }`}
                  >
                    <span className="shrink-0 text-muted-foreground">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </>
          )}

          {fileItems.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                Files{fileItems.length > 50 ? ` (showing first 50 of ${files.length})` : ''}
              </div>
              {fileItems.map((item, i) => {
                const globalIndex = commandItems.length + i
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      selectedIndex === globalIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/50'
                    }`}
                  >
                    <span className="shrink-0 text-muted-foreground">{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.sublabel && (
                      <span className="shrink-0 text-xs text-muted-foreground">{item.sublabel}</span>
                    )}
                  </button>
                )
              })}
            </>
          )}

          {filteredItems.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No results found
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <span>
            <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> navigate{' '}
            <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">↵</kbd> select{' '}
            <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">Esc</kbd> close
          </span>
          <button
            onClick={() => {
              setCommandPaletteOpen(false)
              setShortcutsOpen(true)
            }}
            className="hover:text-foreground transition-colors"
          >
            All shortcuts →
          </button>
        </div>
      </div>
    </div>
  )
}