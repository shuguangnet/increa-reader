import { apiFetch } from '@/app/api'
import { ChevronDown, ChevronRight, Hash, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { showToast } from '@/app/toast'
import { useViewContext } from '@/stores/view-context'

type TagInfo = { name: string; count: number }
type TagFile = { repo: string; file_path: string; path?: string }

export function TagsPanel() {
  const [tags, setTags] = useState<TagInfo[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tagFiles, setTagFiles] = useState<TagFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const navigate = useNavigate()
  const { repo, path } = useViewContext()
  const [newTag, setNewTag] = useState('')
  const [fileTags, setFileTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(-1)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const loadTags = useCallback(async () => {
    try {
      const res = await apiFetch('/api/tags')
      const data = await res.json()
      setTags(data.tags ?? data.data ?? [])
    } catch {
      setTags([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadFileTags = useCallback(async () => {
    if (!repo || !path) { setFileTags([]); return }
    try {
      const params = new URLSearchParams({ repo, path })
      const res = await apiFetch(`/api/tags/file?${params}`)
      const data = await res.json()
      setFileTags(data.tags ?? [])
    } catch {
      setFileTags([])
    }
  }, [repo, path])

  useEffect(() => { loadTags() }, [loadTags])
  useEffect(() => { loadFileTags() }, [loadFileTags])

  // Close suggestions dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showSuggestions && suggestionsRef.current && !suggestionsRef.current.contains(e.target as HTMLElement) && tagInputRef.current && !tagInputRef.current.contains(e.target as HTMLElement)) {
        setShowSuggestions(false)
        setHighlightedSuggestion(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSuggestions])

  const toggleExpand = async (tagName: string) => {
    if (expanded === tagName) { setExpanded(null); setTagFiles([]); return }
    setExpanded(tagName)
    setLoadingFiles(true)
    try {
      const res = await apiFetch(`/api/tags/${encodeURIComponent(tagName)}`)
      const data = await res.json()
      setTagFiles(data.files ?? data.data ?? [])
    } catch {
      setTagFiles([])
    } finally {
      setLoadingFiles(false)
    }
  }

  const addTag = async (tagValue?: string) => {
    const tagToAdd = (tagValue ?? newTag).trim()
    if (!tagToAdd || !repo || !path) return
    try {
      await apiFetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path, repo, tags: [tagToAdd] }),
      })
      showToast(`标签 "${tagToAdd}" 已添加`, 'success')
      setNewTag('')
      setShowSuggestions(false)
      setHighlightedSuggestion(-1)
      loadFileTags()
      loadTags()
    } catch {
      showToast('添加标签失败', 'error')
    }
  }

  const removeTag = async (tagName: string) => {
    if (!repo || !path) return
    try {
      await apiFetch('/api/tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path, repo, tags: [tagName] }),
      })
      showToast(`标签 "${tagName}" 已移除`, 'info')
      loadFileTags()
      loadTags()
    } catch {
      showToast('移除标签失败', 'error')
    }
  }

  // Compute tag suggestions: existing tags that match the input and are not already on this file
  const suggestions = tags
    .map(t => t.name)
    .filter(name => {
      if (!newTag.trim()) return false
      const q = newTag.trim().toLowerCase()
      if (!name.toLowerCase().includes(q)) return false
      // Don't suggest tags already on this file
      if (fileTags.includes(name)) return false
      return true
    })
    .slice(0, 8)

  const navigateToFile = (fRepo: string, fPath: string) => {
    const clean = fPath.startsWith('/') ? fPath.slice(1) : fPath
    navigate(`/views/${fRepo}/${clean}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 当前文件标签 */}
      {repo && path && (
        <div className="border-b p-3">
          <div className="text-xs font-medium text-muted-foreground mb-1.5 truncate" title={`${repo}/${path}`}>
            {path.split('/').pop()}
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {fileTags.length === 0 && (
              <span className="text-xs text-muted-foreground opacity-60">暂无标签</span>
            )}
            {fileTags.map(t => (
              <span key={t} className="inline-flex items-center gap-0.5 rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-xs">
                <Hash className="size-3" />{t}
                <button onClick={() => removeTag(t)} className="ml-0.5 hover:text-red-500"><X className="size-3" /></button>
              </span>
            ))}
          </div>
          <div className="relative">
            <div className="flex gap-1">
              <input
                ref={tagInputRef}
                value={newTag}
                onChange={e => {
                  setNewTag(e.target.value)
                  setShowSuggestions(true)
                  setHighlightedSuggestion(-1)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (highlightedSuggestion >= 0 && highlightedSuggestion < suggestions.length) {
                      addTag(suggestions[highlightedSuggestion])
                    } else {
                      addTag()
                    }
                  }
                  if (e.key === 'ArrowDown' && showSuggestions && suggestions.length > 0) {
                    e.preventDefault()
                    setHighlightedSuggestion(prev => Math.min(prev + 1, suggestions.length - 1))
                  }
                  if (e.key === 'ArrowUp' && showSuggestions && suggestions.length > 0) {
                    e.preventDefault()
                    setHighlightedSuggestion(prev => Math.max(prev - 1, 0))
                  }
                  if (e.key === 'Escape') {
                    setShowSuggestions(false)
                    setHighlightedSuggestion(-1)
                  }
                }}
                onFocus={() => {
                  if (newTag.trim()) setShowSuggestions(true)
                }}
                placeholder="添加标签..."
                className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-gray-400 dark:focus:border-gray-500"
              />
              <button onClick={() => addTag()} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><Plus className="size-3.5" /></button>
            </div>
            {/* Tag autocomplete suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-48 overflow-auto"
              >
                {suggestions.map((name, i) => (
                  <button
                    key={name}
                    className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${
                      highlightedSuggestion === i
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => addTag(name)}
                    onMouseEnter={() => setHighlightedSuggestion(i)}
                  >
                    <Hash className="size-3 text-muted-foreground" />
                    <span>{name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 标签列表 */}
      <div className="flex-1 overflow-auto">
        {loading && <div className="p-3 text-xs text-muted-foreground">加载中...</div>}
        {!loading && tags.length === 0 && <div className="p-3 text-xs text-muted-foreground">暂无标签</div>}
        {tags.map(tag => (
          <div key={tag.name}>
            <button
              onClick={() => toggleExpand(tag.name)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                {expanded === tag.name ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                <Hash className="size-3.5 text-muted-foreground" />
                <span>{tag.name}</span>
              </span>
              <span className="text-xs text-muted-foreground">{tag.count}</span>
            </button>
            {expanded === tag.name && (
              <div className="pl-6 pb-1">
                {loadingFiles && <div className="text-xs text-muted-foreground px-2 py-1">加载中...</div>}
                {tagFiles.map((f, i) => (
                  <button
                    key={`${f.repo}-${f.file_path}-${i}`}
                    onClick={() => navigateToFile(f.repo, f.file_path)}
                    className="w-full text-left text-xs truncate px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    {f.repo}/{f.file_path}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}