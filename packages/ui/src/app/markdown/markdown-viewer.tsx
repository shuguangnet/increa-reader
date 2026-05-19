import type { ComponentPropsWithoutRef, RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import { ListTree } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CodeBlockWithCopy } from '@/components/code-block-with-copy'
import { MarkdownNotesLayer } from '@/app/notes/markdown-notes-layer'
import { MermaidBlock } from '@/components/mermaid-block'
import { useExternalLinks } from '@/hooks/use-external-links'
import { usePref } from '@/hooks/use-pref'
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from '@/hooks/use-theme'
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

export function MarkdownViewer({ body, repoName, filePath, elementsRef, scrollY, scrollToLine }: MarkdownViewerProps) {
  const pref = usePref('outline')
  const [showOutline, setShowOutline] = useState(() => pref.get('visible', true))
  const markdownRef = useExternalLinks()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const { isDark } = useTheme()
  const codeStyle = isDark ? vscDarkPlus : oneLight

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
  }, [body, elementsRef])

  const toggleOutline = useCallback(() => {
    const next = !showOutline
    setShowOutline(next)
    pref.set('visible', next)
  }, [showOutline, pref])

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
  }, [body, scrollY])

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
        if (el.textContent?.trim().includes(targetLineContent) || targetLineContent.includes(el.textContent?.trim() || '')) {
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
        return <img src={resolveImageSrc(src, repoName, filePath)} alt={alt} {...props} />
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
    [repoName, filePath],
  )

  const outlineVisible = showOutline && headings.length > 0

  return (
    <div className="flex h-full">
      <div ref={scrollRef} className="relative flex-1 min-w-0 overflow-auto scroll-body">
        <div ref={contentRef} className="relative min-h-full">
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

          <MarkdownNotesLayer
            repoName={repoName}
            filePath={filePath}
            contentRef={contentRef}
            markdownRef={markdownRef}
            scrollRef={scrollRef}
          />
        </div>
      </div>
      {outlineVisible && (
        <aside className="shrink-0 h-full max-w-72 border-l border-border overflow-auto">
          <ArticleOutline headings={headings} activeId={activeId} onNavigate={handleNavigate} />
        </aside>
      )}
      {headings.length > 0 && (
        <button
          type="button"
          onClick={toggleOutline}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-background/80 border border-border text-muted-foreground hover:text-foreground backdrop-blur-sm transition-colors"
          title={showOutline ? '隐藏大纲' : '显示大纲'}
        >
          <ListTree size={16} />
        </button>
      )}
    </div>
  )
}
