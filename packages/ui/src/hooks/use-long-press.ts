import { useCallback, useEffect, useRef } from 'react'

type LongPressHandlers = {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

type UseLongPressOptions = {
  /** Duration in ms before long press fires (default: 500) */
  duration?: number
  /** Movement tolerance in px before canceling (default: 10) */
  tolerance?: number
  /** Whether to vibrate on long press (default: true) */
  vibrate?: boolean
}

/**
 * A reusable long-press gesture hook.
 *
 * Fires the `onLongPress` callback after the user holds their finger
 * on the element for the specified duration without significant movement.
 *
 * @param onLongPress - Callback invoked on long press, receives touch coordinates
 * @param options - Configuration options
 * @returns Touch event handlers to spread onto the target element
 */
export function useLongPress(
  onLongPress: (x: number, y: number) => void,
  options?: UseLongPressOptions,
): LongPressHandlers {
  const { duration = 500, tolerance = 10, vibrate = true } = options ?? {}

  const timerRef = useRef<ReturnType<typeof setTimeout>>(null as any)
  const triggeredRef = useRef(false)
  const posRef = useRef({ x: 0, y: 0 })

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0]
      posRef.current = { x: touch.clientX, y: touch.clientY }
      triggeredRef.current = false

      timerRef.current = setTimeout(() => {
        triggeredRef.current = true
        if (vibrate && navigator.vibrate) {
          navigator.vibrate(30)
        }
        onLongPress(posRef.current.x, posRef.current.y)
      }, duration)
    },
    [duration, vibrate, onLongPress],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0]
      const dx = Math.abs(touch.clientX - posRef.current.x)
      const dy = Math.abs(touch.clientY - posRef.current.y)
      if (dx > tolerance || dy > tolerance) {
        clearTimeout(timerRef.current)
      }
    },
    [tolerance],
  )

  const handleTouchEnd = useCallback(() => {
    clearTimeout(timerRef.current)
  }, [])

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  }
}
