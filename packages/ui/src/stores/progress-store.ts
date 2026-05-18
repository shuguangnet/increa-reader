import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface ReadingProgress {
  repo: string
  path: string
  percent: number  // 0-1
  scrollY: number
  lastReadAt: string
}

interface ProgressState {
  progressMap: Record<string, ReadingProgress>
  updateProgress: (repo: string, path: string, percent: number, scrollY: number) => void
  getProgress: (repo: string, path: string) => ReadingProgress | undefined
}

const MAX_ENTRIES = 200

function makeKey(repo: string, path: string): string {
  return `${repo}:${path}`
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      progressMap: {},

      updateProgress: (repo, path, percent, scrollY) => {
        const key = makeKey(repo, path)
        set(state => {
          const updated = {
            ...state.progressMap,
            [key]: {
              repo,
              path,
              percent: Math.max(0, Math.min(1, percent)),
              scrollY,
              lastReadAt: new Date().toISOString(),
            },
          }
          // Evict oldest entries if over limit
          const entries = Object.values(updated)
          if (entries.length > MAX_ENTRIES) {
            entries.sort((a, b) => a.lastReadAt.localeCompare(b.lastReadAt))
            const toRemove = entries.slice(0, entries.length - MAX_ENTRIES)
            for (const entry of toRemove) {
              delete updated[makeKey(entry.repo, entry.path)]
            }
          }
          return { progressMap: updated }
        })
      },

      getProgress: (repo, path) => {
        return get().progressMap[makeKey(repo, path)]
      },
    }),
    {
      name: 'increa-reading-progress',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)