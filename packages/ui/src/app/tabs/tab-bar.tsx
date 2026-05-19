import { X } from 'lucide-react'
import { useCallback, useRef, useState, type MouseEvent as RMouseEvent, type TouchEvent as RTouchEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { type Tab, useTabsStore } from '@/stores/tabs-store'
import { useEditorStore } from '@/stores/editor-store'
import { useIsMobile } from '@/hooks/use-mobile'
import { getFileIcon } from '../file-tree'

export function TabBar() {
  const tabs = useTabsStore(s => s.tabs)
  const activeId = useTabsStore(s => s.activeId)
  const closeTab = useTabsStore(s => s.closeTab)
  const editedFiles = useEditorStore(s => s.editedFiles)
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  if (tabs.length === 0) return null

  const handleClick = (tab: Tab) => {
    if (tab.id === activeId) return
    navigate(`/views/${tab.repo}/${tab.path}`)
  }

  const handleClose = (event: RMouseEvent, tab: Tab) => {
    event.stopPropagation()
    const isClosingActive = tab.id === activeId
    const idx = tabs.findIndex(t => t.id === tab.id)
    const neighbor = isClosingActive ? (tabs[idx + 1] ?? tabs[idx - 1]) : null
    closeTab(tab.id)
    if (!isClosingActive) return
    navigate(neighbor ? `/views/${neighbor.repo}/${neighbor.path}` : '/')
  }

  return (
    <div
      className={`flex shrink-0 items-center overflow-x-auto border-b bg-muted/30 scrollbar-thin ${
        isMobile ? 'h-10' : 'h-9'
      }`}
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeId
        const filename = tab.path.split('/').pop() ?? tab.path
        const isDirty = editedFiles[`${tab.repo}:${tab.path}`] &&
          editedFiles[`${tab.repo}:${tab.path}`].content !== editedFiles[`${tab.repo}:${tab.path}`].originalContent

        return (
          <MobileTabItem
            key={tab.id}
            tab={tab}
            isActive={isActive}
            filename={filename}
            isDirty={isDirty}
            isMobile={isMobile}
            onClick={() => handleClick(tab)}
            onAuxClick={(event) => {
              if (event.button === 1) handleClose(event, tab)
            }}
            onClose={(event) => handleClose(event, tab)}
          />
        )
      })}
    </div>
  )
}

/** Individual tab item with swipe-to-close on mobile */
function MobileTabItem({
  tab,
  isActive,
  filename,
  isDirty,
  isMobile,
  onClick,
  onAuxClick,
  onClose,
}: {
  tab: Tab
  isActive: boolean
  filename: string
  isDirty: boolean
  isMobile: boolean
  onClick: () => void
  onAuxClick: (e: RMouseEvent) => void
  onClose: (e: RMouseEvent) => void
}) {
  const itemRef = useRef<HTMLDivElement>(null)
  const touchRef = useRef<{ startX: number; currentX: number; swiping: boolean }>({
    startX: 0, currentX: 0, swiping: false,
  })
  const [translateX, setTranslateX] = useState(0)

  const handleTouchStart = useCallback((e: RTouchEvent) => {
    if (!isMobile) return
    const touch = e.touches[0]
    touchRef.current = { startX: touch.clientX, currentX: 0, swiping: false }
  }, [isMobile])

  const handleTouchMove = useCallback((e: RTouchEvent) => {
    if (!isMobile) return
    const t = touchRef.current
    const touch = e.touches[0]
    const dx = touch.clientX - t.startX

    if (!t.swiping && Math.abs(dx) > 8) {
      t.swiping = true
    }

    if (t.swiping) {
      // Only allow swiping left (negative dx) to close
      const clampedDx = Math.min(0, Math.max(dx, -120))
      t.currentX = clampedDx
      setTranslateX(clampedDx)
    }
  }, [isMobile])

  const handleTouchEnd = useCallback(() => {
    if (!isMobile) return
    const t = touchRef.current
    if (t.swiping && t.currentX < -60) {
      // Close tab via simulated click
      onClose({ stopPropagation: () => {} } as unknown as RMouseEvent)
    }
    setTranslateX(0)
    touchRef.current = { startX: 0, currentX: 0, swiping: false }
  }, [isMobile, onClose])

  return (
    <div
      ref={itemRef}
      onClick={onClick}
      onAuxClick={onAuxClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      title={`${tab.repo}/${tab.path}`}
      className={`group flex h-full cursor-pointer items-center gap-1.5 border-r text-sm whitespace-nowrap select-none transition-colors ${
        isMobile ? 'px-2.5' : 'px-3'
      } ${
        isActive
          ? 'bg-background text-foreground'
          : 'text-muted-foreground hover:bg-muted/60'
      }`}
      style={
        translateX !== 0
          ? { transform: `translateX(${translateX}px)`, opacity: 1 + translateX / 120, transition: 'none' }
          : { transition: 'transform 0.2s, opacity 0.2s' }
      }
    >
      {getFileIcon(filename)}
      {/* Mobile: show shortened filename */}
      {isMobile ? (
        <span className="max-w-[80px] truncate text-xs">{filename}</span>
      ) : (
        <span className="max-w-[120px] truncate md:max-w-[160px]">{filename}</span>
      )}
      {isDirty && (
        <span className="size-2 shrink-0 rounded-full bg-amber-500" />
      )}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onClose(event as unknown as RMouseEvent)
        }}
        className={`rounded p-0.5 hover:bg-accent ${
          isMobile
            ? 'opacity-60 hover:opacity-100' // Always visible on mobile
            : isActive
              ? 'opacity-70 hover:opacity-100'
              : 'opacity-0 group-hover:opacity-70 md:opacity-0 md:group-hover:opacity-70'
        }`}
        aria-label="关闭标签"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}