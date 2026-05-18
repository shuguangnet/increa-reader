import { LayoutTemplate, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { applyTemplate, fetchTemplateDetail, fetchTemplates, type TemplateInfo, type TemplateDetail } from './api'

type TemplateGalleryProps = {
  repoName: string
  parentPath: string
  onCreated: () => void
  onClose: () => void
}

const CATEGORY_COLORS: Record<string, string> = {
  '工作': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  '开发': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  '个人': 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
}

export function TemplateGallery({ repoName, parentPath, onCreated, onClose }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [selected, setSelected] = useState<TemplateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [fileName, setFileName] = useState('')
  const [showApplyDialog, setShowApplyDialog] = useState(false)

  useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleSelect = useCallback(async (id: string) => {
    try {
      setError(null)
      const detail = await fetchTemplateDetail(id)
      setSelected(detail)
      setShowApplyDialog(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load template')
    }
  }, [])

  const handleApply = useCallback(async () => {
    if (!selected || !fileName.trim()) return
    const fullPath = parentPath ? `${parentPath}/${fileName.trim()}` : fileName.trim()
    setApplying(true)
    setError(null)
    try {
      await applyTemplate(selected.id, repoName, fullPath)
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply template')
    } finally {
      setApplying(false)
    }
  }, [selected, fileName, parentPath, repoName, onCreated, onClose])

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative z-50 w-full max-w-3xl rounded-lg border bg-white p-6 shadow-lg dark:bg-gray-900">
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            加载模板中...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 w-full max-w-3xl max-h-[80vh] rounded-lg border bg-white shadow-lg dark:bg-gray-900 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="size-5" />
            <h2 className="text-lg font-semibold">模板画廊</h2>
          </div>
          <button
            type="button"
            className="rounded-md p-1 hover:bg-accent"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Template list */}
          <div className="w-1/2 overflow-y-auto border-r p-4">
            <div className="grid grid-cols-1 gap-3">
              {templates.map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  className={`text-left rounded-lg border p-3 transition-colors hover:bg-accent ${
                    selected?.id === tpl.id ? 'border-primary bg-accent' : ''
                  }`}
                  onClick={() => handleSelect(tpl.id)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[tpl.category] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                      {tpl.category}
                    </span>
                    <span className="font-medium text-sm">{tpl.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Template preview */}
          <div className="w-1/2 overflow-y-auto p-4">
            {selected ? (
              <div className="flex flex-col h-full">
                <h3 className="font-semibold mb-2">{selected.name}</h3>
                {showApplyDialog ? (
                  <div className="mb-4 space-y-3 rounded-lg border p-3">
                    <div className="text-sm text-muted-foreground">
                      在 <span className="font-mono text-xs">{parentPath || '/'}</span> 下创建文件
                    </div>
                    <Input
                      value={fileName}
                      onChange={e => setFileName(e.target.value)}
                      placeholder="例如: meeting-2024-01-15.md"
                      onKeyDown={e => { if (e.key === 'Enter') handleApply() }}
                      disabled={applying}
                    />
                    {error && <p className="text-xs text-destructive">{error}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowApplyDialog(false)} disabled={applying}>
                        取消
                      </Button>
                      <Button size="sm" onClick={handleApply} disabled={applying || !fileName.trim()}>
                        {applying ? '创建中...' : '创建'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="mb-3"
                    onClick={() => {
                      setShowApplyDialog(true)
                      setFileName('')
                      setError(null)
                    }}
                  >
                    使用此模板
                  </Button>
                )}
                <pre className="flex-1 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap font-mono">
                  {selected.content}
                </pre>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                点击左侧模板查看预览
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}