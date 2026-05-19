import { Check, Copy } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { cn } from '@/lib/utils'

type CodeBlockWithCopyProps = {
  language: string
  code: string
  style: Record<string, React.CSSProperties>
  customStyle?: React.CSSProperties
  showLineNumbers?: boolean
  lineNumberStyle?: React.CSSProperties
}

export function CodeBlockWithCopy({
  language,
  code,
  style,
  customStyle,
  showLineNumbers,
  lineNumberStyle,
}: CodeBlockWithCopyProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = code
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [code])

  return (
    <div className="group/code relative">
      <SyntaxHighlighter
        language={language}
        style={style}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: '0.375rem',
          fontSize: '0.875rem',
          ...customStyle,
        }}
        showLineNumbers={showLineNumbers}
        lineNumberStyle={lineNumberStyle}
      >
        {code}
      </SyntaxHighlighter>
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          'absolute top-2 right-2 p-1.5 rounded-md transition-all',
          'bg-black/40 hover:bg-black/60 text-white/70 hover:text-white',
          'dark:bg-white/10 dark:hover:bg-white/20 dark:text-white/70 dark:hover:text-white',
          'opacity-0 group-hover/code:opacity-100 focus:opacity-100',
          copied && 'opacity-100 bg-emerald-600/80 hover:bg-emerald-600/80',
        )}
        title={copied ? '已复制' : '复制代码'}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}