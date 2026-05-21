import type { ComponentPropsWithoutRef, RefObject } from 'react'
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import { AlertTriangle, ListTree, RefreshCw, X } from 'lucide-react'
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { MarkdownNotesLayer } from '@/app/notes/markdown-notes-layer'
import { CodeBlockWithCopy } from '@/components/code-block-with-copy'
import { MermaidBlock } from '@/components/mermaid-block'
import { useExternalLinks } from '@/hooks/use-external-links'
import { useIsMobile } from '@/hooks/use-mobile'
import { usePref } from '@/hooks/use-pref'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'
import { ArticleOutline } from './article-outline'
import { parseHeadings } from './heading-utils'
import { useHeadingObserver } from './use-heading-observer'

type MarkdownViewerProps = {
  body: string
  repoName: string
  filePath: string
  elementsRef: RefObject<Set<HTMLElement>>
  scrollY?: number
  scrollToLine?: number
}

/** Local error boundary for markdown rendering errors */
class MarkdownRenderErrorBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onError: (error: Error) => void }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(_error: Error) {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MarkdownViewer] Rendering error:', error, info.componentStack)
    this.props.onError(error)
  }

  render() {
    if (this.state.hasError) {
      return null // Parent handles display
    }
    return this.props.children
  }
}

function resolveImageSrc(
  src: string | undefined,
  repo: string,
  currentPath: string,
): string | undefined {
  if (!src) return src
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) return src
  const dir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1)
  const resolved = new URL(src, `http://x/${dir}`).pathname.slice(1)
  return `/api/raw/${repo}/${resolved}`
}

export function MarkdownViewer({
  body,
  repoName,
  filePath,
  elementsRef,
  scrollY,
  scrollToLine,
}: MarkdownViewerProps) {
  const pref = usePref('outline')
  const isMobile = useIsMobile()
  // On mobile, outline is hidden by default and shown as overlay; on desktop, visible by default as sidebar
  const [showOutline, setShowOutline] = useState(() =>
    isMobile ? false : pref.get('visible', true),
  )
  const markdownRef = useExternalLinks()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const { isDark } = useTheme()
  const codeStyle = isDark ? vscDarkPlus : oneLight
  const [markdownError, setMarkdownError] = useState<Error | null>(null)

  const headings = useMemo(() => parseHeadings(body), [body])
  const activeId = useHeadingObserver(scrollRef, headings)

  // Assign IDs to rendered heading elements from parseHeadings (single source of truth)
  useEffect(() => {
    const container = markdownRef.current
    if (!container) return
    const els = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    els.forEach((el, i) => {
      if (headings[i]) el.id = headings[i].id
    })
  }, [headings, markdownRef])

  // IntersectionObserver for visible content tracking (chat/LLM feature)
  useEffect(() => {
    const scrollBody = scrollRef.current
    if (!scrollBody) return
    const elements = elementsRef.current
    elements.clear()
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            elementsRef.current.add(entry.target as HTMLElement)
          } else {
            elementsRef.current.delete(entry.target as HTMLElement)
          }
        }
      },
      { root: scrollBody, rootMargin: '100px', threshold: 0.1 },
    )
    const targets = scrollBody.querySelectorAll('.prose > *, pre, code')
    targets.forEach(el => {
      observer.observe(el)
    })
    return () => {
      observer.disconnect()
      elements.clear()
    }
  }, [elementsRef])

  const toggleOutline = useCallback(() => {
    const next = !showOutline
    setShowOutline(next)
    if (!isMobile) {
      pref.set('visible', next)
    }
  }, [showOutline, pref, isMobile])

  const handleNavigateAndCloseMobile = useCallback(
    (id: string) => {
      const el = scrollRef.current?.querySelector(`#${CSS.escape(id)}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // On mobile, close the outline drawer after navigation
      if (isMobile) {
        setShowOutline(false)
      }
    },
    [isMobile],
  )

  // Restore scroll position after content renders
  useEffect(() => {
    if (!scrollY || scrollY < 50) return
    const el = scrollRef.current
    if (!el) return
    const timer = setTimeout(() => {
      const maxScroll = el.scrollHeight - el.clientHeight
      if (maxScroll > 0 && scrollY <= maxScroll) {
        el.scrollTop = scrollY
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [scrollY])

  // Scroll to a specific source line number (from search results)
  useEffect(() => {
    if (!scrollToLine || !scrollRef.current) return
    const container = scrollRef.current
    const lines = body.split('\n')
    if (scrollToLine > lines.length) return
    // Find the content at that line to locate it in the rendered output
    const targetLineContent = lines[scrollToLine - 1]?.trim()
    if (!targetLineContent) return
    const timer = setTimeout(() => {
      // Search for elements containing text that matches the line
      const allElements = container.querySelectorAll('.prose > *')
      for (const el of allElements) {
        if (
          el.textContent?.trim().includes(targetLineContent) ||
          targetLineContent.includes(el.textContent?.trim() || '')
        ) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('ring-2', 'ring-yellow-400', 'rounded', 'transition-all')
          setTimeout(() => {
            el.classList.remove('ring-2', 'ring-yellow-400', 'rounded', 'transition-all')
          }, 3000)
          return
        }
      }
      // Fallback: approximate scroll based on line position within total lines
      const ratio = (scrollToLine - 1) / lines.length
      const maxScroll = container.scrollHeight - container.clientHeight
      if (maxScroll > 0) {
        container.scrollTo({ top: ratio * maxScroll, behavior: 'smooth' })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [scrollToLine, body])

  const handleNavigate = useCallback((id: string) => {
    const el = scrollRef.current?.querySelector(`#${CSS.escape(id)}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const components = useMemo(
    () => ({
      img({ src, alt, ...props }: ComponentPropsWithoutRef<'img'>) {
        return (
          <img src={resolveImageSrc(src, repoName, filePath)} alt={alt} loading="lazy" {...props} />
        )
      },
      code({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
        const match = /language-(\w+)/.exec(className || '')
        if (match?.[1] === 'mermaid') {
          return <MermaidBlock code={String(children).replace(/\n$/, '')} />
        }
        if (match) {
          return (
            <CodeBlockWithCopy
              language={match[1]}
              code={String(children).replace(/\n$/, '')}
              style={codeStyle}
            />
          )
        }
        return (
          <code
            className={cn(
              'font-mono text-sm bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded',
              className,
            )}
            {...props}
          >
            {children}
          </code>
        )
      },
    }),
    [repoName, filePath, codeStyle],
  )

  const outlineVisible = showOutline && headings.length > 0

  // Show error fallback when markdown rendering fails
  if (markdownError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 max-w-md text-center">
          <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/40">
            <AlertTriangle className="size-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Markdown 渲染失败</h3>
          <p className="text-xs text-muted-foreground">{markdownError.message}</p>
          <button
            type="button"
            onClick={() => setMarkdownError(null)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="size-3.5" />
            重试
          </button>
          <details className="w-full text-left">
            <summary className="text-xs text-muted-foreground cursor-pointer">查看原始内容</summary>
            <pre className="mt-2 max-h-60 overflow-auto rounded border bg-muted/50 p-2 text-[10px] font-mono whitespace-pre-wrap break-words">
              {body}
            </pre>
          </details>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <div ref={scrollRef} className="relative flex-1 min-w-0 overflow-auto scroll-body">
        <div ref={contentRef} className="relative min-h-full">
          <MarkdownRenderErrorBoundary onError={(err: Error) => setMarkdownError(err)}>
            <div
              ref={markdownRef}
              className="prose prose-slate dark:prose-invert max-w-none p-4 prose-headings:text-lg prose-headings:my-2 prose-h1:text-2xl prose-h1:my-3 prose-h2:text-xl prose-h2:my-2.5 prose-h3:text-lg prose-h3:my-2 prose-h4:text-base prose-h4:my-1.5 prose-h5:text-sm prose-h5:my-1 prose-h6:text-xs prose-h6:my-1 prose-p:my-2.5 prose-p:leading-relaxed prose-pre:bg-transparent prose-pre:p-0 prose-pre:border-0"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={components}
              >
                {body}
              </ReactMarkdown>
            </div>
          </MarkdownRenderErrorBoundary>

          <MarkdownNotesLayer
            repoName={repoName}
            filePath={filePath}
            contentRef={contentRef}
            markdownRef={markdownRef}
            scrollRef={scrollRef}
          />
        </div>
      </div>

      {/* Desktop: sidebar outline */}
      {outlineVisible && !isMobile && (
        <aside className="shrink-0 h-full max-w-72 border-l border-border overflow-auto">
          <ArticleOutline headings={headings} activeId={activeId} onNavigate={handleNavigate} />
        </aside>
      )}

      {/* Mobile: bottom sheet outline drawer */}
      {outlineVisible && isMobile && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowOutline(false)} />
          <div
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-white dark:bg-gray-900 rounded-t-xl shadow-2xl animate-in slide-in-from-bottom duration-200 safe-top"
            style={{ maxHeight: '60dvh' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2">
              <span className="text-sm font-semibold flex items-center gap-1.5">
                <ListTree className="size-4" />
                文章大纲
              </span>
              <button
                type="button"
                onClick={() => setShowOutline(false)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
            {/* Outline content */}
            <div className="flex-1 overflow-auto overscroll-contain px-2 pb-4 safe-bottom">
              <ArticleOutline
                headings={headings}
                activeId={activeId}
                onNavigate={handleNavigateAndCloseMobile}
              />
            </div>
          </div>
        </>
      )}

      {/* Outline toggle button */}
      {headings.length > 0 && (
        <button
          type="button"
          onClick={toggleOutline}
          className={cn(
            'absolute z-10 p-1.5 rounded-md transition-colors',
            isMobile
              ? 'bottom-3 right-3 bg-primary text-primary-foreground shadow-lg touch-target'
              : 'top-2 right-2 bg-background/80 border border-border text-muted-foreground hover:text-foreground backdrop-blur-sm',
          )}
          title={showOutline ? '隐藏大纲' : '显示大纲'}
        >
          <ListTree size={isMobile ? 18 : 16} />
        </button>
      )}
    </div>
  )
}
