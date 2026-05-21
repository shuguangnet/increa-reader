import { lazy, Suspense, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from '@/components/error-boundary'
import { AppSkeleton } from '@/components/skeleton'
import { VisibleContentProvider } from '../contexts/visible-content-context'
import { useFavoritesStore } from '../stores/favorites-store'
import { useFileTreeStore } from '../stores/file-tree-store'
import { useProgressStore } from '../stores/progress-store'
import { useRecentFilesStore } from '../stores/recent-files-store'
import { useSearchHistoryStore } from '../stores/search-history-store'
import { useTabsStore } from '../stores/tabs-store'
import { useUIStore } from '../stores/ui-store'
import { Layout } from './layout'
import { TabbedViewer } from './tabs/tabbed-viewer'

const HomePage = lazy(() => import('./home-page').then(m => ({ default: m.HomePage })))
const BoardViewer = lazy(() =>
  import('./board-viewer/board-viewer').then(m => ({ default: m.BoardViewer })),
)
const KnowledgeGraph = lazy(() =>
  import('./knowledge-graph').then(m => ({ default: m.KnowledgeGraph })),
)

/** Preload lazy components on hover/focus for instant navigation */
export function prefetch(route: 'home' | 'board' | 'graph') {
  switch (route) {
    case 'home':
      import('./home-page')
      break
    case 'board':
      import('./board-viewer/board-viewer')
      break
    case 'graph':
      import('./knowledge-graph')
      break
  }
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
    useFileTreeStore.persist.rehydrate()

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
        <Suspense fallback={<AppSkeleton />}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/board" element={<BoardViewer />} />
              <Route path="/views/:repoName/*" element={<TabbedViewer />} />
              <Route path="/graph" element={<KnowledgeGraph />} />
            </Route>
          </Routes>
        </Suspense>
      </VisibleContentProvider>
    </ErrorBoundary>
  )
}

export default App
