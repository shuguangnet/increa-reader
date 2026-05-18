import { Hash, Search, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type SearchResult = {
  repo: string
  path: string
  context: string
  file_type: string
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

  const doSearch = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ q: query })
      if (typeFilter) params.set('file_types', typeFilter)
      const res = await fetch(`/api/search?${params}`)
      const data = await res.json()
      setResults(data.results ?? data.data ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [query, typeFilter])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch()
  }

  const navigateToFile = (repo: string, path: string) => {
    const clean = path.startsWith('/') ? path.slice(1) : path
    navigate(`/views/${repo}/${clean}`)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 shadow-xl flex flex-col h-full border-l">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Search className="size-4" /> Global Search
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search across all repos..."
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
          {loading && <div className="p-4 text-sm text-muted-foreground">Searching...</div>}
          {!loading && results.length === 0 && query && (
            <div className="p-4 text-sm text-muted-foreground">No results found</div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.repo}-${r.path}-${i}`}
              onClick={() => navigateToFile(r.repo, r.path)}
              className="w-full text-left px-4 py-2.5 border-b hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                <Hash className="size-3" />
                <span className="font-medium">{r.repo}</span>
                <span>/</span>
                <span className="truncate">{r.path}</span>
              </div>
              {r.context && (
                <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 font-mono">
                  {highlightMatch(r.context, query)}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}