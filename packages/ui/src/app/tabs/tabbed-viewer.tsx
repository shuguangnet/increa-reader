import { useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useRecentFilesStore } from '@/stores/recent-files-store'
import { useTabsStore } from '@/stores/tabs-store'
import { useSetContext } from '@/stores/view-context'
import { Breadcrumb } from '../breadcrumb'
import { FileViewer } from '../file-viewer'
import { TabBar } from './tab-bar'

export function TabbedViewer() {
  const { repoName, '*': filePath } = useParams<{ repoName: string; '*': string }>()
  const [searchParams] = useSearchParams()
  const scrollToLine = searchParams.get('line') ? Number(searchParams.get('line')) : undefined
  const openTab = useTabsStore(s => s.openTab)
  const tabs = useTabsStore(s => s.tabs)
  const activeId = useTabsStore(s => s.activeId)
  const activeView = useTabsStore(
    useShallow(s => {
      const active = s.tabs.find(t => t.id === s.activeId)
      return active ? { repo: active.repo, path: active.path, pageNumber: active.pageNumber } : null
    }),
  )
  const setContext = useSetContext()
  const addRecent = useRecentFilesStore(s => s.addRecent)

  // Track last opened key to avoid repeated openTab/addRecent calls causing infinite loop
  const lastOpenedRef = useRef('')

  useEffect(() => {
    if (!repoName || !filePath) return
    const key = `${repoName}/${filePath}`
    if (lastOpenedRef.current === key) return
    lastOpenedRef.current = key
    openTab(repoName, filePath)
    addRecent(repoName, filePath)
  }, [repoName, filePath, openTab, addRecent])

  useEffect(() => {
    if (!activeView) return
    setContext(activeView)
  }, [activeView, setContext])

  return (
    <div className="flex h-full flex-col">
      <TabBar />
      {activeView && <Breadcrumb repo={activeView.repo} path={activeView.path} />}
      <div className="relative min-h-0 flex-1">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{ visibility: tab.id === activeId ? 'visible' : 'hidden' }}
          >
            <FileViewer
              repo={tab.repo}
              path={tab.path}
              scrollToLine={tab.id === activeId ? scrollToLine : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
