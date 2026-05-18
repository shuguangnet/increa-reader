import { FileQuestion, History, Pencil, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { MermaidBlock } from '@/components/mermaid-block'
import { useVisibleContent } from '@/contexts/visible-content-context'
import { useNoteToolStore } from '@/stores/note-tool-store'
import { useEditorStore } from '@/stores/editor-store'
import { useRefreshKey } from '@/stores/view-context'
import type { BoardFile } from '@/types/board'
import { fetchPreview } from './api'
import { AiToolsPanel } from './ai-tools-panel'
import { BoardViewer } from './board-viewer'
import { HtmlViewer } from './html-viewer'
import { ImageViewer } from './image-viewer'
import { MarkdownEditor } from './markdown/markdown-editor'
import { MarkdownViewer } from './markdown/markdown-viewer'
import { PDFViewer } from './pdf-viewer'
import { SelectionToolbar } from './selection/selection-toolbar'
import { VersionHistoryPanel } from './version-history-panel'

type PreviewData =
  | { type: 'markdown'; body: string }
  | { type: 'mermaid'; body: string }
  | { type: 'code'; lang: string; body: string }
  | { type: 'image'; path: string }
  | { type: 'pdf'; path: string; metadata: PDFMetadata }
  | { type: 'board'; path: string; data: BoardFile }
  | { type: 'html'; path: string; body: string }
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
}

export function FileViewer({ repo, path }: FileViewerProps) {
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
  const refreshKey = useRefreshKey()
  const scrollBodyRef = useRef<HTMLDivElement>(null)
  const elementsRef = useVisibleContent()
  const fetchedFileRef = useRef<string | null>(null)
  const fetchedRefreshKeyRef = useRef<number | null>(null)
  const fetchIdRef = useRef(0)

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
          setState({ preview: null, loading: false, error: err.message || 'Failed to load file' })
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
    if (!preview || (preview.type !== 'markdown' && preview.type !== 'pdf')) {
      useNoteToolStore.getState().clear()
    }
  }, [preview])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  if (!preview) {
    return null
  }

  if (preview.type === 'html') {
    return <HtmlViewer body={preview.body} />
  }

  const isEditMode = useEditorStore(s => s.isEditMode)
  const editedContent = useEditorStore(s => s.editedFiles[`${repo}:${path}`]?.content)
  const openFile = useEditorStore(s => s.openFile)

  if (preview.type === 'markdown') {
    const displayBody = editedContent ?? preview.body
    return (
      <div className="h-full flex">
        <div className="flex-1 min-w-0 relative">
          {!isEditMode && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setShowAiPanel(v => !v)
                  setShowVersionPanel(false)
                }}
                className={`p-1.5 rounded-md bg-background/80 border border-border backdrop-blur-sm transition-colors ${
                  showAiPanel ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground hover:text-foreground'
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
                }}
                className={`p-1.5 rounded-md bg-background/80 border border-border backdrop-blur-sm transition-colors ${
                  showVersionPanel ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="版本历史"
              >
                <History size={16} />
              </button>
              <button
                type="button"
                onClick={() => openFile(repo, path, displayBody)}
                className="p-1.5 rounded-md bg-background/80 border border-border text-muted-foreground hover:text-foreground backdrop-blur-sm transition-colors"
                title="编辑"
              >
                <Pencil size={16} />
              </button>
            </div>
          )}
          {isEditMode ? (
            <MarkdownEditor repo={repo} path={path} initialContent={displayBody} />
          ) : (
            <MarkdownViewer
              body={displayBody}
              repoName={repo}
              filePath={path}
              elementsRef={elementsRef}
            />
          )}
        </div>
        {showAiPanel && (
          <AiToolsPanel repo={repo} path={path} onClose={() => setShowAiPanel(false)} />
        )}
        {showVersionPanel && (
          <VersionHistoryPanel repo={repo} path={path} onClose={() => setShowVersionPanel(false)} />
        )}
      </div>
    )
  }

  return (
    <div ref={scrollBodyRef} className="h-full overflow-auto scroll-body">
      <SelectionToolbar containerRef={scrollBodyRef} />

      {preview.type === 'code' && (
        <div>
          <SyntaxHighlighter
            language={preview.lang}
            style={vscDarkPlus}
            customStyle={{ margin: 0, height: '100%' }}
          >
            {preview.body}
          </SyntaxHighlighter>
        </div>
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
        <BoardViewer repo={repo} filePath={preview.path} data={preview.data} />
      )}

      {preview.type === 'unsupported' && (
        <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <FileQuestion size={48} />
          <p>Unsupported file type</p>
          <p className="text-sm font-mono">{preview.path}</p>
        </div>
      )}
    </div>
  )
}
