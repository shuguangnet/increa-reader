"use no memo"

import { AlertTriangle, ArrowLeftRight, Code, Download, Eye, FileQuestion, History, Pencil, RefreshCw, Sparkles, Table } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { CodeBlockWithCopy } from '@/components/code-block-with-copy'
import { ErrorBoundary } from '@/components/error-boundary'
import { MermaidBlock } from '@/components/mermaid-block'
import { useIsMobile } from '@/hooks/use-mobile'
import { useTheme } from '@/hooks/use-theme'
import { useVisibleContent } from '@/contexts/visible-content-context'
import { useNoteToolStore } from '@/stores/note-tool-store'
import { useEditorStore } from '@/stores/editor-store'
import { useProgressStore } from '@/stores/progress-store'
import { useRefreshKey, useViewContext } from '@/stores/view-context'
import type { BoardFile } from '@/types/board'
import { fetchPreview, saveFile } from './api'
import { AiToolsPanel } from './ai-tools-panel'
import { BacklinksPanel } from './backlinks-panel'
import { ExportImportPanel } from './export-import-panel'
import { HtmlViewer } from './html-viewer'
import { ImageViewer } from './image-viewer'
import { InlineTagsEditor } from './inline-tags-editor'
import { MarkdownEditor } from './markdown/markdown-editor'
import { MarkdownViewer } from './markdown/markdown-viewer'
import { PDFViewer } from './pdf-viewer'
import { SelectionToolbar } from './selection/selection-toolbar'
import { TableView, parseCSV } from './table-view'
import { VersionHistoryPanel } from './version-history-panel'

const BoardViewer = React.lazy(() =>
  import('./board-viewer/board-viewer').then(m => ({ default: m.BoardViewer })),
)

type PreviewData =
  | { type: 'markdown'; body: string }
  | { type: 'mermaid'; body: string }
  | { type: 'code'; lang: string; body: string }
  | { type: 'image'; path: string }
  | { type: 'pdf'; path: string; metadata: PDFMetadata }
  | { type: 'board'; path: string; data: BoardFile }
  | { type: 'html'; path: string; body: string }
  | { type: 'table'; format: string; body: string }
  | { type: 'unsupported'; path: string }

type PDFMetadata = {
  page_count: number
  title: string
  author: string
  subject: string
  creator: string
  producer: string
  creation_date: string
  modification_date: string
  encrypted: boolean
}

type FileViewerProps = {
  repo: string
  path: string
  scrollToLine?: number
}

/** Full-screen overlay wrapper for side panels on mobile */
function MobilePanelOverlay({ children }: {
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background md:hidden">
      <div className="flex-1 min-h-0 overflow-auto">
        {children}
      </div>
    </div>
  )
}

/** Code viewer with line numbers that supports scrolling to a specific line */
function CodeViewerWithLines({ language, code, scrollToLine }: { language: string; code: string; scrollToLine?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { isDark } = useTheme()
  const codeStyle = isDark ? vscDarkPlus : oneLight

  useEffect(() => {
    if (!scrollToLine || !containerRef.current) return
    const timer = setTimeout(() => {
      // react-syntax-highlighter with showLineNumbers renders lines as <span> inside the code block
      // We try to find the line by searching the line number cells
      const codeBlock = containerRef.current?.querySelector('pre code')
      if (!codeBlock) return
      // Each line in SyntaxHighlighter is a <div> or a flat structure
      // With showLineNumbers, line numbers are in spans with class "linenumber"
      // A more reliable approach: find the line with the matching line number text
      const lineElements = codeBlock.querySelectorAll('.react-syntax-highlighter-line-number')
      for (const el of lineElements) {
        if (el.textContent?.trim() === String(scrollToLine)) {
          const row = el.parentElement
          if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' })
            row.classList.add('ring-2', 'ring-yellow-400', 'rounded')
            setTimeout(() => {
              row.classList.remove('ring-2', 'ring-yellow-400', 'rounded')
            }, 3000)
          }
          return
        }
      }
      // Fallback: approximate scroll position based on line height
      containerRef.current?.scrollTo({
        top: Math.max(0, (scrollToLine - 5) * 24),
        behavior: 'smooth',
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [scrollToLine])

  return (
    <div ref={containerRef}>
      <CodeBlockWithCopy
        language={language}
        code={code}
        style={codeStyle}
        showLineNumbers
        lineNumberStyle={{ opacity: 0.5, userSelect: 'none', minWidth: '3.5em' }}
      />
    </div>
  )
}
export function FileViewer({ repo, path, scrollToLine }: FileViewerProps) {
  const [state, setState] = useState<{
    preview: PreviewData | null
    loading: boolean
    error: string | null
  }>({
    preview: null,
    loading: true,
    error: null,
  })
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [showVersionPanel, setShowVersionPanel] = useState(false)
  const [showExportPanel, setShowExportPanel] = useState(false)
  const [showBacklinksPanel, setShowBacklinksPanel] = useState(false)
  const refreshKey = useRefreshKey()
  const requestRefresh = useViewContext(s => s.requestRefresh)
  const scrollBodyRef = useRef<HTMLDivElement>(null)
  const elementsRef = useVisibleContent()
  const fetchedFileRef = useRef<string | null>(null)
  const fetchedRefreshKeyRef = useRef<number | null>(null)
  const fetchIdRef = useRef(0)

  // 编辑模式用组件内 state 管理，完全绕过 React Compiler 对 Zustand selector 的缓存问题
  const [isEditMode, setIsEditMode] = useState(false)
  const editedFiles = useEditorStore(s => s.editedFiles)
  const editedContent = editedFiles[`${repo}:${path}`]?.content
  const isMobile = useIsMobile()
  const updateProgress = useProgressStore(s => s.updateProgress)
  const getProgress = useProgressStore(s => s.getProgress)

  useEffect(() => {
    if (!repo || !path) return

    const fileKey = `${repo}:${path}`
    const isSameFetch =
      fetchedFileRef.current === fileKey && fetchedRefreshKeyRef.current === refreshKey
    if (isSameFetch) return

    const isRouteChange = fetchedFileRef.current !== fileKey
    fetchedFileRef.current = fileKey
    fetchedRefreshKeyRef.current = refreshKey

    if (isRouteChange) {
      setState({ preview: null, loading: true, error: null })
      // 切换文件时重置编辑模式
      setIsEditMode(false)
    }

    const id = ++fetchIdRef.current
    fetchPreview(repo, path)
      .then(data => {
        if (id === fetchIdRef.current) {
          setState({ preview: data, loading: false, error: null })
        }
      })
      .catch(err => {
        if (id === fetchIdRef.current) {
          setState({ preview: null, loading: false, error: err.message || '加载文件失败' })
        }
      })
  }, [repo, path, refreshKey])

  // Setup IntersectionObserver to track visible elements
  useEffect(() => {
    const scrollBody = scrollBodyRef.current
    if (!scrollBody) return

    const elementsSet = elementsRef.current
    const observedElements = new Set<HTMLElement>()

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            elementsSet.add(entry.target as HTMLElement)
          } else {
            elementsSet.delete(entry.target as HTMLElement)
          }
        })
      },
      {
        root: scrollBody,
        rootMargin: '100px',
        threshold: 0.1,
      },
    )

    // Observe target elements (prose content, code blocks, PDF pages)
    const targets = scrollBody.querySelectorAll('.prose > *, pre, code, [data-index]')
    targets.forEach(el => {
      observer.observe(el)
      observedElements.add(el as HTMLElement)
    })

    return () => {
      observer.disconnect()
      observedElements.forEach(el => {
        elementsSet.delete(el)
      })
    }
  }, [state.preview, elementsRef])

  const { loading, error, preview } = state
  useEffect(() => {
    if (!preview || !repo || !path) return
    const el = scrollBodyRef.current
    if (!el) return

    let rafId = 0
    const handleScroll = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const scrollTop = el.scrollTop
        const scrollHeight = el.scrollHeight - el.clientHeight
        const percent = scrollHeight > 0 ? Math.min(1, scrollTop / scrollHeight) : 0
        updateProgress(repo, path, percent, Math.round(scrollTop))
      })
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', handleScroll)
      cancelAnimationFrame(rafId)
    }
  }, [preview, repo, path, updateProgress])

  // Restore scroll position when opening a file
  useEffect(() => {
    if (!preview || !repo || !path) return
    const el = scrollBodyRef.current
    if (!el) return

    const savedProgress = getProgress(repo, path)
    if (savedProgress && savedProgress.scrollY > 50) {
      // Use requestAnimationFrame to wait for content to render
      const raf = requestAnimationFrame(() => {
        // For markdown/PDF, content renders asynchronously, so use a small delay
        const timer = setTimeout(() => {
          if (el) {
            const maxScroll = el.scrollHeight - el.clientHeight
            if (maxScroll > 0 && savedProgress.scrollY <= maxScroll) {
              el.scrollTop = savedProgress.scrollY
            }
          }
        }, 150)
        return () => clearTimeout(timer)
      })
      return () => cancelAnimationFrame(raf)
    }
  }, [preview, repo, path, getProgress])

  useEffect(() => {
    if (!preview || (preview.type !== 'markdown' && preview.type !== 'pdf')) {
      useNoteToolStore.getState().clear()
    }
  }, [preview])

  // Scroll to a specific line number (from search results) - handled by child viewers
  // (MarkdownViewer and CodeViewerWithLines each have their own scrollToLine logic)

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6">
        <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/40">
          <AlertTriangle className="size-6 text-red-600 dark:text-red-400" />
        </div>
        <p className="text-sm text-red-600 dark:text-red-400 text-center max-w-md">文件加载失败</p>
        <p className="text-xs text-muted-foreground text-center max-w-md">{error}</p>
        <button
          type="button"
          onClick={() => requestRefresh()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="size-3.5" />
          重试
        </button>
      </div>
    )
  }

  if (!preview) {
    return null
  }

  if (preview.type === 'html') {
    const displayBody = editedContent ?? preview.body
    return <HtmlViewer body={displayBody} repo={repo} path={path} />
  }

  if (preview.type === 'markdown') {
    const displayBody = editedContent ?? preview.body

    // On mobile, side panels display as fullscreen overlays
    const panelOverlay = isMobile && (showAiPanel || showExportPanel || showVersionPanel || showBacklinksPanel)

    return (
      <div className="h-full flex">
        <div className={`flex-1 min-w-0 flex flex-col ${panelOverlay ? 'hidden md:flex' : ''}`}>
          {!isEditMode && (
            <div className="flex shrink-0 items-center gap-1 border-b bg-muted/30 px-3 py-1">
              <span className="text-sm font-medium truncate max-w-48">{path.split('/').pop()}</span>
              <InlineTagsEditor repo={repo} path={path} />
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowBacklinksPanel(v => !v)
                    setShowAiPanel(false)
                    setShowVersionPanel(false)
                    setShowExportPanel(false)
                  }}
                  className={`p-1.5 rounded-md transition-colors ${
                    showBacklinksPanel ? 'text-amber-600 dark:text-amber-400 bg-accent' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  title="链接关系"
                >
                  <ArrowLeftRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowExportPanel(v => !v)
                    setShowAiPanel(false)
                    setShowVersionPanel(false)
                    setShowBacklinksPanel(false)
                  }}
                  className={`p-1.5 rounded-md transition-colors ${
                    showExportPanel ? 'text-emerald-600 dark:text-emerald-400 bg-accent' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  title="导出/导入"
                >
                  <Download size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAiPanel(v => !v)
                    setShowVersionPanel(false)
                    setShowExportPanel(false)
                    setShowBacklinksPanel(false)
                  }}
                  className={`p-1.5 rounded-md transition-colors ${
                    showAiPanel ? 'text-violet-600 dark:text-violet-400 bg-accent' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  title="AI工具"
                >
                  <Sparkles size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowVersionPanel(v => !v)
                    setShowAiPanel(false)
                    setShowExportPanel(false)
                    setShowBacklinksPanel(false)
                  }}
                  className={`p-1.5 rounded-md transition-colors ${
                    showVersionPanel ? 'text-blue-600 dark:text-blue-400 bg-accent' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  title="版本历史"
                >
                  <History size={16} />
                </button>
                <div className="mx-1 h-4 w-px bg-border" />
                <button
                  type="button"
                  onClick={() => {
                    // 进入编辑模式：确保 store 中有文件数据，然后切换到编辑视图
                    const key = `${repo}:${path}`
                    const existing = useEditorStore.getState().editedFiles[key]
                    if (!existing) {
                      useEditorStore.getState().openFile(repo, path, preview.body)
                    }
                    setIsEditMode(true)
                  }}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="编辑"
                >
                  <Pencil size={14} />
                  <span>编辑</span>
                </button>
              </div>
            </div>
          )}
          {isEditMode ? (
            <div className="flex-1 min-h-0">
              <MarkdownEditor repo={repo} path={path} initialContent={displayBody} onExitEdit={() => setIsEditMode(false)} />
            </div>
          ) : (
            <ErrorBoundary>
              <div ref={scrollBodyRef} className="flex-1 min-h-0 overflow-auto scroll-body">
                <MarkdownViewer
                  body={displayBody}
                  repoName={repo}
                  filePath={path}
                  elementsRef={elementsRef}
                  scrollY={getProgress(repo, path)?.scrollY}
                  scrollToLine={scrollToLine}
                />
              </div>
            </ErrorBoundary>
          )}
        </div>
        {showAiPanel && (
          isMobile ? (
            <MobilePanelOverlay>
              <AiToolsPanel repo={repo} path={path} onClose={() => setShowAiPanel(false)} />
            </MobilePanelOverlay>
          ) : (
            <AiToolsPanel repo={repo} path={path} onClose={() => setShowAiPanel(false)} />
          )
        )}
        {showExportPanel && (
          isMobile ? (
            <MobilePanelOverlay>
              <ExportImportPanel repo={repo} path={path} onClose={() => setShowExportPanel(false)} />
            </MobilePanelOverlay>
          ) : (
            <ExportImportPanel repo={repo} path={path} onClose={() => setShowExportPanel(false)} />
          )
        )}
        {showVersionPanel && (
          isMobile ? (
            <MobilePanelOverlay>
              <VersionHistoryPanel repo={repo} path={path} onClose={() => setShowVersionPanel(false)} />
            </MobilePanelOverlay>
          ) : (
            <VersionHistoryPanel repo={repo} path={path} onClose={() => setShowVersionPanel(false)} />
          )
        )}
        {showBacklinksPanel && (
          isMobile ? (
            <MobilePanelOverlay>
              <BacklinksPanel repo={repo} path={path} onClose={() => setShowBacklinksPanel(false)} />
            </MobilePanelOverlay>
          ) : (
            <BacklinksPanel repo={repo} path={path} onClose={() => setShowBacklinksPanel(false)} />
          )
        )}
      </div>
    )
  }

  // For code files: show edit button and support edit mode
  if (isEditMode && preview.type === 'code') {
    const displayBody = editedContent ?? preview.body
    return (
      <div className="h-full flex flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1 bg-muted/30">
          <Code size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium">{path.split('/').pop()}</span>
          <span className="text-xs text-muted-foreground truncate max-w-48">{preview.lang}</span>
          <div className="ml-auto flex items-center gap-1">
            <span className="text-xs text-muted-foreground">编辑模式</span>
            <button
              type="button"
              onClick={() => setIsEditMode(false)}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="预览模式"
            >
              <Eye size={15} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <textarea
            value={displayBody}
            onChange={(e) => useEditorStore.getState().updateContent(repo, path, e.target.value)}
            className="h-full w-full resize-none bg-background p-3 font-mono text-sm leading-[1.5] outline-none"
            spellCheck={false}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      <div ref={scrollBodyRef} className={`flex-1 overflow-auto scroll-body ${showBacklinksPanel && !isMobile ? 'min-w-0' : ''}`}>
        <SelectionToolbar containerRef={scrollBodyRef} />

        {/* Edit button for code files */}
        {preview.type === 'code' && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setShowBacklinksPanel(v => !v)
              }}
              className={`p-1.5 rounded-md bg-background/80 border border-border backdrop-blur-sm transition-colors ${
                showBacklinksPanel ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="链接关系"
            >
              <ArrowLeftRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                const key = `${repo}:${path}`
                const existing = useEditorStore.getState().editedFiles[key]
                if (!existing) {
                  useEditorStore.getState().openFile(repo, path, preview.body)
                }
                setIsEditMode(true)
              }}
              className="p-1.5 rounded-md bg-background/80 border border-border text-muted-foreground hover:text-foreground backdrop-blur-sm transition-colors"
              title="编辑"
            >
              <Pencil size={16} />
            </button>
          </div>
        )}

      {preview.type === 'code' && !isEditMode && (
        <CodeViewerWithLines language={preview.lang} code={preview.body} scrollToLine={scrollToLine} />
      )}

      {preview.type === 'mermaid' && (
        <div className="p-4">
          <MermaidBlock code={preview.body} />
        </div>
      )}

      {preview.type === 'image' && (
        <ImageViewer src={`/api/raw/${repo}/${preview.path}`} alt={preview.path} />
      )}

      {preview.type === 'pdf' && (
        <PDFViewer repo={repo} filePath={preview.path} metadata={preview.metadata} />
      )}

      {preview.type === 'board' && (
        <React.Suspense fallback={null}>
          <BoardViewer repo={repo} filePath={preview.path} data={preview.data} />
        </React.Suspense>
      )}

      {preview.type === 'table' && (() => {
        const { headers, data } = preview.format === 'csv'
          ? parseCSV(preview.body)
          : { headers: [] as string[], data: [] as string[][] }
        const handleTableSave = (newData: string[][]) => {
          const csvContent = [headers.join(','), ...newData.map(row => row.join(','))].join('\n')
          saveFile(repo, path, csvContent).catch(console.error)
        }
        return (
          <div className="h-full flex flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-2 bg-muted/30">
              <Table className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{path.split('/').pop()}</span>
              <span className="text-xs text-muted-foreground">
                {data.length} 行 × {headers.length} 列
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <TableView headers={headers} data={data} onSave={handleTableSave} />
            </div>
          </div>
        )
      })()}

      {preview.type === 'unsupported' && (
        <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <FileQuestion size={48} />
          <p>不支持的文件类型</p>
          <p className="text-sm font-mono">{preview.path}</p>
        </div>
      )}
      </div>
      {showBacklinksPanel && (
        isMobile ? (
          <MobilePanelOverlay>
            <BacklinksPanel repo={repo} path={path} onClose={() => setShowBacklinksPanel(false)} />
          </MobilePanelOverlay>
        ) : (
          <BacklinksPanel repo={repo} path={path} onClose={() => setShowBacklinksPanel(false)} />
        )
      )}
    </div>
  )
}
