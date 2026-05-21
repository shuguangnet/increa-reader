import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface RecentFile {
  repo: string
  path: string
  name: string
  openedAt: number
}

interface RecentFilesState {
  recentFiles: RecentFile[]
  addRecent: (repo: string, path: string) => void
  clearRecent: () => void
}

const MAX_RECENT = 20

export const useRecentFilesStore = create<RecentFilesState>()(
  persist(
    set => ({
      recentFiles: [],
      addRecent: (repo, path) =>
        set(state => {
          const cleanPath = path.startsWith('/') ? path.slice(1) : path
          const name = cleanPath.split('/').pop() ?? cleanPath
          // Remove existing entry for same repo/path, then add at front
          const filtered = state.recentFiles.filter(f => !(f.repo === repo && f.path === cleanPath))
          const updated = [{ repo, path: cleanPath, name, openedAt: Date.now() }, ...filtered]
          return { recentFiles: updated.slice(0, MAX_RECENT) }
        }),
      clearRecent: () => set({ recentFiles: [] }),
    }),
    {
      name: 'increa-recent-files',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
)
