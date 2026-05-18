import { FolderOpen, Search, Settings, Tag, X } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchRepos, type RepoInfo } from './api'
import { getLeftPanelSearchStatus } from './left-panel-search-status'
import { RepoPanel } from './repo-panel'
import { SearchPanel } from './search-panel'
import { SettingsDrawer } from './settings-drawer'
import { TagsPanel } from './tags-panel'

type LeftTab = 'files' | 'tags'

export function LeftPanel() {
  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchPanelOpen, setSearchPanelOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<LeftTab>('files')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const isFiltering = searchQuery !== deferredSearchQuery
  const searchStatusText = getLeftPanelSearchStatus(deferredSearchQuery, isFiltering)

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
    return <div className="p-4">Loading...</div>
  }

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Repositories</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setSearchPanelOpen(true)} title="Global search">
            <Search className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setDrawerOpen(true)}>
            <Settings className="size-4" />
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('files')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'files'
              ? 'border-b-2 border-foreground text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FolderOpen className="size-3.5" /> Files
        </button>
        <button
          onClick={() => setActiveTab('tags')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'tags'
              ? 'border-b-2 border-foreground text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Tag className="size-3.5" /> Tags
        </button>
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
                placeholder="Filter repositories and files"
                className="pr-9 pl-8"
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
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

      {/* Tags tab content */}
      {activeTab === 'tags' && (
        <div className="flex-1 overflow-auto">
          <TagsPanel />
        </div>
      )}

      <SettingsDrawer open={drawerOpen} onOpenChange={setDrawerOpen} onReposChanged={loadRepos} />
      <SearchPanel open={searchPanelOpen} onClose={() => setSearchPanelOpen(false)} />
    </div>
  )
}