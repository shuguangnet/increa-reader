import { useCallback, useRef } from 'react'

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

type SwipeHandlers = {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

type UseSwipeOptions = {
  minDistance?: number
}

/**
 * A generic swipe gesture detection hook.
 *
 * Tracks touch start/move/end events and calls the `onSwipe` callback
 * when a swipe exceeds the minimum distance threshold.
 *
 * @param onSwipe - Callback invoked with the detected swipe direction
 * @param options - Configuration options (minDistance defaults to 50px)
 * @returns Touch event handlers to spread onto the target element
 */
export function useSwipe(
  onSwipe: (direction: SwipeDirection) => void,
  options?: UseSwipeOptions,
): SwipeHandlers {
  const { minDistance = 50 } = options ?? {}

  const touchRef = useRef<{
    startX: number
    startY: number
    swiping: boolean
  }>({ startX: 0, startY: 0, swiping: false })

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      swiping: false,
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchRef.current.swiping) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchRef.current.startX
    const dy = touch.clientY - touchRef.current.startY

    // Only mark as swiping if movement exceeds a small dead zone (5px)
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      touchRef.current.swiping = true
    }
  }, [])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchRef.current.swiping) return

      const touch = e.changedTouches[0]
      const dx = touch.clientX - touchRef.current.startX
      const dy = touch.clientY - touchRef.current.startY
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      touchRef.current.swiping = false

      // Determine direction based on which axis had the greatest movement
      if (absDx < minDistance && absDy < minDistance) return

      if (absDx > absDy) {
        onSwipe(dx > 0 ? 'right' : 'left')
      } else {
        onSwipe(dy > 0 ? 'down' : 'up')
      }
    },
    [onSwipe, minDistance],
  )

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  }
}
