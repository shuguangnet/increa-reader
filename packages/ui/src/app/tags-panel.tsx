import { ChevronDown, ChevronRight, Hash, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { showToast } from '@/app/toast'
import { useViewContext } from '@/stores/view-context'

type TagInfo = { name: string; count: number }
type TagFile = { repo: string; path: string }

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

  const loadTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags')
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
      const res = await fetch(`/api/tags/file?${params}`)
      const data = await res.json()
      setFileTags(data.tags ?? [])
    } catch {
      setFileTags([])
    }
  }, [repo, path])

  useEffect(() => { loadTags() }, [loadTags])
  useEffect(() => { loadFileTags() }, [loadFileTags])

  const toggleExpand = async (tagName: string) => {
    if (expanded === tagName) { setExpanded(null); setTagFiles([]); return }
    setExpanded(tagName)
    setLoadingFiles(true)
    try {
      const res = await fetch(`/api/tags/${encodeURIComponent(tagName)}`)
      const data = await res.json()
      setTagFiles(data.files ?? data.data ?? [])
    } catch {
      setTagFiles([])
    } finally {
      setLoadingFiles(false)
    }
  }

  const addTag = async () => {
    if (!newTag.trim() || !repo || !path) return
    try {
      await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path, repo, tags: [newTag.trim()] }),
      })
      showToast(`标签 "${newTag.trim()}" 已添加`, 'success')
      setNewTag('')
      loadFileTags()
      loadTags()
    } catch {
      showToast('添加标签失败', 'error')
    }
  }

  const removeTag = async (tagName: string) => {
    if (!repo || !path) return
    try {
      await fetch('/api/tags', {
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

  const navigateToFile = (fRepo: string, fPath: string) => {
    const clean = fPath.startsWith('/') ? fPath.slice(1) : fPath
    navigate(`/views/${fRepo}/${clean}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Current file tags */}
      {repo && path && (
        <div className="border-b p-3">
          <div className="text-xs font-medium text-muted-foreground mb-1.5 truncate" title={`${repo}/${path}`}>
            {path.split('/').pop()}
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {fileTags.map(t => (
              <span key={t} className="inline-flex items-center gap-0.5 rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-xs">
                <Hash className="size-3" />{t}
                <button onClick={() => removeTag(t)} className="ml-0.5 hover:text-red-500"><X className="size-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              placeholder="Add tag..."
              className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-gray-400 dark:focus:border-gray-500"
            />
            <button onClick={addTag} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><Plus className="size-3.5" /></button>
          </div>
        </div>
      )}

      {/* Tags list */}
      <div className="flex-1 overflow-auto">
        {loading && <div className="p-3 text-xs text-muted-foreground">Loading tags...</div>}
        {!loading && tags.length === 0 && <div className="p-3 text-xs text-muted-foreground">No tags yet</div>}
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
                {loadingFiles && <div className="text-xs text-muted-foreground px-2 py-1">Loading...</div>}
                {tagFiles.map((f, i) => (
                  <button
                    key={`${f.repo}-${f.path}-${i}`}
                    onClick={() => navigateToFile(f.repo, f.path)}
                    className="w-full text-left text-xs truncate px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    {f.repo}/{f.path}
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