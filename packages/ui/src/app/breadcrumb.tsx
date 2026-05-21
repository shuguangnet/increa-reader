import { ChevronRight, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useFavoritesStore } from '@/stores/favorites-store'

type BreadcrumbProps = {
  repo: string
  path: string
}

export function Breadcrumb({ repo, path }: BreadcrumbProps) {
  const navigate = useNavigate()
  const segments = path.split('/').filter(Boolean)
  const addFavorite = useFavoritesStore(s => s.addFavorite)
  const removeFavorite = useFavoritesStore(s => s.removeFavorite)
  const isFavorite = useFavoritesStore(s => s.isFavorite)
  const starred = isFavorite(repo, path)

  const toggleFavorite = () => {
    if (starred) {
      removeFavorite(repo, path)
    } else {
      addFavorite(repo, path)
    }
  }

  if (segments.length === 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground px-3 py-1 bg-muted/30 border-b select-none">
        <span
          className="hover:text-foreground cursor-pointer transition-colors"
          onClick={() => navigate('/')}
        >
          {repo}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-0.5 text-xs text-muted-foreground px-3 py-1 bg-muted/30 border-b select-none overflow-x-auto whitespace-nowrap">
      <span
        className="hover:text-foreground cursor-pointer transition-colors shrink-0"
        onClick={() => navigate('/')}
        title={repo}
      >
        {repo}
      </span>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1
        const partialPath = segments.slice(0, index + 1).join('/')

        if (isLast) {
          // Last segment = current file
          return (
            <span key={partialPath} className="flex items-center gap-0.5 shrink-0">
              <ChevronRight className="size-3 shrink-0" />
              <span
                className="hover:text-foreground cursor-pointer transition-colors font-medium"
                onClick={() => navigate(`/views/${repo}/${partialPath}`)}
              >
                {segment}
              </span>
            </span>
          )
        }

        // Directory segment - navigate to parent directory view
        const dirSegments = segments.slice(0, index + 1).join('/')
        return (
          <span key={partialPath} className="flex items-center gap-0.5 shrink-0">
            <ChevronRight className="size-3 shrink-0" />
            <span
              className="hover:text-foreground cursor-pointer transition-colors"
              onClick={() => navigate(`/views/${repo}/${dirSegments}`)}
            >
              {segment}
            </span>
          </span>
        )
      })}
      <button
        type="button"
        onClick={toggleFavorite}
        className={`ml-auto shrink-0 p-0.5 rounded transition-colors hover:bg-accent ${
          starred
            ? 'text-yellow-500 hover:text-yellow-600'
            : 'text-muted-foreground hover:text-yellow-500'
        }`}
        title={starred ? '取消收藏' : '加入收藏'}
      >
        <Star className={`size-3.5 ${starred ? 'fill-current' : ''}`} />
      </button>
    </div>
  )
}
