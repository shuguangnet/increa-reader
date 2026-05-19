import { apiFetch } from '@/app/api'
import { FileSearch, Loader2, MessageSquare, Sparkles, Tag, X } from 'lucide-react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'

type AiToolsPanelProps = {
  repo: string
  path: string
  onClose: () => void
}

type TabKey = 'summary' | 'tags' | 'ask' | 'related'

const tabs: { key: TabKey; label: string; icon: typeof Sparkles }[] = [
  { key: 'summary', label: '摘要', icon: Sparkles },
  { key: 'tags', label: '标签', icon: Tag },
  { key: 'ask', label: '问答', icon: MessageSquare },
  { key: 'related', label: '相关', icon: FileSearch },
]

export function AiToolsPanel({ repo, path, onClose }: AiToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('summary')

  return (
    <div className="flex flex-col h-full bg-background border-l border-border w-80 min-w-[320px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles size={16} className="text-violet-500" />
          AI 工具
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'summary' && <SummaryTab repo={repo} path={path} />}
        {activeTab === 'tags' && <TagsTab repo={repo} path={path} />}
        {activeTab === 'ask' && <AskTab repo={repo} path={path} />}
        {activeTab === 'related' && <RelatedTab repo={repo} path={path} />}
      </div>
    </div>
  )
}

/* ---------- Summary Tab ---------- */

function SummaryTab({ repo, path }: { repo: string; path: string }) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    setLoading(true)
    setError(null)
    setSummary(null)
    try {
      const res = await apiFetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, path }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '生成摘要失败')
      }
      const data = await res.json()
      setSummary(data.summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成摘要失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-3 space-y-3">
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {loading ? '生成中...' : '生成摘要'}
      </button>

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      )}

      {loading && !summary && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          AI 正在分析文档...
        </div>
      )}

      {summary && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{summary}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

/* ---------- Tags Tab ---------- */

function TagsTab({ repo, path }: { repo: string; path: string }) {
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)

  const suggest = async () => {
    setLoading(true)
    setError(null)
    setTags([])
    try {
      const res = await apiFetch('/api/ai/suggest-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, path }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '获取标签失败')
      }
      const data = await res.json()
      setTags(data.tags ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取标签失败')
    } finally {
      setLoading(false)
    }
  }

  const addTag = async (tag: string) => {
    setAdding(tag)
    try {
      await apiFetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path, repo, tags: [tag] }),
      })
      setTags(prev => prev.filter(t => t !== tag))
    } catch {
      /* ignore */
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="p-3 space-y-3">
      <button
        type="button"
        onClick={suggest}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
        {loading ? '分析中...' : '智能标签'}
      </button>

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              disabled={adding === tag}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/60 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Tag size={10} />
              {tag}
              {adding === tag && <Loader2 size={10} className="animate-spin ml-0.5" />}
            </button>
          ))}
        </div>
      )}

      {tags.length === 0 && !loading && !error && (
        <p className="text-xs text-muted-foreground">点击按钮获取 AI 建议标签，点击标签直接添加到文件</p>
      )}
    </div>
  )
}

/* ---------- Ask Tab ---------- */

function AskTab({ repo, path }: { repo: string; path: string }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ask = async () => {
    if (!question.trim()) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    try {
      const res = await apiFetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, path, question: question.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '提问失败')
      }
      const data = await res.json()
      setAnswer(data.answer)
    } catch (e) {
      setError(e instanceof Error ? e.message : '提问失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex gap-1.5">
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && ask()}
          placeholder="输入问题..."
          className="flex-1 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
        />
        <button
          type="button"
          onClick={ask}
          disabled={loading || !question.trim()}
          className="flex items-center justify-center px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          AI 正在思考...
        </div>
      )}

      {answer && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{answer}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

/* ---------- Related Tab ---------- */

type RelatedDoc = { repo: string; path: string; reason: string }

function RelatedTab({ repo, path }: { repo: string; path: string }) {
  const navigate = useNavigate()
  const [related, setRelated] = useState<RelatedDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const findRelated = async () => {
    setLoading(true)
    setError(null)
    setRelated([])
    try {
      const res = await apiFetch('/api/ai/related', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, path }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '查找相关文档失败')
      }
      const data = await res.json()
      setRelated(data.related ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '查找相关文档失败')
    } finally {
      setLoading(false)
    }
  }

  const navigateToFile = (fRepo: string, fPath: string) => {
    const clean = fPath.startsWith('/') ? fPath.slice(1) : fPath
    navigate(`/views/${fRepo}/${clean}`)
  }

  return (
    <div className="p-3 space-y-3">
      <button
        type="button"
        onClick={findRelated}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
        {loading ? '查找中...' : '找相关文档'}
      </button>

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      )}

      {related.length > 0 && (
        <div className="space-y-2">
          {related.map((doc, i) => (
            <button
              key={`${doc.repo}-${doc.path}-${i}`}
              type="button"
              onClick={() => navigateToFile(doc.repo, doc.path)}
              className="w-full text-left p-2 rounded-md border border-border hover:bg-muted transition-colors group"
            >
              <div className="text-xs font-medium truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                {doc.path}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {doc.reason}
              </div>
            </button>
          ))}
        </div>
      )}

      {related.length === 0 && !loading && !error && (
        <p className="text-xs text-muted-foreground">点击按钮查找与当前文档相关的文件</p>
      )}
    </div>
  )
}