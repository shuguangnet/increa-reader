import { Command, Download, Home, Menu, MessageSquare, Monitor, Moon, RefreshCw, Search, Sun, X } from 'lucide-react'
import { useCallback, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'

import { useIsMobile } from '@/hooks/use-mobile'
import { usePWAInstall } from '@/hooks/use-pwa-install'
import { useTheme } from '@/hooks/use-theme'
import { useServiceWorkerUpdate } from '@/hooks/use-pwa'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useUIStore } from '@/stores/ui-store'
import { Button } from '@/components/ui/button'
import { ChatPanel } from './chat'
import { CommandPalette } from './command-palette'
import { LeftPanel } from './left-panel'
import { SearchPanel } from './search-panel'
import { ShortcutsDialog } from './shortcuts-dialog'
import { ToastContainer } from './toast'

/** PWA update notification banner */
function PWAUpdateBanner() {
  const { updateStatus, applyUpdate, dismissUpdate } = useServiceWorkerUpdate()

  if (updateStatus !== 'update-available') return null

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs animate-in slide-in-from-top duration-300">
      <RefreshCw className="size-3.5 shrink-0" />
      <span className="flex-1">新版本可用</span>
      <button
        type="button"
        onClick={applyUpdate}
        className="rounded px-2 py-0.5 bg-white/20 hover:bg-white/30 transition-colors font-medium"
      >
        更新
      </button>
      <button
        type="button"
        onClick={dismissUpdate}
        className="rounded p-0.5 hover:bg-white/20 transition-colors"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()

  const themeIcon = theme === 'dark' ? <Moon className="size-4" /> : theme === 'light' ? <Sun className="size-4" /> : <Monitor className="size-4" />
  const themeLabel = theme === 'dark' ? '深色' : theme === 'light' ? '浅色' : '跟随系统'

  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} title={`主题: ${themeLabel}（点击切换）`}>
      {themeIcon}
    </Button>
  )
}

/** Desktop layout: three resizable panels */
function DesktopLayout() {
  const leftPanelVisible = useUIStore((s) => s.leftPanelVisible)
  const rightPanelVisible = useUIStore((s) => s.rightPanelVisible)

  return (
    <div className="h-[calc(100%-2.25rem)]">
      <ResizablePanelGroup direction="horizontal" className="h-full" autoSaveId="main-layout">
        {leftPanelVisible && (
          <>
            <ResizablePanel defaultSize={20} minSize={1}>
              <LeftPanel />
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}
        <ResizablePanel defaultSize={50} minSize={1}>
          <div className="h-full bg-white dark:bg-gray-950">
            <Outlet />
          </div>
        </ResizablePanel>
        {rightPanelVisible && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize={30} minSize={1}>
              <ChatPanel />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  )
}

/** Mobile layout: drawer-based single panel navigation with bottom nav bar */
function MobileLayout() {
  const leftPanelVisible = useUIStore((s) => s.leftPanelVisible)
  const rightPanelVisible = useUIStore((s) => s.rightPanelVisible)
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel)
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel)
  const setSearchPanelOpen = useUIStore((s) => s.setSearchPanelOpen)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const navigate = useNavigate()

  return (
    <div className="h-[calc(100%-2.75rem)] relative">
      {/* Main content - full width */}
      <div className="h-full bg-white dark:bg-gray-950">
        <Outlet />
      </div>

      {/* Left panel drawer overlay with swipe-to-close */}
      {leftPanelVisible && (
        <SwipeableDrawer
          side="left"
          onClose={toggleLeftPanel}
        >
          <LeftPanel />
        </SwipeableDrawer>
      )}

      {/* Right panel (chat) - fullscreen on mobile with swipe-to-close */}
      {rightPanelVisible && (
        <SwipeableDrawer
          side="bottom"
          onClose={toggleRightPanel}
        >
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between border-b px-3 py-2 bg-gray-50 dark:bg-gray-900">
              <span className="text-sm font-medium">AI Chat</span>
              <Button variant="ghost" size="icon-sm" onClick={toggleRightPanel}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <ChatPanel hideHeader />
            </div>
          </div>
        </SwipeableDrawer>
      )}

      {/* Mobile bottom navigation bar */}
      <MobileNavBar
        onHome={() => navigate('/')}
        onSearch={() => setSearchPanelOpen(true)}
        onCommand={() => setCommandPaletteOpen(true)}
        onChat={toggleRightPanel}
      />
    </div>
  )
}

/** Swipeable drawer component with touch gesture support */
function SwipeableDrawer({
  side,
  onClose,
  children,
}: {
  side: 'left' | 'bottom'
  onClose: () => void
  children: React.ReactNode
}) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const touchRef = useRef<{ startX: number; startY: number; currentX: number; swiping: boolean }>({
    startX: 0, startY: 0, currentX: 0, swiping: false,
  })

  const isLeft = side === 'left'
  const threshold = 60

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, currentX: 0, swiping: false }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    const t = touchRef.current
    const dx = touch.clientX - t.startX
    const dy = touch.clientY - t.startY

    // Determine if this is a horizontal (left drawer) or vertical (bottom drawer) swipe
    if (!t.swiping) {
      if (isLeft) {
        // Only start swiping if horizontal movement exceeds vertical
        if (Math.abs(dx) < Math.abs(dy)) return
        // Only allow swipe to the left for left drawer
        if (dx < -5) t.swiping = true
      } else {
        // Only start swiping if vertical movement exceeds horizontal
        if (Math.abs(dy) < Math.abs(dx)) return
        // Only allow swipe down for bottom drawer
        if (dy < -5) return // Swiping up should not close
        if (dy > 5) t.swiping = true
      }
    }

    if (t.swiping && drawerRef.current) {
      if (isLeft) {
        const translateX = Math.min(0, dx) // Only translate left
        drawerRef.current.style.transform = `translateX(${translateX}px)`
        drawerRef.current.style.transition = 'none'
        t.currentX = dx
      } else {
        const translateY = Math.max(0, dy) // Only translate down
        drawerRef.current.style.transform = `translateY(${translateY}px)`
        drawerRef.current.style.transition = 'none'
        t.currentX = dy
      }
    }
  }, [isLeft])

  const handleTouchEnd = useCallback(() => {
    const t = touchRef.current
    if (drawerRef.current) {
      drawerRef.current.style.transform = ''
      drawerRef.current.style.transition = ''
    }
    if (t.swiping) {
      if (isLeft && t.currentX < -threshold) {
        onClose()
      } else if (!isLeft && t.currentX > threshold) {
        onClose()
      }
    }
    touchRef.current.swiping = false
  }, [isLeft, onClose, threshold])

  const overlayClass = isLeft
    ? 'fixed inset-y-0 left-0 z-50 w-[85vw] max-w-sm shadow-xl animate-in slide-in-from-left duration-200'
    : 'fixed inset-0 z-50 bg-white dark:bg-gray-950 animate-in slide-in-from-bottom duration-200'

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        className={overlayClass}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </>
  )
}

/** Mobile bottom navigation bar for quick access to core features */
function MobileNavBar({ onHome, onSearch, onCommand, onChat }: {
  onHome: () => void
  onSearch: () => void
  onCommand: () => void
  onChat: () => void
}) {
  return (
    <div className="flex items-center justify-around border-t bg-white dark:bg-gray-950 safe-area-inset-bottom">
      <button
        type="button"
        onClick={onHome}
        className="flex flex-col items-center gap-0.5 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Home className="size-5" />
        <span className="text-[10px]">首页</span>
      </button>
      <button
        type="button"
        onClick={onSearch}
        className="flex flex-col items-center gap-0.5 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Search className="size-5" />
        <span className="text-[10px]">搜索</span>
      </button>
      <button
        type="button"
        onClick={onCommand}
        className="flex flex-col items-center gap-0.5 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Command className="size-5" />
        <span className="text-[10px]">命令</span>
      </button>
      <button
        type="button"
        onClick={onChat}
        className="flex flex-col items-center gap-0.5 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageSquare className="size-5" />
        <span className="text-[10px]">AI</span>
      </button>
    </div>
  )
}

export function Layout() {
  useKeyboardShortcuts()
  useTheme()

  const isMobile = useIsMobile()
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel)
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel)
  const searchPanelOpen = useUIStore((s) => s.searchPanelOpen)
  const setSearchPanelOpen = useUIStore((s) => s.setSearchPanelOpen)
  const { installable, install } = usePWAInstall()

  const handleInstall = useCallback(() => {
    install().catch(console.error)
  }, [install])

  return (
    <div className="h-full">
      {/* PWA update banner */}
      <PWAUpdateBanner />

      {/* Top bar */}
      <div className="flex h-9 items-center justify-between border-b bg-white px-2 dark:bg-gray-950 md:px-3">
        <div className="flex items-center gap-1.5">
          {isMobile && (
            <Button variant="ghost" size="icon-sm" onClick={toggleLeftPanel} title="侧边栏">
              <Menu className="size-4" />
            </Button>
          )}
          <span className="text-sm font-semibold tracking-tight">Increa Reader</span>
        </div>
        <div className="flex items-center gap-1">
          {!isMobile && (
            <>
              <Button variant="ghost" size="icon-sm" onClick={() => setSearchPanelOpen(true)} title="全局搜索">
                <Search className="size-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={toggleRightPanel} title="AI 助手">
                <MessageSquare className="size-4" />
              </Button>
            </>
          )}
          {installable && (
            <Button variant="ghost" size="icon-sm" onClick={handleInstall} title="安装应用">
              <Download className="size-4" />
            </Button>
          )}
          {isMobile && (
            <Button variant="ghost" size="icon-sm" onClick={toggleRightPanel} title="AI 助手">
              <MessageSquare className="size-4" />
            </Button>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Main content area */}
      {isMobile ? <MobileLayout /> : <DesktopLayout />}

      {/* Overlays */}
      <CommandPalette />
      <ShortcutsDialog />
      <SearchPanel open={searchPanelOpen} onClose={() => setSearchPanelOpen(false)} />
      <ToastContainer />
    </div>
  )
}