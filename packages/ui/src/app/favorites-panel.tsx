import { Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { showToast } from '@/app/toast'
import { useFavoritesStore } from '@/stores/favorites-store'
import { getFileIcon } from './file-tree'

export function FavoritesPanel() {
  const favorites = useFavoritesStore(s => s.favorites)
  const removeFavorite = useFavoritesStore(s => s.removeFavorite)
  const navigate = useNavigate()

  const sorted = [...favorites].sort((a, b) => b.addedAt - a.addedAt)

  const navigateToFile = (repo: string, path: string) => {
    const clean = path.startsWith('/') ? path.slice(1) : path
    navigate(`/views/${repo}/${clean}`)
  }

  const handleRemove = (repo: string, path: string) => {
    removeFavorite(repo, path)
    showToast('已取消收藏', 'info')
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Star className="size-8 mb-2 opacity-40" />
        <p className="text-sm">暂无收藏</p>
        <p className="text-xs mt-1 opacity-60">点击文件旁的星标添加收藏</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {sorted.map(item => (
        <div
          key={`${item.repo}-${item.path}`}
          className="group flex items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-accent cursor-pointer transition-colors"
          onClick={() => navigateToFile(item.repo, item.path)}
        >
          <button
            type="button"
            className="shrink-0 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            onClick={e => {
              e.stopPropagation()
              handleRemove(item.repo, item.path)
            }}
            title="取消收藏"
          >
            <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
          </button>
          {getFileIcon(item.name)}
          <span className="truncate text-xs" title={`${item.repo}/${item.path}`}>
            {item.repo}/{item.path}
          </span>
        </div>
      ))}
    </div>
  )
}