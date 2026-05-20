import { apiFetch } from '@/app/api'
import { ArrowLeftRight, ExternalLink, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/empty-state'

import { useIsMobile } from '@/hooks/use-mobile'
import { getFileIcon } from './file-tree'

type BacklinksPanelProps = {
  repo: string
  path: string
  onClose: () => void
}

type LinksData = {
  backlinks: string[]
  outgoing: string[]
}

export function BacklinksPanel({ repo, path, onClose }: BacklinksPanelProps) {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [data, setData] = useState<LinksData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'backlinks' | 'outgoing'>('backlinks')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      apiFetch(`/api/links/backlinks?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to fetch backlinks'))),
      apiFetch(`/api/links/outgoing?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to fetch outgoing links'))),
    ])
      .then(([backlinksData, outgoingData]) => {
        if (cancelled) return
        setData({
          backlinks: backlinksData.backlinks ?? [],
          outgoing: outgoingData.outgoing ?? [],
        })
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message || '加载链接失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [repo, path])

  const navigateToFile = useCallback((filePath: string) => {
    onClose()
    navigate(`/views/${repo}/${filePath}`)
  }, [repo, navigate, onClose])

  const links = activeTab === 'backlinks' ? (data?.backlinks ?? []) : (data?.outgoing ?? [])
  const label = activeTab === 'backlinks' ? '反向链接' : '出链'
  const emptyText = activeTab === 'backlinks' ? '没有其他文件链接到此文件' : '此文件没有链接到其他文件'

  return (
    <div className={`flex flex-col h-full bg-background ${isMobile ? 'w-full' : 'border-l border-border w-80 min-w-[320px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <ArrowLeftRight size={16} className="text-violet-500" />
          链接关系
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setActiveTab('backlinks')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            activeTab === 'backlinks'
              ? 'border-b-2 border-violet-500 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          反向链接
          {data && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'backlinks'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                : 'bg-muted text-muted-foreground'
            }`}>
              {data.backlinks.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('outgoing')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            activeTab === 'outgoing'
              ? 'border-b-2 border-violet-500 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          出链
          {data && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'outgoing'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                : 'bg-muted text-muted-foreground'
            }`}>
              {data.outgoing.length}
            </span>
          )}
        </button>
      </div>

      {/* Current file info */}
      <div className="px-3 py-1.5 border-b bg-muted/30 text-xs text-muted-foreground flex items-center gap-1.5">
        {getFileIcon(path.split('/').pop() || path)}
        <span className="truncate">{path}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        )}

        {error && (
          <div className="p-4 text-sm text-red-500 text-center">{error}</div>
        )}

        {!loading && !error && data && links.length === 0 && (
          <EmptyState icon={ArrowLeftRight} title={emptyText} />
        )}

        {!loading && !error && data && links.length > 0 && (
          <div className="divide-y">
            {links.map((linkPath, index) => {
              const fileName = linkPath.split('/').pop() || linkPath
              const dirPath = linkPath.includes('/') ? linkPath.substring(0, linkPath.lastIndexOf('/')) : ''
              return (
                <button
                  key={`${linkPath}-${index}`}
                  type="button"
                  onClick={() => navigateToFile(linkPath)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-accent/50 transition-colors text-left group"
                >
                  {getFileIcon(fileName)}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate group-hover:text-foreground">
                      {fileName}
                    </div>
                    {dirPath && (
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {dirPath}
                      </div>
                    )}
                  </div>
                  <ExternalLink size={12} className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer hint */}
      {!loading && !error && data && links.length > 0 && (
        <div className="px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground text-center">
          共 {links.length} 个{label}
        </div>
      )}
    </div>
  )
}