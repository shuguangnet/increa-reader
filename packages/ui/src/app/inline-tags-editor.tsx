import { apiFetch } from '@/app/api'
import { Hash, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { showToast } from '@/app/toast'

type InlineTagsEditorProps = {
  repo: string
  path: string
}

/**
 * Compact inline tags editor for the file viewer toolbar.
 * Shows current file tags as small badges and allows quick add/remove.
 */
export function InlineTagsEditor({ repo, path }: InlineTagsEditorProps) {
  const [fileTags, setFileTags] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [inputVisible, setInputVisible] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadTags = useCallback(async () => {
    if (!repo || !path) return
    try {
      const [fileRes, allRes] = await Promise.all([
        apiFetch(`/api/tags/file?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`),
        apiFetch('/api/tags'),
      ])
      const fileData = await fileRes.json()
      const allData = await allRes.json()
      setFileTags(fileData.tags ?? [])
      setAllTags((allData.tags ?? []).map((t: { name: string }) => t.name))
    } catch {
      setFileTags([])
      setAllTags([])
    }
  }, [repo, path])

  useEffect(() => { loadTags() }, [loadTags])

  // Auto-focus input when shown
  useEffect(() => {
    if (inputVisible && inputRef.current) {
      inputRef.current.focus()
    }
  }, [inputVisible])

  const addTag = useCallback(async (tagName?: string) => {
    const tag = (tagName ?? newTag).trim()
    if (!tag || !repo || !path) return
    if (fileTags.includes(tag)) {
      setInputVisible(false)
      setNewTag('')
      return
    }
    setLoading(true)
    try {
      await apiFetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path, repo, tags: [tag] }),
      })
      setNewTag('')
      setInputVisible(false)
      showToast(`标签 "${tag}" 已添加`, 'success')
      await loadTags()
    } catch {
      showToast('添加标签失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [newTag, repo, path, fileTags, loadTags])

  const removeTag = useCallback(async (tagName: string) => {
    if (!repo || !path) return
    try {
      await apiFetch('/api/tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path, repo, tags: [tagName] }),
      })
      showToast(`标签 "${tagName}" 已移除`, 'info')
      await loadTags()
    } catch {
      showToast('移除标签失败', 'error')
    }
  }, [repo, path, loadTags])

  // Compute suggestions: existing tags that match input and aren't already on this file
  const suggestions = allTags.filter(name => {
    if (!newTag.trim()) return false
    const q = newTag.trim().toLowerCase()
    if (!name.toLowerCase().includes(q)) return false
    if (fileTags.includes(name)) return false
    return true
  }).slice(0, 5)

  if (fileTags.length === 0 && !inputVisible) {
    return (
      <button
        type="button"
        onClick={() => setInputVisible(true)}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="添加标签"
      >
        <Hash size={16} />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {fileTags.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-accent text-accent-foreground group/tag"
        >
          <span className="truncate max-w-[80px]" title={tag}>{tag}</span>
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="opacity-0 group-hover/tag:opacity-100 transition-opacity hover:text-red-500 shrink-0"
            title={`移除标签 "${tag}"`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      {inputVisible ? (
        <div className="relative">
          <input
            ref={inputRef}
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                addTag()
              }
              if (e.key === 'Escape') {
                setInputVisible(false)
                setNewTag('')
              }
            }}
            onBlur={() => {
              // Delay to allow click on suggestions
              setTimeout(() => {
                setInputVisible(false)
                setNewTag('')
              }, 200)
            }}
            placeholder="标签..."
            className="w-16 h-5 px-1.5 text-[11px] rounded-full border border-border bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20"
            disabled={loading}
          />
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-lg z-50 min-w-[120px] max-w-[200px]">
              {suggestions.map(name => (
                <button
                  key={name}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    addTag(name)
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-1"
                >
                  <Hash size={10} className="text-muted-foreground shrink-0" />
                  <span className="truncate">{name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setInputVisible(true)}
          className="p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="添加标签"
        >
          <Plus size={12} />
        </button>
      )}
    </div>
  )
}