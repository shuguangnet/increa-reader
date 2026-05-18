import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { VisibleContentProvider } from '../contexts/visible-content-context'
import { useUIStore } from '../stores/ui-store'
import { useFavoritesStore } from '../stores/favorites-store'
import { useRecentFilesStore } from '../stores/recent-files-store'
import { useTabsStore } from '../stores/tabs-store'
import { useProgressStore } from '../stores/progress-store'
import { BoardViewer } from './board-viewer'
import { KnowledgeGraph } from './knowledge-graph'
import { Layout } from './layout'
import { TabbedViewer } from './tabs/tabbed-viewer'

function HomePage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">AI Chat</h1>
    </div>
  )
}

/**
 * Rehydrate all persisted Zustand stores on mount.
 * Using skipHydration: true prevents React 19 infinite loop caused by
 * useSyncExternalStore getSnapshot returning new object references during
 * the synchronous hydration phase. We rehydrate manually after mount instead.
 */
function useRehydrateStores() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let count = 0
    const total = 5
    const markDone = () => {
      count++
      if (count >= total) {
        setHydrated(true)
      }
    }

    // Listen for hydration completion on each store
    const unsubs = [
      useUIStore.persist.onFinishHydration(markDone),
      useFavoritesStore.persist.onFinishHydration(markDone),
      useRecentFilesStore.persist.onFinishHydration(markDone),
      useTabsStore.persist.onFinishHydration(markDone),
      useProgressStore.persist.onFinishHydration(markDone),
    ]

    // Trigger rehydration (it's async, fires onFinishHydration when done)
    useUIStore.persist.rehydrate()
    useFavoritesStore.persist.rehydrate()
    useRecentFilesStore.persist.rehydrate()
    useTabsStore.persist.rehydrate()
    useProgressStore.persist.rehydrate()

    return () => {
      unsubs.forEach((unsub) => unsub())
    }
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
  )
}

export default App