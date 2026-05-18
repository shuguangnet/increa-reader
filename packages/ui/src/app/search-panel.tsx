import { Hash, Search, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<number>(0)

  // Auto-focus input when panel opens
  useEffect(() => {
    if (open) {
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
      const res = await fetch(`/api/search?${params}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [typeFilter])

  // Debounce search query changes
  useEffect(() => {
    if (!open) return
    clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      doSearch(query)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, open, doSearch])

  // Re-search when type filter changes
  useEffect(() => {
    if (!open || !query.trim()) return
    doSearch(query)
  }, [typeFilter, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const navigateToFile = (repo: string, filePath: string) => {
    const clean = filePath.startsWith('/') ? filePath.slice(1) : filePath
    navigate(`/views/${repo}/${clean}`)
    onClose()
  }

  // Handle escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md md:max-w-sm bg-white dark:bg-gray-900 shadow-xl flex flex-col h-full border-l md:border-l">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Search className="size-4" /> 全局搜索
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
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

        <div className="flex-1 overflow-auto">
          {loading && <div className="p-4 text-sm text-muted-foreground">搜索中...</div>}
          {!loading && results.length === 0 && query && (
            <div className="p-4 text-sm text-muted-foreground">未找到结果</div>
          )}
          {!loading && results.length === 0 && !query && (
            <div className="p-4 text-sm text-muted-foreground">输入关键词开始搜索</div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.repo}-${r.file_path}-${r.line_number}-${i}`}
              onClick={() => navigateToFile(r.repo, r.file_path)}
              className="w-full text-left px-4 py-2.5 border-b hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                <Hash className="size-3" />
                <span className="font-medium">{r.repo}</span>
                <span>/</span>
                <span className="truncate">{r.file_path}</span>
                {r.line_number > 0 && (
                  <span className="ml-auto shrink-0 text-[10px] bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5">
                    L{r.line_number}
                  </span>
                )}
              </div>
              {r.line && (
                <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 font-mono">
                  {highlightMatch(r.line.trim(), query)}
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
          <span><kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">Esc</kbd> 关闭</span>
          {results.length > 0 && (
            <span>{results.length} 条结果</span>
          )}
        </div>
      </div>
    </div>
  )
}