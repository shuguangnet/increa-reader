import { ArrowDown, Loader2 } from 'lucide-react'
import { type ReactNode, useRef } from 'react'

import { useIsMobile } from '@/hooks/use-mobile'
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh'

type PullToRefreshProps = {
  children: ReactNode
  onRefresh: () => void | Promise<void>
  /** Additional class names for the wrapper */
  className?: string
}

/**
 * Pull-to-refresh wrapper component.
 *
 * iOS-native-style pull-to-refresh with:
 * - Arrow indicator + "下拉刷新" / "释放刷新" text
 * - Loading spinner during refresh
 * - Smooth CSS transitions
 * - Only active on mobile viewports
 */
export function PullToRefresh({ children, onRefresh, className = '' }: PullToRefreshProps) {
  const isMobile = useIsMobile()
  const contentRef = useRef<HTMLDivElement>(null)

  const { pullDistance, isRefreshing, onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh({
    onRefresh,
  })

  // Compute indicator state
  const isPastThreshold = pullDistance >= 60
  const showIndicator = pullDistance > 5 || isRefreshing

  // Translate content down by pull distance, resist further on refresh
  const translateY = isRefreshing ? 60 : pullDistance

  if (!isMobile) {
    return <>{children}</>
  }

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ touchAction: 'pan-x' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center transition-all"
        style={{
          top: -60,
          height: 60,
          opacity: showIndicator ? 1 : 0,
          transform: `translateY(${translateY}px)`,
          transition:
            pullDistance === 0 ? 'transform 0.3s ease, opacity 0.3s ease' : 'opacity 0.1s ease',
        }}
        aria-hidden
      >
        {isRefreshing ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>正在刷新...</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowDown
              className={`size-5 transition-transform duration-200 ${
                isPastThreshold ? 'rotate-180' : ''
              }`}
            />
            <span>{isPastThreshold ? '释放刷新' : '下拉刷新'}</span>
          </div>
        )}
      </div>

      {/* Content area with pull-down transform */}
      <div
        ref={contentRef}
        data-pull-to-refresh-scroll
        className="h-full"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: pullDistance === 0 ? 'transform 0.3s ease' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  )
}
