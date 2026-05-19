import { apiFetch } from '@/app/api'
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
import { useIsMobile } from '@/hooks/use-mobile'
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
  const setSearchPanelOpen = useUIStore((s) => s.setSearchPanelOpen)
  const navigate = useNavigate()
  const { toggle: toggleTheme } = useTheme()
  const addFavorite = useFavoritesStore((s) => s.addFavorite)
  const viewRepo = useViewContext((s) => s.repo)
  const viewPath = useViewContext((s) => s.path)
  const viewContext = useMemo(() => ({ repo: viewRepo, path: viewPath }), [viewRepo, viewPath])
  const isMobile = useIsMobile()

  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<FlatFile[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Fetch files on open
  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)

    apiFetch('/api/workspace/tree')
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
        label: '新建文件',
        icon: <FilePlus className="size-4" />,
        group: 'commands',
        action: () => {
          setCommandPaletteOpen(false)
          window.dispatchEvent(new CustomEvent('increa:create-file', { detail: { type: 'file' } }))
        },
      },
      {
        id: 'new-folder',
        label: '新建文件夹',
        icon: <FolderPlus className="size-4" />,
        group: 'commands',
        action: () => {
          setCommandPaletteOpen(false)
          window.dispatchEvent(new CustomEvent('increa:create-file', { detail: { type: 'dir' } }))
        },
      },
      {
        id: 'toggle-theme',
        label: '切换深色模式',
        icon: <Moon className="size-4" />,
        group: 'commands',
        action: () => {
          toggleTheme()
          setCommandPaletteOpen(false)
        },
      },
      {
        id: 'global-search',
        label: '全局搜索',
        icon: <Search className="size-4" />,
        group: 'commands',
        action: () => {
          setCommandPaletteOpen(false)
          setSearchPanelOpen(true)
        },
      },
      {
        id: 'knowledge-graph',
        label: '知识图谱',
        icon: <Network className="size-4" />,
        group: 'commands',
        action: () => {
          navigate('/graph')
          setCommandPaletteOpen(false)
        },
      },
      {
        id: 'favorite-file',
        label: '收藏当前文件',
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
        label: '版本历史',
        icon: <GitBranch className="size-4" />,
        group: 'commands',
        action: () => {
          window.dispatchEvent(new CustomEvent('increa:open-version-history'))
          setCommandPaletteOpen(false)
        },
      },
      {
        id: 'show-shortcuts',
        label: '显示快捷键',
        icon: <Command className="size-4" />,
        group: 'commands',
        action: () => {
          setCommandPaletteOpen(false)
          setShortcutsOpen(true)
        },
      },
    ],
    [toggleTheme, navigate, viewContext, addFavorite, setCommandPaletteOpen, setShortcutsOpen, setSearchPanelOpen],
  )

/**
 * Fuzzy path matching: split query into segments and match each segment
 * against path parts. Supports:
 * - Pure substring: "readme" → matches "docs/readme.md"
 * - Path-based: "docs/read" → matches "docs/README.md"
 * - CamelCase/PascalCase initials: "mv" → matches "MarkdownViewer"
 * - Split by separators: "d/r" → matches segments starting with d then r
 */
function fuzzyMatchPath(query: string, path: string, name: string): boolean {
  const q = query.toLowerCase()
  const lowerPath = path.toLowerCase()
  const lowerName = name.toLowerCase()

  // 1. Direct substring match (fastest)
  if (lowerName.includes(q) || lowerPath.includes(q)) return true

  // 2. Path segment matching: "docs/read" → ["docs", "read"]
  //    Each query segment must match the start of a path segment in order
  const queryParts = q.split(/[/\\]+/).filter(Boolean)
  if (queryParts.length > 1) {
    const pathParts = lowerPath.split(/[/\\]+/)
    let pi = 0
    for (const qp of queryParts) {
      while (pi < pathParts.length) {
        if (pathParts[pi].startsWith(qp)) break
        pi++
      }
      if (pi >= pathParts.length) return false
      pi++
    }
    return true
  }

  // 3. CamelCase / PascalCase initial matching: "mv" → "MarkdownViewer"
  if (q.length <= 5 && q.length >= 1) {
    const initials = name
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase split
      .replace(/[-_.]/g, ' ')                  // separator split
      .split(/\s+/)
      .filter(Boolean)
      .map(s => s[0].toLowerCase())
      .join('')
    if (initials.includes(q)) return true
  }

  // 4. Character-by-character fuzzy match
  //    Each query char must appear in order within the path
  let qi = 0
  for (let i = 0; i < lowerPath.length && qi < q.length; i++) {
    if (lowerPath[i] === q[qi]) qi++
  }
  return qi === q.length
}

function matchScore(query: string, path: string, name: string): number {
  const q = query.toLowerCase()
  const lowerName = name.toLowerCase()
  const lowerPath = path.toLowerCase()

  // Exact name match → highest
  if (lowerName === q) return 1000
  // Name starts with query → very high
  if (lowerName.startsWith(q)) return 800
  // Path starts with query → high
  if (lowerPath.startsWith(q)) return 600
  // Name contains query → medium
  if (lowerName.includes(q)) return 400
  // Path contains query → lower
  if (lowerPath.includes(q)) return 200
  // Fuzzy match → lowest
  return 100
}

  const filteredItems: PaletteItem[] = useMemo(() => {
    const q = query.toLowerCase().trim()

    const matchedCommands: PaletteItem[] = q
      ? commands.filter((c) => c.label.toLowerCase().includes(q))
      : commands

    let matchedFiles: FlatFile[]
    if (q) {
      matchedFiles = files
        .filter((f) => fuzzyMatchPath(q, f.path, f.name))
        .sort((a, b) => matchScore(q, b.path, b.name) - matchScore(q, a.path, a.name))
        .slice(0, 50)
    } else {
      matchedFiles = files.slice(0, 50)
    }

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

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[60]">
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => setCommandPaletteOpen(false)}
        />
        <div className="relative flex flex-col bg-white dark:bg-gray-900 rounded-t-xl shadow-2xl animate-in slide-in-from-bottom duration-200 safe-top"
          style={{ height: '90dvh' }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>

          {/* Search input */}
          <div className="flex items-center border-b px-3">
            <Command className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入命令或搜索文件..."
              className="flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(false)}
              className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent touch-target"
            >
              ✕
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto overscroll-contain">
            {commandItems.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">命令</div>
                {commandItems.map((item, i) => {
                  const globalIndex = i
                  return (
                    <button
                      key={item.id}
                      onClick={item.action}
                      className={`flex w-full items-center gap-3 px-3 py-3 text-sm transition-colors touch-target ${
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
                  文件{fileItems.length > 50 ? ` (显示前 50 / 共 ${files.length})` : ''}
                </div>
                {fileItems.map((item, i) => {
                  const globalIndex = commandItems.length + i
                  return (
                    <button
                      key={item.id}
                      onClick={item.action}
                      className={`flex w-full items-center gap-3 px-3 py-3 text-sm transition-colors touch-target ${
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
                未找到结果
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-3 py-2 text-xs text-muted-foreground safe-bottom">
            <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> 导航{' '}
            <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">↵</kbd> 选择
          </div>
        </div>
      </div>
    )
  }

  // Desktop: centered dialog
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
            placeholder="输入命令或搜索文件..."
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
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">命令</div>
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
                文件{fileItems.length > 50 ? ` (显示前 50 / 共 ${files.length})` : ''}
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
              未找到结果
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <span>
            <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> 导航{' '}
            <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">↵</kbd> 选择{' '}
            <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">Esc</kbd> 关闭
          </span>
          <button
            onClick={() => {
              setCommandPaletteOpen(false)
              setShortcutsOpen(true)
            }}
            className="hover:text-foreground transition-colors"
          >
            所有快捷键 →
          </button>
        </div>
      </div>
    </div>
  )
}