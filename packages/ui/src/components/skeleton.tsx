import { Skeleton } from '@/components/ui/skeleton'

/** Skeleton placeholder shown while the file tree loads */
export function FileTreeSkeleton() {
  return (
    <div className="p-2 space-y-1" aria-busy="true" aria-label="文件树加载中">
      {/* Depth-0 folder */}
      <div className="flex items-center gap-2">
        <Skeleton className="size-4 rounded-sm" />
        <Skeleton className="size-4 rounded" />
        <Skeleton className="h-4 w-24" />
      </div>
      {/* Depth-1 children */}
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-2 ml-4">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
      {/* Another depth-0 folder */}
      <div className="flex items-center gap-2 mt-3">
        <Skeleton className="size-4 rounded-sm" />
        <Skeleton className="size-4 rounded" />
        <Skeleton className="h-4 w-20" />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-center gap-2 ml-4">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  )
}

/** Full-page skeleton shown while the app is loading */
export function AppSkeleton() {
  return (
    <div className="flex h-screen" aria-busy="true" aria-label="应用加载中">
      {/* Left panel */}
      <div className="w-64 border-r p-4 space-y-3 shrink-0">
        <Skeleton className="h-8 w-full" />
        <FileTreeSkeleton />
      </div>
      {/* Main content */}
      <div className="flex-1 p-8 space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-64 w-full mt-4" />
      </div>
    </div>
  )
}