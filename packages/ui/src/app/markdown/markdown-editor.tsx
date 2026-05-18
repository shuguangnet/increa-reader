import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Heading1, Heading2, Heading3,
  Link, Code, List, Quote, Eye, Save,
} from 'lucide-react'
import { MarkdownViewer } from './markdown-viewer'
import { useEditorStore } from '@/stores/editor-store'
import { saveFile } from '@/app/api'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'

type ToolbarAction = {
  icon: React.ReactNode
  label: string
  prefix: string
  suffix: string
  block?: boolean
}

const TOOLBAR: ToolbarAction[] = [
  { icon: <Bold size={15} />, label: 'Bold', prefix: '**', suffix: '**' },
  { icon: <Italic size={15} />, label: 'Italic', prefix: '*', suffix: '*' },
  { icon: <Heading1 size={15} />, label: 'H1', prefix: '# ', suffix: '' },
  { icon: <Heading2 size={15} />, label: 'H2', prefix: '## ', suffix: '' },
  { icon: <Heading3 size={15} />, label: 'H3', prefix: '### ', suffix: '' },
  { icon: <Link size={15} />, label: 'Link', prefix: '[', suffix: '](url)' },
  { icon: <Code size={15} />, label: 'Code', prefix: '`', suffix: '`' },
  { icon: <Code size={15} />, label: 'CodeBlock', prefix: '```\n', suffix: '\n```', block: true },
  { icon: <List size={15} />, label: 'List', prefix: '- ', suffix: '' },
  { icon: <Quote size={15} />, label: 'Quote', prefix: '> ', suffix: '' },
]

type Props = { repo: string; path: string; initialContent: string }

const EMPTY_SET = new Set<HTMLElement>()

export function MarkdownEditor({ repo, path, initialContent }: Props) {
  const updateContent = useEditorStore(s => s.updateContent)
  const markSaved = useEditorStore(s => s.markSaved)
  const setEditMode = useEditorStore(s => s.setEditMode)
  const openFile = useEditorStore(s => s.openFile)
  const fileState = useEditorStore(s => s.editedFiles[`${repo}:${path}`])
  const content = fileState?.content ?? initialContent

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewElementsRef = useRef(EMPTY_SET)

  useEffect(() => {
    if (!fileState) openFile(repo, path, initialContent)
  }, [repo, path, initialContent, fileState, openFile])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => updateContent(repo, path, e.target.value),
    [repo, path, updateContent],
  )

  const handleInsert = useCallback(
    (action: ToolbarAction) => {
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const selected = content.slice(start, end)
      const replacement = action.block && !selected
        ? `${action.prefix}code${action.suffix}`
        : `${action.prefix}${selected || 'text'}${action.suffix}`
      const next = content.slice(0, start) + replacement + content.slice(end)
      updateContent(repo, path, next)
      requestAnimationFrame(() => {
        ta.focus()
        const pos = start + action.prefix.length
        ta.setSelectionRange(pos, pos + (selected || 'text').length)
      })
    },
    [content, repo, path, updateContent],
  )

  const handleSave = useCallback(async () => {
    const { isDirty } = useEditorStore.getState()
    if (!isDirty(repo, path)) return
    setSaveStatus('saving')
    try {
      await saveFile(repo, path, content)
      markSaved(repo, path)
      setSaveStatus('saved')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }, [repo, path, content, markSaved])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleSave])

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  const lines = content.split('\n')
  const lineCount = lines.length
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0
  const dirty = fileState ? fileState.content !== fileState.originalContent : false

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-0.5 border-b px-2 py-1 bg-muted/30">
        {TOOLBAR.map(a => (
          <button
            key={a.label}
            type="button"
            title={a.label}
            onClick={() => handleInsert(a)}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {a.icon}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {dirty && <span className="size-2 rounded-full bg-amber-500" title="未保存" />}
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === 'saving' || !dirty}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            title="保存 (Ctrl+S)"
          >
            <Save size={15} />
          </button>
          <button
            type="button"
            onClick={() => setEditMode(false)}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="预览模式"
          >
            <Eye size={15} />
          </button>
        </div>
      </div>

      {/* Editor area */}
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={50} minSize={25}>
          <div className="flex h-full">
            {/* Line numbers */}
            <div className="shrink-0 select-none overflow-hidden border-r bg-muted/20 px-2 py-2 text-right font-mono text-xs leading-[1.5] text-muted-foreground">
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleChange}
              className="flex-1 resize-none bg-background p-2 font-mono text-sm leading-[1.5] outline-none"
              spellCheck={false}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50} minSize={20}>
          <div className="h-full overflow-auto">
            <MarkdownViewer
              body={content}
              repoName={repo}
              filePath={path}
              elementsRef={previewElementsRef}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Status bar */}
      <div className="flex shrink-0 items-center gap-3 border-t bg-muted/30 px-3 py-0.5 text-xs text-muted-foreground">
        <span>行 {lineCount}</span>
        <span>词 {wordCount}</span>
        <span className="ml-auto">
          {saveStatus === 'saving' && '保存中…'}
          {saveStatus === 'saved' && '✓ 已保存'}
          {saveStatus === 'error' && '✗ 保存失败'}
        </span>
      </div>
    </div>
  )
}