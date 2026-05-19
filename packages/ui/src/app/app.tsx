import { apiFetch } from '@/app/api'
import { useCallback, useEffect, useState } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { BookOpen, BarChart3, Clock, FolderOpen, Hash, Keyboard, MessageSquare, Network, Search, Star } from 'lucide-react'
import { ErrorBoundary } from '@/components/error-boundary'
import { VisibleContentProvider } from '../contexts/visible-content-context'
import { useFavoritesStore } from '../stores/favorites-store'
import { useRecentFilesStore } from '../stores/recent-files-store'
import { useProgressStore } from '../stores/progress-store'
import { useTabsStore } from '../stores/tabs-store'
import { useSearchHistoryStore } from '../stores/search-history-store'
import { useUIStore } from '../stores/ui-store'
import { useIsMobile } from '../hooks/use-mobile'
import { getFileIcon } from './file-tree'
import { BoardViewer } from './board-viewer'
import { KnowledgeGraph } from './knowledge-graph'
import { Layout } from './layout'
import { TabbedViewer } from './tabs/tabbed-viewer'

type TagInfo = { name: string; count: number }
type TagFile = { repo: string; file_path: string; path?: string }

function HomePage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const recentFiles = useRecentFilesStore(s => s.recentFiles)
  const favorites = useFavoritesStore(s => s.favorites)
  const progressMap = useProgressStore(s => s.progressMap)
  const setCommandPaletteOpen = useUIStore(s => s.setCommandPaletteOpen)
  const setSearchPanelOpen = useUIStore(s => s.setSearchPanelOpen)
  const toggleRightPanel = useUIStore(s => s.toggleRightPanel)

  const navigateToFile = (repo: string, path: string) => {
    navigate(`/views/${repo}/${path}`)
  }

  const [tags, setTags] = useState<TagInfo[]>([])
  const [expandedTag, setExpandedTag] = useState<string | null>(null)
  const [tagFiles, setTagFiles] = useState<TagFile[]>([])
  const [tagFilesLoading, setTagFilesLoading] = useState(false)
  const [repoCount, setRepoCount] = useState<number>(0)

  const loadRepoCount = useCallback(async () => {
    try {
      const res = await apiFetch('/api/repos')
      const data = await res.json()
      const repos = data.repos ?? data.data ?? data
      setRepoCount(Array.isArray(repos) ? repos.length : 0)
    } catch {
      setRepoCount(0)
    }
  }, [])

  const loadTags = useCallback(async () => {
    try {
      const res = await apiFetch('/api/tags')
      const data = await res.json()
      setTags(data.tags ?? data.data ?? [])
    } catch {
      setTags([])
    }
  }, [])

  const loadTagFiles = useCallback(async (tagName: string) => {
    if (expandedTag === tagName) {
      setExpandedTag(null)
      setTagFiles([])
      return
    }
    setExpandedTag(tagName)
    setTagFilesLoading(true)
    try {
      const res = await apiFetch(`/api/tags/${encodeURIComponent(tagName)}`)
      const data = await res.json()
      setTagFiles(data.files ?? data.data ?? [])
    } catch {
      setTagFiles([])
    } finally {
      setTagFilesLoading(false)
    }
  }, [expandedTag])

  useEffect(() => {
    loadTags()
    loadRepoCount()
  }, [loadTags, loadRepoCount])

  const sortedRecent = [...recentFiles].sort((a, b) => b.openedAt - a.openedAt).slice(0, 8)
  const sortedFavorites = [...favorites].sort((a, b) => b.addedAt - a.addedAt).slice(0, 8)

  // Group recent files by time
  const now = Date.now()
  const todayFiles = sortedRecent.filter(f => now - f.openedAt < 86400000)

  // Continue reading: files with progress > 10% and < 90%, sorted by progress desc, top 5
  const continueReading = Object.values(progressMap)
    .filter(p => p.percent > 0.1 && p.percent < 0.9)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 5)

  const quickActions = [
    { label: '搜索文件内容', icon: <Search className="size-5" />, onClick: () => setSearchPanelOpen(true), color: 'text-blue-500 bg-blue-50 dark:bg-blue-950' },
    { label: '命令面板', icon: <Keyboard className="size-5" />, onClick: () => setCommandPaletteOpen(true), color: 'text-violet-500 bg-violet-50 dark:bg-violet-950' },
    { label: '知识图谱', icon: <Network className="size-5" />, onClick: () => navigate('/graph'), color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950' },
    { label: 'AI对话', icon: <MessageSquare className="size-5" />, onClick: () => toggleRightPanel(), color: 'text-amber-500 bg-amber-50 dark:bg-amber-950' },
  ]

  const displayRecent = todayFiles.length > 0 ? todayFiles : sortedRecent
  const recentLabel = todayFiles.length > 0 ? '今天' : '近期'

  return (
    <div className="h-full overflow-auto">
      <div className={`mx-auto ${isMobile ? 'px-4 py-6' : 'px-8 py-10'} max-w-3xl`}>
        {/* Hero Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">
            Increa Reader
          </h1>
          <p className="text-muted-foreground text-sm">
            你的个人知识库，快速访问文件与笔记
          </p>
        </div>

        {/* Statistics Bar */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
            <div className="p-2 rounded-lg text-blue-500 bg-blue-50 dark:bg-blue-950">
              <FolderOpen className="size-4" />
            </div>
            <div>
              <div className="text-lg font-bold">{repoCount}</div>
              <div className="text-xs text-muted-foreground">仓库</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
            <div className="p-2 rounded-lg text-emerald-500 bg-emerald-50 dark:bg-emerald-950">
              <BarChart3 className="size-4" />
            </div>
            <div>
              <div className="text-lg font-bold">{Object.keys(progressMap).length}</div>
              <div className="text-xs text-muted-foreground">已读文件</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
            <div className="p-2 rounded-lg text-orange-500 bg-orange-50 dark:bg-orange-950">
              <Hash className="size-4" />
            </div>
            <div>
              <div className="text-lg font-bold">{tags.length}</div>
              <div className="text-xs text-muted-foreground">标签</div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-3 mb-8`}>
          {quickActions.map(action => (
            <button
              key={action.label}
              onClick={action.onClick}
              className={`flex items-center ${isMobile ? 'justify-start' : 'flex-col items-center'} gap-3 ${isMobile ? 'p-3' : 'p-4'} rounded-xl border bg-card hover:bg-accent/50 transition-colors touch-target`}
            >
              <div className={`p-2.5 rounded-lg ${action.color}`}>
                {action.icon}
              </div>
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Continue Reading */}
        {continueReading.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="size-4 text-indigo-500" />
              <h2 className="text-sm font-semibold">继续阅读</h2>
            </div>
            <div className="space-y-2">
              {continueReading.map(p => {
                const percent = Math.round(p.percent * 100)
                const fileName = p.path.split('/').pop() || p.path
                return (
                  <div
                    key={`${p.repo}-${p.path}`}
                    className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{fileName}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.repo}/{p.path}</div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400 transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">{percent}%</span>
                      </div>
                    </div>
                    <button
                      onClick={() => navigateToFile(p.repo, p.path)}
                      className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
                    >
                      继续
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recent Files */}
        {displayRecent.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{recentLabel}</h2>
            </div>
            <div className="space-y-1">
              {displayRecent.map(item => {
                const progress = progressMap[`${item.repo}:${item.path}`]
                const percent = progress ? Math.round(progress.percent * 100) : undefined
                return (
                  <button
                    key={`${item.repo}-${item.path}`}
                    onClick={() => navigateToFile(item.repo, item.path)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                  >
                    {getFileIcon(item.name)}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.repo}/{item.path}</div>
                    </div>
                    {percent !== undefined && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400 transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-8 text-right">{percent}%</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Favorites */}
        {sortedFavorites.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Star className="size-4 text-yellow-500" />
              <h2 className="text-sm font-semibold">收藏</h2>
            </div>
            <div className="space-y-1">
              {sortedFavorites.map(item => {
                const progress = progressMap[`${item.repo}:${item.path}`]
                const percent = progress ? Math.round(progress.percent * 100) : undefined
                return (
                  <button
                    key={`fav-${item.repo}-${item.path}`}
                    onClick={() => navigateToFile(item.repo, item.path)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                  >
                    {getFileIcon(item.name)}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.repo}/{item.path}</div>
                    </div>
                    {percent !== undefined && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400 transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-8 text-right">{percent}%</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Hash className="size-4 text-orange-500" />
              <h2 className="text-sm font-semibold">标签</h2>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {tags.map(tag => {
                const sizeClass = tag.count >= 6
                  ? 'text-base font-semibold'
                  : tag.count >= 3
                    ? 'text-sm'
                    : 'text-xs'
                return (
                  <button
                    key={tag.name}
                    onClick={() => loadTagFiles(tag.name)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-medium transition-colors ${sizeClass} ${
                      expandedTag === tag.name
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                        : 'bg-muted hover:bg-accent text-muted-foreground'
                    }`}
                  >
                    <Hash className="size-3" />
                    {tag.name}
                    <span className="opacity-60">{tag.count}</span>
                  </button>
                )
              })}
            </div>
            {expandedTag && (
              <div className="space-y-1">
                {tagFilesLoading && (
                  <div className="text-xs text-muted-foreground px-1">加载中...</div>
                )}
                {!tagFilesLoading && tagFiles.length === 0 && (
                  <div className="text-xs text-muted-foreground px-1">暂无文件</div>
                )}
                {tagFiles.slice(0, 8).map((f, i) => (
                  <button
                    key={`${f.repo}-${f.file_path}-${i}`}
                    onClick={() => navigateToFile(f.repo, f.file_path)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-accent transition-colors text-left"
                  >
                    {getFileIcon(f.file_path.split('/').pop() || f.file_path)}
                    <span className="text-sm truncate">{f.repo}/{f.file_path}</span>
                  </button>
                ))}
                {tagFiles.length > 8 && (
                  <div className="text-xs text-muted-foreground px-3 py-1">
                    还有 {tagFiles.length - 8} 个文件...
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {sortedRecent.length === 0 && sortedFavorites.length === 0 && tags.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FolderOpen className="size-12 mb-3 opacity-30" />
            <p className="text-sm mb-1">还没有打开过文件</p>
            <p className="text-xs opacity-60">从左侧面板选择文件开始阅读</p>
          </div>
        )}

        {/* Keyboard shortcut hint */}
        <div className={`flex items-center justify-center gap-4 text-xs text-muted-foreground ${isMobile ? 'mt-6 safe-bottom pb-4' : 'mt-10'}`}>
          <span><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl+K</kbd> 快速导航</span>
          <span><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl+Shift+F</kbd> 全局搜索</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Rehydrate all persisted Zustand stores on mount.
 * Using skipHydration: true prevents React 19 infinite loop caused by
 * useSyncExternalStore getSnapshot returning new object references during
 * the synchronous hydration phase. We rehydrate manually after mount instead.
 *
 * Fixed: previous callback-counter approach caused infinite re-render because
 * onFinishHydration fires synchronously when localStorage has data, triggering
 * setState during the effect, which caused React to re-run the effect in StrictMode.
 * Now we simply call rehydrate() once and set hydrated after a tick.
 */
function useRehydrateStores() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    // Trigger rehydration for all persisted stores
    useUIStore.persist.rehydrate()
    useFavoritesStore.persist.rehydrate()
    useRecentFilesStore.persist.rehydrate()
    useTabsStore.persist.rehydrate()
    useProgressStore.persist.rehydrate()
    useSearchHistoryStore.persist.rehydrate()

    // Mark as hydrated after microtask so stores have settled
    requestAnimationFrame(() => {
      setHydrated(true)
    })
  }, [])

  return hydrated
}

function App() {
  const hydrated = useRehydrateStores()

  // Don't render the app until stores are hydrated to avoid flash of default values
  if (!hydrated) {
    return null
  }

  return (
    <ErrorBoundary>
      <VisibleContentProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/board" element={<BoardViewer />} />
            <Route path="/views/:repoName/*" element={<TabbedViewer />} />
            <Route path="/graph" element={<KnowledgeGraph />} />
          </Route>
        </Routes>
      </VisibleContentProvider>
    </ErrorBoundary>
  )
}

export default App