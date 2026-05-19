import { RefreshCw, Search, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useIsMobile } from '@/hooks/use-mobile'
import { showToast } from '@/app/toast'
import { fetchRepos, type RepoInfo } from './api'
import { getFileIcon } from './file-tree'

type SearchResult = {
  repo: string
  file_path: string
  line_number: number
  line: string
}

type SearchPanelProps = {
  open: boolean
  onClose: () => void
}

const FILE_TYPE_FILTERS = ['md', 'py', 'ts', 'tsx', 'js', 'json', 'yaml', 'txt'] as const

function highlightMatch(text: string, query: string) {
  if (!query) return text
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">{part}</mark>
    ) : (
      part
    ),
  )
}

export function SearchPanel({ open, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [repoFilter, setRepoFilter] = useState<string | null>(null)
  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [rebuilding, setRebuilding] = useState(false)
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<number>(0)
  const resultsRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Rebuild search index
  const doSearchRef = useRef<((q: string) => Promise<void>) | null>(null)
  const handleRebuild = useCallback(async () => {
    setRebuilding(true)
    try {
      const res = await fetch('/api/search/rebuild', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        showToast(`搜索索引已重建（${data.total_files ?? 0} 个文件）`, 'success')
        // Re-run search if there's a query
        if (query.trim() && doSearchRef.current) {
          doSearchRef.current(query)
        }
      } else {
        showToast('重建搜索索引失败', 'error')
      }
    } catch {
      showToast('重建搜索索引失败', 'error')
    } finally {
      setRebuilding(false)
    }
  }, [query])

  // Swipe-to-close for mobile
  const touchStartRef = useRef<{ startY: number; currentTranslateY: number; swiping: boolean }>({ startY: 0, currentTranslateY: 0, swiping: false })

  // Load repos for repo filter
  useEffect(() => {
    if (open) {
      fetchRepos().then(setRepos).catch(() => setRepos([]))
    }
  }, [open])

  // Reset selected index when results or query change
  useEffect(() => {
    setSelectedIndex(-1)
  }, [results])

  // Auto-focus input when panel opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(-1)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Debounced search
  const doSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({ q: searchQuery })
      if (typeFilter) params.set('file_types', typeFilter)
      if (repoFilter) params.set('repo', repoFilter)
      const res = await fetch(`/api/search?${params}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [typeFilter, repoFilter])

  // Keep ref in sync so rebuild can call it
  doSearchRef.current = doSearch

  // Debounce search query changes
  useEffect(() => {
    if (!open) return
    clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      doSearch(query)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, open, doSearch])

  // Re-search when type filter or repo filter changes
  useEffect(() => {
    if (!open || !query.trim()) return
    doSearch(query)
  }, [typeFilter, repoFilter, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const navigateToFile = useCallback((repo: string, filePath: string, lineNumber?: number) => {
    const clean = filePath.startsWith('/') ? filePath.slice(1) : filePath
    const url = lineNumber
      ? `/views/${repo}/${clean}?line=${lineNumber}`
      : `/views/${repo}/${clean}`
    navigate(url)
    onClose()
    // Dismiss mobile keyboard
    inputRef.current?.blur()
  }, [navigate, onClose])

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex < 0 || !resultsRef.current) return
    const items = resultsRef.current.querySelectorAll('[data-result-index]')
    const el = items[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, results.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          const r = results[selectedIndex]
          navigateToFile(r.repo, r.file_path, r.line_number > 0 ? r.line_number : undefined)
        }
        return
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose, results, selectedIndex, navigateToFile])

  // Mobile touch handlers for swipe-to-close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return
    const touch = e.touches[0]
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return
    if (touch.clientY - rect.top < 48) {
      touchStartRef.current = { startY: touch.clientY, currentTranslateY: 0, swiping: false }
    }
  }, [isMobile])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return
    const t = touchStartRef.current
    if (t.startY === 0) return
    const touch = e.touches[0]
    const dy = touch.clientY - t.startY
    if (!t.swiping && dy > 10) {
      t.swiping = true
    }
    if (t.swiping && dy > 0 && panelRef.current) {
      t.currentTranslateY = dy
      panelRef.current.style.transform = `translateY(${dy}px)`
      panelRef.current.style.transition = 'none'
    }
  }, [isMobile])

  const handleTouchEnd = useCallback(() => {
    if (!isMobile) return
    const t = touchStartRef.current
    if (panelRef.current) {
      panelRef.current.style.transform = ''
      panelRef.current.style.transition = ''
    }
    if (t.swiping && t.currentTranslateY > 80) {
      onClose()
    }
    touchStartRef.current = { startY: 0, currentTranslateY: 0, swiping: false }
  }, [isMobile, onClose])

  if (!open) return null

  // Group results by repo
  const groupedResults = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.repo]) acc[r.repo] = []
    acc[r.repo].push(r)
    return acc
  }, {})

  // Mobile: full-screen bottom sheet
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div
          ref={panelRef}
          className="relative flex flex-col h-[95vh] bg-white dark:bg-gray-900 rounded-t-xl shadow-2xl animate-in slide-in-from-bottom duration-200 touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>

          <div className="flex items-center justify-between px-4 py-2 border-b">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Search className="size-4" /> 搜索
            </h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" onClick={handleRebuild} disabled={rebuilding} title="重建搜索索引">
                <RefreshCw className={`size-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={onClose}>
                <X className="size-4" />
              </Button>
            </div>
          </div>

          <div className="px-3 py-2 border-b space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="搜索内容..."
                className="pl-8"
                autoFocus
              />
            </div>
            {/* Repo filter chips */}
            {repos.length > 1 && (
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setRepoFilter(null)}
                  className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                    repoFilter === null
                      ? 'bg-blue-600 text-white border-transparent'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  全部
                </button>
                {repos.map(r => (
                  <button
                    key={r.name}
                    onClick={() => setRepoFilter(repoFilter === r.name ? null : r.name)}
                    className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                      repoFilter === r.name
                        ? 'bg-blue-600 text-white border-transparent'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {FILE_TYPE_FILTERS.map(ft => (
                <button
                  key={ft}
                  onClick={() => setTypeFilter(typeFilter === ft ? null : ft)}
                  className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                    typeFilter === ft
                      ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900 border-transparent'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  .{ft}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto overscroll-contain" ref={resultsRef}>
            {loading && <div className="p-4 text-sm text-muted-foreground">搜索中...</div>}
            {!loading && results.length === 0 && query && (
              <div className="p-4 text-sm text-muted-foreground">未找到结果</div>
            )}
            {!loading && results.length === 0 && !query && (
              <div className="p-4 text-sm text-muted-foreground text-center">
                <Search className="size-8 mx-auto mb-2 opacity-30" />
                <p>输入关键词搜索所有仓库内容</p>
              </div>
            )}
            {Object.entries(groupedResults).map(([repo, repoResults]) => (
              <div key={repo}>
                {repos.length > 1 && (
                  <div className="px-4 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50 sticky top-0">
                    {repo}
                  </div>
                )}
                {repoResults.map((r, i) => {
                  const globalIndex = results.indexOf(r)
                  const fileName = r.file_path.split('/').pop() || r.file_path
                  return (
                    <button
                      key={`${r.repo}-${r.file_path}-${r.line_number}-${i}`}
                      data-result-index={globalIndex}
                      onClick={() => navigateToFile(r.repo, r.file_path, r.line_number > 0 ? r.line_number : undefined)}
                      className={`w-full text-left px-4 py-3 border-b transition-colors active:bg-accent ${
                        selectedIndex === globalIndex
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {getFileIcon(fileName)}
                        <span className="text-xs text-muted-foreground truncate flex-1" title={`${r.repo}/${r.file_path}`}>
                          {r.file_path}
                        </span>
                        {r.line_number > 0 && (
                          <span className="shrink-0 text-[10px] bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5">
                            L{r.line_number}
                          </span>
                        )}
                      </div>
                      {r.line && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 font-mono mt-0.5">
                          {highlightMatch(r.line.trim(), query)}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center justify-between safe-area-inset-bottom">
            <span>
              <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> 导航{' '}
              <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">↵</kbd> 打开
            </span>
            {results.length > 0 && (
              <span>{results.length} 条结果</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Desktop: side panel overlay
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md md:max-w-sm bg-white dark:bg-gray-900 shadow-xl flex flex-col h-full border-l md:border-l animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Search className="size-4" /> 全局搜索
          </h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={handleRebuild} disabled={rebuilding} title="重建搜索索引">
              <RefreshCw className={`size-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索所有仓库内容..."
              className="pl-8"
              autoFocus
            />
          </div>
          {/* Repo filter chips */}
          {repos.length > 1 && (
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setRepoFilter(null)}
                className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                  repoFilter === null
                    ? 'bg-blue-600 text-white border-transparent'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                全部仓库
              </button>
              {repos.map(r => (
                <button
                  key={r.name}
                  onClick={() => setRepoFilter(repoFilter === r.name ? null : r.name)}
                  className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                    repoFilter === r.name
                      ? 'bg-blue-600 text-white border-transparent'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {FILE_TYPE_FILTERS.map(ft => (
              <button
                key={ft}
                onClick={() => setTypeFilter(typeFilter === ft ? null : ft)}
                className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                  typeFilter === ft
                    ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900 border-transparent'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                .{ft}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto" ref={resultsRef}>
          {loading && <div className="p-4 text-sm text-muted-foreground">搜索中...</div>}
          {!loading && results.length === 0 && query && (
            <div className="p-4 text-sm text-muted-foreground">未找到结果</div>
          )}
          {!loading && results.length === 0 && !query && (
            <div className="p-4 text-sm text-muted-foreground">输入关键词开始搜索</div>
          )}
          {Object.entries(groupedResults).map(([repo, repoResults]) => (
            <div key={repo}>
              {repos.length > 1 && (
                <div className="px-4 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30 sticky top-0 border-b">
                  {repo}
                </div>
              )}
              {repoResults.map((r, i) => {
                const globalIndex = results.indexOf(r)
                const fileName = r.file_path.split('/').pop() || r.file_path
                return (
                  <button
                    key={`${r.repo}-${r.file_path}-${r.line_number}-${i}`}
                    data-result-index={globalIndex}
                    onClick={() => navigateToFile(r.repo, r.file_path, r.line_number > 0 ? r.line_number : undefined)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={`w-full text-left px-4 py-2.5 border-b transition-colors ${
                      selectedIndex === globalIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {getFileIcon(fileName)}
                      <span className="text-xs text-muted-foreground truncate flex-1" title={`${r.repo}/${r.file_path}`}>
                        {r.file_path}
                      </span>
                      {r.line_number > 0 && (
                        <span className="ml-auto shrink-0 text-[10px] bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5">
                          L{r.line_number}
                        </span>
                      )}
                    </div>
                    {r.line && (
                      <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 font-mono mt-0.5">
                        {highlightMatch(r.line.trim(), query)}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
          <span>
            <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> 导航{' '}
            <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">↵</kbd> 打开{' '}
            <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">Esc</kbd> 关闭
          </span>
          {results.length > 0 && (
            <span>{results.length} 条结果</span>
          )}
        </div>
      </div>
    </div>
  )
}