import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface SearchHistoryState {
  recentSearches: string[]
  addSearch: (query: string) => void
  clearSearches: () => void
  removeSearch: (query: string) => void
}

const MAX_SEARCH_HISTORY = 15

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    set => ({
      recentSearches: [],

      addSearch: (query: string) =>
        set(state => {
          const trimmed = query.trim()
          if (!trimmed) return state
          // Remove duplicate, then add at front
          const filtered = state.recentSearches.filter(s => s !== trimmed)
          return { recentSearches: [trimmed, ...filtered].slice(0, MAX_SEARCH_HISTORY) }
        }),

      clearSearches: () => set({ recentSearches: [] }),

      removeSearch: (query: string) =>
        set(state => ({
          recentSearches: state.recentSearches.filter(s => s !== query),
        })),
    }),
    {
      name: 'increa-search-history',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
)
