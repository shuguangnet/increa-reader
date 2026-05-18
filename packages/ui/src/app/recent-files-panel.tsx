import { Clock,Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useRecentFilesStore } from '@/stores/recent-files-store'
import { useProgressStore } from '@/stores/progress-store'
import { getFileIcon } from './file-tree'
import { Button } from '@/components/ui/button'

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return '刚刚'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

export function RecentFilesPanel() {
  const recentFiles = useRecentFilesStore(s => s.recentFiles)
  const clearRecent = useRecentFilesStore(s => s.clearRecent)
  const progressMap = useProgressStore(s => s.progressMap)
  const navigate = useNavigate()

  const navigateToFile = (repo: string, path: string) => {
    const clean = path.startsWith('/') ? path.slice(1) : path
    navigate(`/views/${repo}/${clean}`)
  }

  if (recentFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Clock className="size-8 mb-2 opacity-40" />
        <p className="text-sm">No recent files</p>
        <p className="text-xs mt-1 opacity-60">Open files to see them here</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end px-3 py-1 border-b">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={clearRecent}
          title="Clear recent files"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {recentFiles.map(item => {
          const progress = progressMap[`${item.repo}:${item.path}`]
          const percent = progress ? Math.round(progress.percent * 100) : undefined
          return (
            <div
              key={`${item.repo}-${item.path}-${item.openedAt}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-accent cursor-pointer transition-colors"
              onClick={() => navigateToFile(item.repo, item.path)}
            >
              <Clock className="size-3.5 shrink-0 text-muted-foreground" />
              {getFileIcon(item.name)}
              <div className="min-w-0 flex-1">
                <span className="truncate text-xs block" title={`${item.repo}/${item.path}`}>
                  {item.repo}/{item.path}
                </span>
                {percent !== undefined && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400 transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{percent}%</span>
                  </div>
                )}
              </div>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">
                {relativeTime(item.openedAt)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}