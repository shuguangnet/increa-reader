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
import { useTheme } from '@/hooks/use-theme'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine, rectangularSelection, crosshairCursor } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'

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

/** Compartments for dynamic reconfiguration */
const themeCompartment = new Compartment()

export function MarkdownEditor({ repo, path, initialContent, onExitEdit }: Props) {
  const updateContent = useEditorStore(s => s.updateContent)
  const markSaved = useEditorStore(s => s.markSaved)
  const editedFiles = useEditorStore(s => s.editedFiles)
  const fileKey = `${repo}:${path}`
  const fileState = editedFiles[fileKey]
  const content = fileState?.content ?? initialContent
  const isMobile = useIsMobile()
  const { isDark } = useTheme()

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const previewElementsRef = useRef(EMPTY_SET)
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')
  const [editorStats, setEditorStats] = useState({ lineCount: 1, wordCount: 0 })

  // Track whether we are in the middle of a programmatic content update
  const isExternalUpdateRef = useRef(false)

  // Synchronized scrolling between editor and preview
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const syncScrollEnabled = useRef(true)
  const syncScrollSource = useRef<'editor' | 'preview' | null>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 当 fileState 不存在时，用 initialContent 初始化编辑状态
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

  // Current content ref for save (avoids stale closure)
  const contentRef = useRef(content)
  contentRef.current = content

  // Save handler
  const handleSave = useCallback(async () => {
    const { isDirty } = useEditorStore.getState()
    if (!isDirty(repo, path)) return
    setSaveStatus('saving')
    try {
      await saveFile(repo, path, contentRef.current)
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
  }, [repo, path, markSaved])

  // Create / manage CodeMirror editor
  useEffect(() => {
    if (!editorContainerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString()
        // Update stats
        const lines = update.state.doc.lines
        const text = newContent.trim()
        const words = text ? text.split(/\s+/).length : 0
        setEditorStats({ lineCount: lines, wordCount: words })

        if (!isExternalUpdateRef.current) {
          updateContent(repo, path, newContent)
        }
      }
    })

    const saveKeymap = keymap.of([{
      key: 'Mod-s',
      run: () => {
        handleSave()
        return true
      },
    }])

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        autocompletion(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        saveKeymap,
        updateListener,
        themeCompartment.of(isDark ? oneDark : []),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '14px',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: 'ui-monospace, monospace',
            lineHeight: '1.5',
          },
          '.cm-content': {
            padding: '8px 0',
          },
          '.cm-gutters': {
            minWidth: '2.5em',
          },
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: editorContainerRef.current,
    })

    editorViewRef.current = view

    // Initial stats
    const lines = view.state.doc.lines
    const text = content.trim()
    const words = text ? text.split(/\s+/).length : 0
    setEditorStats({ lineCount: lines, wordCount: words })

    return () => {
      view.destroy()
      editorViewRef.current = null
    }
    // Only re-create the editor when repo/path changes (file switch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, path])

  // Sync content when it changes externally (e.g. file switch, store update from outside)
  useEffect(() => {
    const view = editorViewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc === content) return
    isExternalUpdateRef.current = true
    view.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: content },
    })
    isExternalUpdateRef.current = false
  }, [content])

  // Sync theme compartment
  useEffect(() => {
    const view = editorViewRef.current
    if (!view) return
    view.dispatch({
      effects: themeCompartment.reconfigure(isDark ? oneDark : []),
    })
  }, [isDark])

  // Toolbar insert via CodeMirror dispatch
  const handleInsert = useCallback(
    (action: ToolbarAction) => {
      const view = editorViewRef.current
      if (!view) return
      const { from, to } = view.state.selection.main
      const selected = view.state.sliceDoc(from, to)
      const replacement = action.block && !selected
        ? `${action.prefix}code${action.suffix}`
        : `${action.prefix}${selected || 'text'}${action.suffix}`
      view.dispatch({
        changes: { from, to, insert: replacement },
        selection: { anchor: from + action.prefix.length, head: from + action.prefix.length + (selected || 'text').length },
      })
      view.focus()
    },
    [],
  )

  // Global Ctrl+S handler (for when editor is not focused)
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

  // Synchronized scrolling: CodeMirror scroll → preview
  useEffect(() => {
    const view = editorViewRef.current
    if (!view) return

    const onScroll = () => {
      if (!syncScrollEnabled.current) return
      if (syncScrollSource.current === 'preview') return
      syncScrollSource.current = 'editor'

      const previewEl = previewScrollRef.current
      if (!previewEl) return

      const scrollDom = view.scrollDOM
      const editorMaxScroll = scrollDom.scrollHeight - scrollDom.clientHeight
      const previewMaxScroll = previewEl.scrollHeight - previewEl.clientHeight

      if (editorMaxScroll <= 0 || previewMaxScroll <= 0) return

      const ratio = scrollDom.scrollTop / editorMaxScroll
      previewEl.scrollTop = ratio * previewMaxScroll

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = setTimeout(() => {
        syncScrollSource.current = null
      }, 100)
    }

    view.scrollDOM.addEventListener('scroll', onScroll)
    return () => {
      view.scrollDOM.removeEventListener('scroll', onScroll)
    }
  }, [repo, path])

  const handlePreviewScroll = useCallback(() => {
    if (!syncScrollEnabled.current) return
    if (syncScrollSource.current === 'editor') return
    syncScrollSource.current = 'preview'

    const view = editorViewRef.current
    const previewEl = previewScrollRef.current
    if (!view || !previewEl) return

    const scrollDom = view.scrollDOM
    const editorMaxScroll = scrollDom.scrollHeight - scrollDom.clientHeight
    const previewMaxScroll = previewEl.scrollHeight - previewEl.clientHeight

    if (editorMaxScroll <= 0 || previewMaxScroll <= 0) return

    const ratio = previewEl.scrollTop / previewMaxScroll
    scrollDom.scrollTop = ratio * editorMaxScroll

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      syncScrollSource.current = null
    }, 100)
  }, [])

  const [syncScroll, setSyncScroll] = useState(true)

  useEffect(() => {
    syncScrollEnabled.current = syncScroll
  }, [syncScroll])

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
              <div ref={editorContainerRef} className="h-full" />
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
            <div ref={editorContainerRef} className="h-full" />
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
        <span>行 {editorStats.lineCount}</span>
        <span>词 {editorStats.wordCount}</span>
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