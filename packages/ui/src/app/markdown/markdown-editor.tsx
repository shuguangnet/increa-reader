"use no memo"

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Heading1, Heading2, Heading3,
  Link, Code, List, Quote, Eye, Save, PenLine, ScrollText,
} from 'lucide-react'
import { MarkdownViewer } from './markdown-viewer'
import { useEditorStore } from '@/stores/editor-store'
import { saveFile } from '@/app/api'
import { showToast } from '@/app/toast'
import { useIsMobile } from '@/hooks/use-mobile'
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
  { icon: <Bold size={15} />, label: '粗体', prefix: '**', suffix: '**' },
  { icon: <Italic size={15} />, label: '斜体', prefix: '*', suffix: '*' },
  { icon: <Heading1 size={15} />, label: '标题1', prefix: '# ', suffix: '' },
  { icon: <Heading2 size={15} />, label: '标题2', prefix: '## ', suffix: '' },
  { icon: <Heading3 size={15} />, label: '标题3', prefix: '### ', suffix: '' },
  { icon: <Link size={15} />, label: '链接', prefix: '[', suffix: '](url)' },
  { icon: <Code size={15} />, label: '代码', prefix: '`', suffix: '`' },
  { icon: <Code size={15} />, label: '代码块', prefix: '```\n', suffix: '\n```', block: true },
  { icon: <List size={15} />, label: '列表', prefix: '- ', suffix: '' },
  { icon: <Quote size={15} />, label: '引用', prefix: '> ', suffix: '' },
]

type Props = { repo: string; path: string; initialContent: string; onExitEdit?: () => void }

const EMPTY_SET = new Set<HTMLElement>()

export function MarkdownEditor({ repo, path, initialContent, onExitEdit }: Props) {
  const updateContent = useEditorStore(s => s.updateContent)
  const markSaved = useEditorStore(s => s.markSaved)
  const editedFiles = useEditorStore(s => s.editedFiles)
  const fileKey = `${repo}:${path}`
  const fileState = editedFiles[fileKey]
  const content = fileState?.content ?? initialContent
  const isMobile = useIsMobile()

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewElementsRef = useRef(EMPTY_SET)
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')

  // Synchronized scrolling between editor and preview
  const editorScrollRef = useRef<HTMLDivElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const syncScrollEnabled = useRef(true)
  const syncScrollSource = useRef<'editor' | 'preview' | null>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 当 fileState 不存在时，用 initialContent 初始化编辑状态
  // 使用 ref 追踪是否已初始化，避免无限循环
  const initializedRef = useRef(false)
  const prevPathRef = useRef(`${repo}:${path}`)
  // 切换文件时重置初始化标记
  if (prevPathRef.current !== `${repo}:${path}`) {
    prevPathRef.current = `${repo}:${path}`
    initializedRef.current = false
  }
  useEffect(() => {
    if (!fileState && !initializedRef.current) {
      initializedRef.current = true
      useEditorStore.getState().openFile(repo, path, initialContent)
    }
    if (fileState) {
      initializedRef.current = true
    }
  }, [repo, path, initialContent, fileState])

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
      showToast('文件已保存', 'success')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
    } catch {
      setSaveStatus('error')
      showToast('保存失败', 'error')
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

  // Synchronized scrolling: when one panel scrolls, the other follows proportionally
  const handleEditorScroll = useCallback(() => {
    if (!syncScrollEnabled.current) return
    if (syncScrollSource.current === 'preview') return
    syncScrollSource.current = 'editor'

    const editorEl = editorScrollRef.current
    const previewEl = previewScrollRef.current
    if (!editorEl || !previewEl) return

    const editorMaxScroll = editorEl.scrollHeight - editorEl.clientHeight
    const previewMaxScroll = previewEl.scrollHeight - previewEl.clientHeight

    if (editorMaxScroll <= 0 || previewMaxScroll <= 0) return

    const ratio = editorEl.scrollTop / editorMaxScroll
    previewEl.scrollTop = ratio * previewMaxScroll

    // Reset sync source after a short delay to allow independent scrolling
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      syncScrollSource.current = null
    }, 100)
  }, [])

  const handlePreviewScroll = useCallback(() => {
    if (!syncScrollEnabled.current) return
    if (syncScrollSource.current === 'editor') return
    syncScrollSource.current = 'preview'

    const editorEl = editorScrollRef.current
    const previewEl = previewScrollRef.current
    if (!editorEl || !previewEl) return

    const editorMaxScroll = editorEl.scrollHeight - editorEl.clientHeight
    const previewMaxScroll = previewEl.scrollHeight - previewEl.clientHeight

    if (editorMaxScroll <= 0 || previewMaxScroll <= 0) return

    const ratio = previewEl.scrollTop / previewMaxScroll
    editorEl.scrollTop = ratio * editorMaxScroll

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      syncScrollSource.current = null
    }, 100)
  }, [])

  const [syncScroll, setSyncScroll] = useState(true)

  // Keep the ref in sync with state
  useEffect(() => {
    syncScrollEnabled.current = syncScroll
  }, [syncScroll])

  const lines = content.split('\n')
  const lineCount = lines.length
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0
  const dirty = fileState ? fileState.content !== fileState.originalContent : false

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className={`flex shrink-0 items-center gap-0.5 border-b px-2 py-1 bg-muted/30 ${isMobile ? 'overflow-x-auto scrollbar-thin' : ''}`}>
        {TOOLBAR.map(a => (
          <button
            key={a.label}
            type="button"
            title={a.label}
            onClick={() => handleInsert(a)}
            className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
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
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            title="保存 (Ctrl+S)"
          >
            <Save size={14} />
            <span>保存</span>
          </button>
          {isMobile ? (
            <>
              <button
                type="button"
                onClick={() => setMobileView(mobileView === 'edit' ? 'preview' : 'edit')}
                className={`rounded p-1.5 transition-colors ${
                  mobileView === 'preview'
                    ? 'text-foreground bg-accent'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
                title={mobileView === 'edit' ? '切换到预览' : '切换到编辑'}
              >
                {mobileView === 'edit' ? <Eye size={15} /> : <PenLine size={15} />}
              </button>
              <div className="mx-0.5 h-4 w-px bg-border" />
              <button
                type="button"
                onClick={() => onExitEdit?.()}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                title="退出编辑"
              >
                <Eye size={14} />
                <span>退出编辑</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSyncScroll(v => !v)}
                className={`rounded p-1.5 transition-colors ${
                  syncScroll
                    ? 'text-foreground bg-accent'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
                title={syncScroll ? '同步滚动已开启' : '同步滚动已关闭'}
              >
                <ScrollText size={15} />
              </button>
              <div className="mx-0.5 h-4 w-px bg-border" />
              <button
                type="button"
                onClick={() => onExitEdit?.()}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                title="退出编辑"
              >
                <Eye size={14} />
                <span>退出编辑</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Editor area */}
      {isMobile ? (
        /* Mobile: tabbed view switching between edit and preview */
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Mobile view toggle */}
          <div className="flex shrink-0 border-b">
            <button
              type="button"
              onClick={() => setMobileView('edit')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                mobileView === 'edit'
                  ? 'border-b-2 border-foreground text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <PenLine size={14} />
              编辑
            </button>
            <button
              type="button"
              onClick={() => setMobileView('preview')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                mobileView === 'preview'
                  ? 'border-b-2 border-foreground text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Eye size={14} />
              预览
            </button>
          </div>

          <div className="flex-1 min-h-0">
            {mobileView === 'edit' ? (
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
            ) : (
              <div className="h-full overflow-auto">
                <MarkdownViewer
                  body={content}
                  repoName={repo}
                  filePath={path}
                  elementsRef={previewElementsRef}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Desktop: resizable side-by-side editor and preview */
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize={50} minSize={25}>
            <div ref={editorScrollRef} onScroll={handleEditorScroll} className="flex h-full overflow-auto">
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
            <div ref={previewScrollRef} onScroll={handlePreviewScroll} className="h-full overflow-auto">
              <MarkdownViewer
                body={content}
                repoName={repo}
                filePath={path}
                elementsRef={previewElementsRef}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      {/* Status bar */}
      <div className="flex shrink-0 items-center gap-3 border-t bg-muted/30 px-3 py-0.5 text-xs text-muted-foreground">
        <span>行 {lineCount}</span>
        <span>词 {wordCount}</span>
        {!isMobile && (
          <span className={syncScroll ? 'text-foreground' : ''}>
            {syncScroll ? '🔗 同步滚动' : '↕ 独立滚动'}
          </span>
        )}
        <span className="ml-auto">
          {saveStatus === 'saving' && '保存中…'}
          {saveStatus === 'saved' && '✓ 已保存'}
          {saveStatus === 'error' && '✗ 保存失败'}
        </span>
      </div>
    </div>
  )
}