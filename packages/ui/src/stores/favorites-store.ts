import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface FavoriteItem {
  repo: string
  path: string
  name: string
  addedAt: number
}

interface FavoritesState {
  favorites: FavoriteItem[]
  addFavorite: (repo: string, path: string) => void
  removeFavorite: (repo: string, path: string) => void
  isFavorite: (repo: string, path: string) => boolean
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      addFavorite: (repo, path) =>
        set(state => {
          const cleanPath = path.startsWith('/') ? path.slice(1) : path
          const name = cleanPath.split('/').pop() ?? cleanPath
          const exists = state.favorites.some(f => f.repo === repo && f.path === cleanPath)
          if (exists) return state
          return {
            favorites: [...state.favorites, { repo, path: cleanPath, name, addedAt: Date.now() }],
          }
        }),
      removeFavorite: (repo, path) =>
        set(state => {
          const cleanPath = path.startsWith('/') ? path.slice(1) : path
          return {
            favorites: state.favorites.filter(f => !(f.repo === repo && f.path === cleanPath)),
          }
        }),
      isFavorite: (repo, path) => {
        const cleanPath = path.startsWith('/') ? path.slice(1) : path
        return get().favorites.some(f => f.repo === repo && f.path === cleanPath)
      },
    }),
    {
      name: 'increa-favorites',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
)
