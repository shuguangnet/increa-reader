import { useEffect, useRef, useState } from 'react'

let idCounter = 0

export function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const pre = containerRef.current?.closest('pre')
    if (pre) {
      pre.style.background = 'transparent'
      pre.style.padding = '0'
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const id = `mermaid-${Date.now()}-${idCounter++}`

    // Dynamic import: mermaid is only fetched when a diagram actually appears
    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        fontFamily: '"STIX Two Math", "STIXGeneral", "Trebuchet MS", Verdana, Arial, sans-serif',
      })

      // Mermaid 11.x parser breaks on lines that are exactly `%%` (empty comment).
      // Non-empty `%% foo` comments are fine. Strip the empty ones before rendering.
      const sanitized = code.replace(/^[ \t]*%%[ \t]*$\n?/gm, '')

      try {
        const { svg } = await mermaid.render(id, sanitized)
        if (!cancelled) {
          setHtml(svg)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render mermaid diagram')
          setHtml(null)
        }
      } finally {
        const orphan = document.getElementById(id)
        if (orphan && orphan.parentElement === document.body) orphan.remove()
      }
    })

    return () => {
      cancelled = true
    }
  }, [code])

  if (error) {
    return (
      <div ref={containerRef}>
        <div className="text-xs text-red-500 mb-1">Mermaid render error: {error}</div>
        <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-sm overflow-auto">
          <code>{code}</code>
        </pre>
      </div>
    )
  }

  if (html !== null) {
    return (
      <div
        ref={containerRef}
        className="my-2 overflow-auto rounded-md bg-white p-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  return (
    <div
      ref={containerRef}
      className="my-2 overflow-auto rounded-md bg-white p-4 animate-pulse min-h-[60px] flex items-center justify-center text-muted-foreground text-sm"
    >
      Loading diagram…
    </div>
  )
}
