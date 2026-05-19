import { Code, Eye, Pencil, Save } from 'lucide-react'
import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { CodeBlockWithCopy } from '@/components/code-block-with-copy'
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useEditorStore } from '@/stores/editor-store'
import { saveFile } from '@/app/api'
import { showToast } from '@/app/toast'
import { useTheme } from '@/hooks/use-theme'

type HtmlViewerProps = {
  body: string
  repo: string
  path: string
}

type ViewMode = 'preview' | 'source' | 'edit'

export function HtmlViewer({ body, repo, path }: HtmlViewerProps) {
  const [mode, setMode] = useState<ViewMode>('preview')
  const editedFiles = useEditorStore(s => s.editedFiles)
  const updateContent = useEditorStore(s => s.updateContent)
  const fileKey = `${repo}:${path}`
  const fileState = editedFiles[fileKey]
  const content = fileState?.content ?? body
  const { isDark } = useTheme()

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editedContent = fileState?.content
  const dirty = fileState ? fileState.content !== fileState.originalContent : false

  const handleEdit = useCallback(() => {
    if (!fileState) {
      useEditorStore.getState().openFile(repo, path, body)
    }
    setMode('edit')
  }, [fileState, repo, path, body])

  const handleSave = useCallback(async () => {
    const { isDirty } = useEditorStore.getState()
    if (!isDirty(repo, path)) return
    setSaveStatus('saving')
    try {
      await saveFile(repo, path, content)
      useEditorStore.getState().markSaved(repo, path)
      setSaveStatus('saved')
      showToast('文件已保存', 'success')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
    } catch {
      setSaveStatus('error')
      showToast('保存失败', 'error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }, [repo, path, content])

  // Keyboard shortcut Ctrl+S
  useState(() => {
    const handler = (e: KeyboardEvent) => {
      if (mode !== 'edit') return
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  })

  const codeStyle = isDark ? vscDarkPlus : oneLight

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b bg-muted/30 px-3 py-1">
        <span className="text-sm font-medium truncate max-w-48">{path.split('/').pop()}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={mode === 'preview' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setMode('preview')}
          >
            <Eye className="h-3.5 w-3.5" />
            预览
          </Button>
          <Button
            variant={mode === 'source' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setMode('source')}
          >
            <Code className="h-3.5 w-3.5" />
            源码
          </Button>
          {mode !== 'edit' ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={handleEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </Button>
          ) : (
            <>
              {dirty && <span className="size-2 rounded-full bg-amber-500" title="未保存" />}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleSave}
                disabled={saveStatus === 'saving' || !dirty}
              >
                <Save className="h-3.5 w-3.5" />
                保存
              </Button>
            </>
          )}
          <span className="ml-1 text-xs text-muted-foreground">
            {saveStatus === 'saving' && '保存中…'}
            {saveStatus === 'saved' && '✓ 已保存'}
            {saveStatus === 'error' && '✗ 保存失败'}
          </span>
        </div>
      </div>

      {mode === 'preview' ? (
        <iframe srcDoc={editedContent ?? body} className="flex-1 border-0" title="HTML Preview" />
      ) : mode === 'source' ? (
        <div className="flex-1 min-h-0 overflow-auto">
          <CodeBlockWithCopy
            language="html"
            code={editedContent ?? body}
            style={codeStyle}
            customStyle={{ height: '100%' }}
            showLineNumbers
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <textarea
            value={content}
            onChange={(e) => updateContent(repo, path, e.target.value)}
            className="h-full w-full resize-none bg-background p-3 font-mono text-sm leading-[1.5] outline-none"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  )
}