import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type ExpandedDirsState = {
  /** Per-repo expanded dir paths: repoName → Set of dir paths */
  expandedDirs: Record<string, Set<string>>
  toggle: (repoName: string, dirPath: string) => void
  open: (repoName: string, dirPath: string) => void
  close: (repoName: string, dirPath: string) => void
  openAll: (repoName: string, dirPaths: string[]) => void
  closeAll: (repoName: string) => void
  isOpen: (repoName: string, dirPath: string) => boolean
  /** Ensure a path and all its ancestors are expanded (for auto-open on selection) */
  ensurePathOpen: (repoName: string, dirPath: string) => void
}

/** Serialized form: arrays instead of Sets, for JSON */
type Serialized = { expandedDirs: Record<string, string[]> }

function serialize(expandedDirs: Record<string, Set<string>>): Serialized {
  const result: Record<string, string[]> = {}
  for (const [key, set] of Object.entries(expandedDirs)) {
    result[key] = Array.from(set)
  }
  return { expandedDirs: result }
}

function deserializeExpandedDirs(data: unknown): Record<string, Set<string>> {
  const obj = (data as Serialized | undefined) ?? { expandedDirs: {} }
  const result: Record<string, Set<string>> = {}
  for (const [key, arr] of Object.entries(obj.expandedDirs ?? {})) {
    result[key] = new Set(arr)
  }
  return result
}

export const useFileTreeStore = create<ExpandedDirsState>()(
  persist(
    (set, get) => ({
      expandedDirs: {},

      toggle: (repoName, dirPath) =>
        set(state => {
          const current = state.expandedDirs[repoName]
          const next = current ? new Set(current) : new Set<string>()
          if (next.has(dirPath)) next.delete(dirPath)
          else next.add(dirPath)
          return { expandedDirs: { ...state.expandedDirs, [repoName]: next } }
        }),

      open: (repoName, dirPath) =>
        set(state => {
          const current = state.expandedDirs[repoName]
          if (current?.has(dirPath)) return state
          const next = current ? new Set(current) : new Set<string>()
          next.add(dirPath)
          return { expandedDirs: { ...state.expandedDirs, [repoName]: next } }
        }),

      close: (repoName, dirPath) =>
        set(state => {
          const current = state.expandedDirs[repoName]
          if (!current?.has(dirPath)) return state
          const next = new Set(current)
          next.delete(dirPath)
          return { expandedDirs: { ...state.expandedDirs, [repoName]: next } }
        }),

      openAll: (repoName, dirPaths) =>
        set(state => {
          const next = state.expandedDirs[repoName]
            ? new Set(state.expandedDirs[repoName])
            : new Set<string>()
          let changed = false
          for (const p of dirPaths) {
            if (!next.has(p)) {
              next.add(p)
              changed = true
            }
          }
          if (!changed) return state
          return { expandedDirs: { ...state.expandedDirs, [repoName]: next } }
        }),

      closeAll: (repoName) =>
        set(state => {
          if (!state.expandedDirs[repoName]) return state
          const { [repoName]: _, ...rest } = state.expandedDirs
          return { expandedDirs: rest }
        }),

      isOpen: (repoName, dirPath) => {
        return get().expandedDirs[repoName]?.has(dirPath) ?? false
      },

      ensurePathOpen: (repoName, dirPath) =>
        set(state => {
          const next = state.expandedDirs[repoName]
            ? new Set(state.expandedDirs[repoName])
            : new Set<string>()
          let changed = false
          const parts = dirPath.split('/')
          for (let i = 1; i <= parts.length; i++) {
            const ancestorPath = parts.slice(0, i).join('/')
            if (!next.has(ancestorPath)) {
              next.add(ancestorPath)
              changed = true
            }
          }
          if (!changed) return state
          return { expandedDirs: { ...state.expandedDirs, [repoName]: next } }
        }),
    }),
    {
      name: 'increa-file-tree-expanded',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => serialize(state.expandedDirs),
      merge: (persistedState, _currentState) => {
        const expandedDirs = deserializeExpandedDirs(persistedState)
        return { expandedDirs } as unknown as ExpandedDirsState
      },
      skipHydration: true,
    },
  ),
)