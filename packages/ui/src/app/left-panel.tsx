import { Calendar, Clock, FolderOpen, Monitor, Moon, Search, Settings, Star, Sun, Tag, X } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTheme } from '@/hooks/use-theme'
import { createFile, fetchRepos, type RepoInfo } from './api'
import { CalendarView } from './calendar_view'
import { FavoritesPanel } from './favorites-panel'
import { getLeftPanelSearchStatus } from './left-panel-search-status'
import { RecentFilesPanel } from './recent-files-panel'
import { RepoPanel } from './repo-panel'
import { SettingsDrawer } from './settings-drawer'
import { TagsPanel } from './tags-panel'
import { useUIStore } from '@/stores/ui-store'
import { FileTreeSkeleton } from '@/components/skeleton'

type LeftTab = 'files' | 'favorites' | 'recent' | 'tags' | 'calendar'

export function LeftPanel() {
  const { theme, toggle: toggleTheme } = useTheme()
  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const setSearchPanelOpen = useUIStore((s) => s.setSearchPanelOpen)
  const [activeTab, setActiveTab] = useState<LeftTab>('files')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const isFiltering = searchQuery !== deferredSearchQuery
  const searchStatusText = getLeftPanelSearchStatus(deferredSearchQuery, isFiltering)
  const navigate = useNavigate()

  const loadRepos = useCallback(() => {
    fetchRepos()
      .then(setRepos)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadRepos()
  }, [loadRepos])

  if (loading) {
    return <FileTreeSkeleton />
  }

  const tabs: { key: LeftTab; label: string; icon: React.ReactNode }[] = [
    { key: 'files', label: '文件', icon: <FolderOpen className="size-3.5" /> },
    { key: 'favorites', label: '收藏', icon: <Star className="size-3.5" /> },
    { key: 'recent', label: '近期', icon: <Clock className="size-3.5" /> },
    { key: 'tags', label: '标签', icon: <Tag className="size-3.5" /> },
    { key: 'calendar', label: '日历', icon: <Calendar className="size-3.5" /> },
  ]

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">仓库</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setSearchPanelOpen(true)} title="全局搜索">
            <Search className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={toggleTheme} title={`主题: ${theme === 'dark' ? '深色' : theme === 'light' ? '浅色' : '跟随系统'}`}>
            {theme === 'dark' ? <Moon className="size-4" /> : theme === 'light' ? <Sun className="size-4" /> : <Monitor className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setDrawerOpen(true)} title="设置">
            <Settings className="size-4" />
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-foreground text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* File tab content */}
      {activeTab === 'files' && (
        <>
          <div className="border-b px-3 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="筛选文件..."
                className="pr-9 pl-8"
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                  onClick={() => setSearchQuery('')}
                  aria-label="清除搜索"
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
            {searchStatusText ? (
              <div className="mt-1 text-xs text-muted-foreground">{searchStatusText}</div>
            ) : null}
          </div>

          <div className="flex-1 overflow-auto">
            {repos.map(repo => (
              <RepoPanel key={repo.name} repoName={repo.name} searchQuery={deferredSearchQuery} />
            ))}
          </div>
        </>
      )}

      {/* Favorites tab content */}
      {activeTab === 'favorites' && (
        <div className="flex-1 overflow-auto">
          <FavoritesPanel />
        </div>
      )}

      {/* Recent tab content */}
      {activeTab === 'recent' && (
        <div className="flex-1 overflow-auto">
          <RecentFilesPanel />
        </div>
      )}

      {/* Tags tab content */}
      {activeTab === 'tags' && (
        <div className="flex-1 overflow-auto">
          <TagsPanel />
        </div>
      )}

      {/* Calendar tab content */}
      {activeTab === 'calendar' && (
        <div className="flex-1 overflow-hidden">
          {repos.length > 0 && (
            <CalendarView
              repoName={repos[0].name}
              onFileClick={(filePath) => {
                // Navigate to the file using React Router
                navigate(`/views/${repos[0].name}/${filePath}`)
              }}
              onCreateFile={(date) => {
                // Create a date-named markdown file
                const fileName = `${date}.md`
                createFile(repos[0].name, fileName, 'file', `# ${date}\n\n`)
                  .then(() => {
                    navigate(`/views/${repos[0].name}/${fileName}`)
                  })
                  .catch(console.error)
              }}
            />
          )}
          {repos.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              未配置仓库，请添加仓库以使用日历视图。
            </div>
          )}
        </div>
      )}

      <SettingsDrawer open={drawerOpen} onOpenChange={setDrawerOpen} onReposChanged={loadRepos} />
    </div>
  )
}