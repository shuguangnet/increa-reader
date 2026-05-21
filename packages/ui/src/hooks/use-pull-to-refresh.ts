import { useCallback, useRef, useState } from 'react'

import { useIsMobile } from './use-mobile'

type PullToRefreshResult = {
  /** Current pull distance in pixels (0 when not pulling) */
  pullDistance: number
  /** Whether a refresh is currently in progress */
  isRefreshing: boolean
  /** Touch event handlers */
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
  /** Signal that triggers the actual data refresh */
  refreshTriggered: boolean
}

type UsePullToRefreshOptions = {
  /** Called when the user pulls past the threshold and releases */
  onRefresh: () => void | Promise<void>
  /** Threshold in px before triggering refresh (default: 60) */
  threshold?: number
  /** Maximum pull distance in px (default: 120) */
  maxPullDistance?: number
}

/**
 * Pull-to-refresh hook for mobile.
 *
 * Tracks touch events to implement a pull-to-refresh gesture.
 * Returns pull distance, refreshing state, and touch event handlers.
 * Only activates on mobile devices.
 */
export function usePullToRefresh(options: UsePullToRefreshOptions): PullToRefreshResult {
  const { onRefresh, threshold = 60, maxPullDistance = 120 } = options
  const isMobile = useIsMobile()

  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshTriggered, setRefreshTriggered] = useState(false)

  const touchRef = useRef<{
    startY: number
    isPulling: boolean
    refreshCalled: boolean
  }>({ startY: 0, isPulling: false, refreshCalled: false })

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isMobile || isRefreshing) return

      // Only enable pull-to-refresh when at the top of the scroll container
      const target = e.currentTarget as HTMLElement
      const scrollContainer = target.querySelector('[data-pull-to-refresh-scroll]') ?? target

      if (scrollContainer.scrollTop > 0) return

      const touch = e.touches[0]
      touchRef.current = {
        startY: touch.clientY,
        isPulling: true,
        refreshCalled: false,
      }
    },
    [isMobile, isRefreshing],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchRef.current.isPulling || isRefreshing) return

      const touch = e.touches[0]
      const dy = touch.clientY - touchRef.current.startY

      // Only allow pull-down, not push-up
      if (dy <= 0) {
        setPullDistance(0)
        return
      }

      // Apply resistance - the further you pull, the harder it gets
      const resisted = Math.min(dy * 0.5, maxPullDistance)
      setPullDistance(resisted)
    },
    [isRefreshing, maxPullDistance],
  )

  const handleTouchEnd = useCallback(async () => {
    if (!touchRef.current.isPulling || isRefreshing) return

    touchRef.current.isPulling = false
    const currentPull = pullDistance

    if (currentPull >= threshold && !touchRef.current.refreshCalled) {
      touchRef.current.refreshCalled = true
      setIsRefreshing(true)
      setRefreshTriggered(true)

      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setPullDistance(0)
        setTimeout(() => setRefreshTriggered(false), 300)
      }
    } else {
      setPullDistance(0)
    }
  }, [isRefreshing, pullDistance, threshold, onRefresh])

  return {
    pullDistance,
    isRefreshing,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    refreshTriggered,
  }
}
