import { apiFetch, saveFile } from '@/app/api'
import { GitCommit, History, Loader2, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { showToast } from '@/app/toast'

type VersionHistoryPanelProps = {
  repo: string
  path: string
  onClose: () => void
}

type Version = {
  hash: string
  message: string
  date: string
  author: string
}

export function VersionHistoryPanel({ repo, path, onClose }: VersionHistoryPanelProps) {
  const isMobile = useIsMobile()
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [noGit, setNoGit] = useState(false)

  // Modal states
  const [viewHash, setViewHash] = useState<string | null>(null)
  const [viewContent, setViewContent] = useState<string | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  // Diff states
  const [diffFrom, setDiffFrom] = useState<string | null>(null)
  const [diffTo, setDiffTo] = useState<string | null>(null)
  const [diffContent, setDiffContent] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [selectingDiff, setSelectingDiff] = useState(false)

  // Restore state
  const [restoring, setRestoring] = useState(false)

  const loadVersions = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNoGit(false)
    try {
      const res = await apiFetch(`/api/versions/${encodeURIComponent(repo)}/${encodeURIComponent(path)}`)
      if (!res.ok) {
        if (res.status === 404) {
          setNoGit(true)
          return
        }
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '加载版本历史失败')
      }
      const data = await res.json()
      setVersions(data.versions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载版本历史失败')
    } finally {
      setLoading(false)
    }
  }, [repo, path])

  useEffect(() => {
    loadVersions()
  }, [loadVersions])

  const viewVersion = async (hash: string) => {
    setViewHash(hash)
    setViewLoading(true)
    setViewContent(null)
    try {
      const res = await apiFetch(
        `/api/versions/${encodeURIComponent(repo)}/${encodeURIComponent(path)}?hash=${hash}`,
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '加载版本内容失败')
      }
      const data = await res.json()
      setViewContent(data.content ?? '')
    } catch (e) {
      setViewContent(e instanceof Error ? e.message : '加载版本内容失败')
    } finally {
      setViewLoading(false)
    }
  }

  const restoreVersion = useCallback(async (_hash: string, content: string) => {
    setRestoring(true)
    try {
      await saveFile(repo, path, content)
      showToast('已恢复到选定版本', 'success')
      setViewHash(null)
      setViewContent(null)
      // Reload versions after restore
      loadVersions()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '恢复版本失败', 'error')
    } finally {
      setRestoring(false)
    }
  }, [repo, path, loadVersions])

  const selectForDiff = (hash: string) => {
    if (diffFrom === null) {
      setDiffFrom(hash)
    } else if (diffTo === null && hash !== diffFrom) {
      setDiffTo(hash)
    }
  }

  const loadDiff = useCallback(async () => {
    if (!diffFrom || !diffTo) return
    setDiffLoading(true)
    setDiffContent(null)
    try {
      const params = new URLSearchParams({ path, from: diffFrom, to: diffTo })
      const res = await apiFetch(`/api/versions/${encodeURIComponent(repo)}/diff?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '加载 diff 失败')
      }
      const data = await res.json()
      setDiffContent(data.diff ?? '')
    } catch (e) {
      setDiffContent(e instanceof Error ? e.message : '加载 diff 失败')
    } finally {
      setDiffLoading(false)
    }
  }, [repo, path, diffFrom, diffTo])

  useEffect(() => {
    if (diffFrom && diffTo) {
      loadDiff()
    }
  }, [diffFrom, diffTo, loadDiff])

  const startDiffMode = () => {
    setSelectingDiff(true)
    setDiffFrom(null)
    setDiffTo(null)
    setDiffContent(null)
  }

  const cancelDiffMode = () => {
    setSelectingDiff(false)
    setDiffFrom(null)
    setDiffTo(null)
    setDiffContent(null)
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  // Mobile: fullscreen overlay
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 safe-top">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <History size={16} className="text-blue-500" />
            版本历史
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors touch-target"
          >
            <X size={16} />
          </button>
        </div>

        {/* Diff selection bar */}
        {selectingDiff && (
          <div className="px-4 py-2 border-b bg-muted/30 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">
                {!diffFrom && '选择旧版本'}
                {diffFrom && !diffTo && '选择新版本'}
                {diffFrom && diffTo && '对比中...'}
              </span>
              <button
                type="button"
                onClick={cancelDiffMode}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors touch-target"
              >
                取消
              </button>
            </div>
            {diffFrom && (
              <div className="text-xs font-mono text-muted-foreground">
                旧: {diffFrom.slice(0, 7)}
              </div>
            )}
            {diffTo && (
              <div className="text-xs font-mono text-muted-foreground">
                新: {diffTo.slice(0, 7)}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto overscroll-contain">
          {loading && (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              加载中...
            </div>
          )}

          {error && (
            <div className="p-4 text-xs text-red-500 dark:text-red-400">{error}</div>
          )}

          {noGit && (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
              <GitCommit size={32} />
              <p className="text-sm">此仓库无版本历史</p>
            </div>
          )}

          {!loading && !error && !noGit && versions.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">暂无提交记录</div>
          )}

          {/* Diff action button */}
          {!loading && versions.length > 1 && !selectingDiff && (
            <div className="px-4 pt-4 shrink-0">
              <button
                type="button"
                onClick={startDiffMode}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors touch-target"
              >
                对比版本
              </button>
            </div>
          )}

          {/* Version list */}
          <div className="divide-y">
            {versions.map(v => {
              const isDiffSelected = selectingDiff && (v.hash === diffFrom || v.hash === diffTo)
              return (
                <div
                  key={v.hash}
                  className={`px-4 py-3 hover:bg-muted transition-colors ${
                    selectingDiff ? 'cursor-pointer active:bg-accent' : ''
                  } ${isDiffSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  onClick={() => selectingDiff && selectForDiff(v.hash)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-blue-600 dark:text-blue-400 shrink-0">
                      {v.hash.slice(0, 7)}
                    </span>
                    {!selectingDiff && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          viewVersion(v.hash)
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 underline touch-target"
                      >
                        查看
                      </button>
                    )}
                  </div>
                  <p className="text-sm mt-0.5 line-clamp-2">{v.message}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{v.author}</span>
                    <span>{formatDate(v.date)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Version content modal - mobile fullscreen */}
        {viewHash && (
          <div className="fixed inset-0 z-50 flex flex-col bg-background">
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <span className="text-sm font-medium">
                版本 <span className="font-mono text-blue-600 dark:text-blue-400">{viewHash.slice(0, 7)}</span>
              </span>
              <button
                type="button"
                onClick={() => { setViewHash(null); setViewContent(null) }}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors touch-target"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {viewLoading && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  加载中...
                </div>
              )}
              {viewContent !== null && (
                <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                  {viewContent}
                </pre>
              )}
            </div>
            {/* Restore button */}
            {viewContent !== null && !viewLoading && (
              <div className="border-t px-4 py-3 safe-bottom shrink-0">
                <button
                  type="button"
                  onClick={() => restoreVersion(viewHash, viewContent)}
                  disabled={restoring}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors touch-target"
                >
                  {restoring ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RotateCcw size={14} />
                  )}
                  {restoring ? '恢复中...' : '恢复此版本'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Diff modal - mobile fullscreen */}
        {(diffContent !== null || diffLoading) && diffFrom && diffTo && (
          <div className="fixed inset-0 z-50 flex flex-col bg-background"
            onClick={cancelDiffMode}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <span className="text-sm font-medium">
                对比 <span className="font-mono text-blue-600 dark:text-blue-400">{diffFrom.slice(0, 7)}</span>
                {' → '}
                <span className="font-mono text-blue-600 dark:text-blue-400">{diffTo.slice(0, 7)}</span>
              </span>
              <button
                type="button"
                onClick={cancelDiffMode}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors touch-target"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4"
              onClick={e => e.stopPropagation()}
            >
              {diffLoading && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  加载 diff...
                </div>
              )}
              {diffContent !== null && (
                <DiffView content={diffContent} />
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Desktop: side panel
  return (
    <div className="flex flex-col h-full bg-background border-l border-border w-80 min-w-[320px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <History size={16} className="text-blue-500" />
          版本历史
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Diff selection bar */}
      {selectingDiff && (
        <div className="px-3 py-2 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">
              {!diffFrom && '选择旧版本'}
              {diffFrom && !diffTo && '选择新版本'}
              {diffFrom && diffTo && '对比中...'}
            </span>
            <button
              type="button"
              onClick={cancelDiffMode}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              取消
            </button>
          </div>
          {diffFrom && (
            <div className="text-xs font-mono text-muted-foreground">
              旧: {diffFrom.slice(0, 7)}
            </div>
          )}
          {diffTo && (
            <div className="text-xs font-mono text-muted-foreground">
              新: {diffTo.slice(0, 7)}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            加载中...
          </div>
        )}

        {error && (
          <div className="p-3 text-xs text-red-500 dark:text-red-400">{error}</div>
        )}

        {noGit && (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
            <GitCommit size={32} />
            <p className="text-sm">此仓库无版本历史</p>
          </div>
        )}

        {!loading && !error && !noGit && versions.length === 0 && (
          <div className="p-3 text-sm text-muted-foreground">暂无提交记录</div>
        )}

        {/* Diff action button */}
        {!loading && versions.length > 1 && !selectingDiff && (
          <div className="px-3 pt-3 shrink-0">
            <button
              type="button"
              onClick={startDiffMode}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              对比版本
            </button>
          </div>
        )}

        {/* Version list */}
        <div className="divide-y divide-border">
          {versions.map(v => {
            const isDiffSelected = selectingDiff && (v.hash === diffFrom || v.hash === diffTo)
            return (
              <div
                key={v.hash}
                className={`px-3 py-2 hover:bg-muted transition-colors ${
                  selectingDiff ? 'cursor-pointer' : ''
                } ${isDiffSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                onClick={() => selectingDiff && selectForDiff(v.hash)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400 shrink-0">
                    {v.hash.slice(0, 7)}
                  </span>
                  {!selectingDiff && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        viewVersion(v.hash)
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 underline"
                    >
                      查看
                    </button>
                  )}
                </div>
                <p className="text-xs mt-0.5 line-clamp-2">{v.message}</p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                  <span>{v.author}</span>
                  <span>{formatDate(v.date)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Version content modal — desktop */}
      {viewHash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setViewHash(null)}
        >
          <div className="bg-background rounded-lg border border-border w-[640px] max-h-[80vh] flex flex-col shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <span className="text-sm font-medium">
                版本 <span className="font-mono text-blue-600 dark:text-blue-400">{viewHash.slice(0, 7)}</span>
              </span>
              <button
                type="button"
                onClick={() => setViewHash(null)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {viewLoading && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  加载中...
                </div>
              )}
              {viewContent !== null && (
                <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                  {viewContent}
                </pre>
              )}
            </div>
            {/* Restore button */}
            {viewContent !== null && !viewLoading && (
              <div className="border-t px-4 py-3 flex items-center justify-between shrink-0">
                <span className="text-xs text-muted-foreground">
                  恢复此版本将覆盖当前文件内容
                </span>
                <button
                  type="button"
                  onClick={() => restoreVersion(viewHash, viewContent)}
                  disabled={restoring}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                >
                  {restoring ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  {restoring ? '恢复中...' : '恢复此版本'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Diff modal — desktop */}
      {(diffContent !== null || diffLoading) && diffFrom && diffTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={cancelDiffMode}
        >
          <div className="bg-background rounded-lg border border-border w-[640px] max-h-[80vh] flex flex-col shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <span className="text-sm font-medium">
                对比 <span className="font-mono text-blue-600 dark:text-blue-400">{diffFrom.slice(0, 7)}</span>
                {' → '}
                <span className="font-mono text-blue-600 dark:text-blue-400">{diffTo.slice(0, 7)}</span>
              </span>
              <button
                type="button"
                onClick={cancelDiffMode}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {diffLoading && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  加载 diff...
                </div>
              )}
              {diffContent !== null && (
                <DiffView content={diffContent} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- Diff View ---------- */

function DiffView({ content }: { content: string }) {
  const lines = content.split('\n')

  return (
    <div className="font-mono text-xs leading-relaxed">
      {lines.map((line, i) => {
        let bg = ''
        let colorClass = ''
        if (line.startsWith('+') && !line.startsWith('+++')) {
          bg = 'bg-green-100 dark:bg-green-900/30'
          colorClass = 'text-green-800 dark:text-green-300'
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          bg = 'bg-red-100 dark:bg-red-900/30'
          colorClass = 'text-red-800 dark:text-red-300'
        } else if (line.startsWith('@@')) {
          bg = 'bg-blue-50 dark:bg-blue-900/20'
          colorClass = 'text-blue-600 dark:text-blue-400'
        }

        return (
          <div key={i} className={`${bg} ${colorClass} px-2 py-0.5 whitespace-pre-wrap break-words`}>
            {line}
          </div>
        )
      })}
    </div>
  )
}