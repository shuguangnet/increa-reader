import { Command, Download, Home, Info, Menu, MessageSquare, Monitor, Moon, RefreshCw, Search, Share, Smartphone, Sun, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useIsMobile } from '@/hooks/use-mobile'
import { usePWAInstall } from '@/hooks/use-pwa-install'
import { useTheme } from '@/hooks/use-theme'
import { useServiceWorkerUpdate } from '@/hooks/use-pwa'
import { useFileDrop } from '@/hooks/use-file-drop'
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
import { platform } from '@/lib/platform'

/** PWA update notification banner with version and progress */
function PWAUpdateBanner() {
  const { updateStatus, applyUpdate, dismissUpdate, appVersion } = useServiceWorkerUpdate()
  const [remindLater, setRemindLater] = useState(false)

  if (updateStatus !== 'update-available' && updateStatus !== 'updating' || remindLater) return null

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs animate-in slide-in-from-top duration-300">
      {updateStatus === 'update-available' && (
        <>
          <RefreshCw className="size-3.5 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
          <span className="flex-1">
            新版本可用
            <span className="ml-1 opacity-75">({appVersion})</span>
          </span>
          <button
            type="button"
            onClick={applyUpdate}
            className="rounded px-2 py-0.5 bg-white/20 hover:bg-white/30 transition-colors font-medium"
          >
            更新
          </button>
          <button
            type="button"
            onClick={() => setRemindLater(true)}
            className="rounded px-2 py-0.5 hover:bg-white/20 transition-colors"
          >
            稍后
          </button>
          <button
            type="button"
            onClick={dismissUpdate}
            className="rounded p-0.5 hover:bg-white/20 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </>
      )}
      {updateStatus === 'updating' && (
        <>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <RefreshCw className="size-3.5 shrink-0 animate-spin" />
              <span>正在更新…</span>
            </div>
            <div className="mt-1 h-0.5 w-full bg-white/30 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full animate-progress-bar" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** PWA install prompt with iOS Safari guidance */
function PWAInstallPrompt() {
  const {
    shouldShowInstall,
    install,
    isIOS,
    showIOSGuide,
    showIOSInstallGuide,
    dismissIOSGuide,
    dismissPermanently,
    showThanks,
    dismissThanks,
  } = usePWAInstall()

  if (!shouldShowInstall) return null

  // Show "thanks" toast after successful install
  if (showThanks) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm rounded-lg shadow-lg animate-in slide-in-from-bottom duration-300">
        <Info className="size-4 shrink-0" />
        <span>🎉 已成功安装到主屏幕！</span>
        <button type="button" onClick={dismissThanks} className="ml-2 rounded p-0.5 hover:bg-white/20">
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  // iOS Safari install guide modal
  if (showIOSGuide) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
        <div className="bg-white dark:bg-gray-900 rounded-t-xl sm:rounded-xl w-full max-w-sm p-5 shadow-2xl animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">添加到主屏幕</h3>
            <button type="button" onClick={dismissIOSGuide} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="size-5 text-gray-500" />
            </button>
          </div>
          <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">1</span>
              <span>点击底部工具栏的 <strong>分享按钮</strong> <Share className="inline size-4 text-blue-500 mx-0.5" /></span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">2</span>
              <span>在弹出的菜单中找到 <strong>「添加到主屏幕」</strong> <Smartphone className="inline size-4 text-green-500 mx-0.5" /></span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">3</span>
              <span>点击 <strong>「添加」</strong> 即可，Increa Reader 图标将出现在主屏幕上</span>
            </li>
          </ol>
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between">
            <button type="button" onClick={dismissPermanently} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              不再提示
            </button>
            <button type="button" onClick={dismissIOSGuide} className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
              知道了
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Standard install prompt for Chromium browsers
  if (isIOS) {
    // iOS: show a small banner prompting to open the guide
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm rounded-lg shadow-lg animate-in slide-in-from-bottom duration-300">
        <Smartphone className="size-4 shrink-0" />
        <span>安装 Increa Reader 到主屏幕</span>
        <button type="button" onClick={showIOSInstallGuide} className="rounded px-2 py-0.5 bg-white/20 hover:bg-white/30 transition-colors font-medium">
          查看步骤
        </button>
        <button type="button" onClick={dismissPermanently} className="rounded p-0.5 hover:bg-white/20 transition-colors">
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  // Non-iOS (Chrome, Edge, etc.)
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm rounded-lg shadow-lg animate-in slide-in-from-bottom duration-300">
      <Download className="size-4 shrink-0" />
      <span>安装 Increa Reader</span>
      <button type="button" onClick={() => { install().catch(console.error) }} className="rounded px-2 py-0.5 bg-white/20 hover:bg-white/30 transition-colors font-medium">
        安装
      </button>
      <button type="button" onClick={dismissPermanently} className="rounded p-0.5 hover:bg-white/20 transition-colors">
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
    <div className="h-[calc(100%-2.75rem)] relative safe-top">
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
  // Determine active tab based on current location
  const location = useLocation()
  const rightPanelVisible = useUIStore((s) => s.rightPanelVisible)

  // Determine active state: highlight the tab that matches the current view
  const isHome = location.pathname === '/'
  const isFiles = location.pathname.startsWith('/views/')
  const isGraph = location.pathname.startsWith('/graph')
  const isChatActive = rightPanelVisible

  type NavKey = 'home' | 'search' | 'command' | 'chat'

  const navItems: { key: NavKey; label: string; icon: typeof Home; onClick: () => void; active: boolean }[] = [
    { key: 'home', label: '首页', icon: Home, onClick: onHome, active: isHome },
    { key: 'search', label: '搜索', icon: Search, onClick: onSearch, active: false },
    { key: 'command', label: '文件', icon: Command, onClick: onCommand, active: isFiles || isGraph },
    { key: 'chat', label: 'AI', icon: MessageSquare, onClick: onChat, active: isChatActive },
  ]

  return (
    <div className="flex items-center justify-around border-t bg-white dark:bg-gray-950 safe-bottom">
      {navItems.map(item => {
        const Icon = item.icon
        return (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 transition-colors touch-target relative ${
              item.active
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
            {item.active && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
            )}
          </button>
        )
      })}
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
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  // File drop handler — creates a visual highlight and logs dropped files
  const { isOver, dropHandler } = useFileDrop(useCallback((files) => {
    console.log('[Layout] Dropped files:', files)
    // TODO: integrate with file import API when available
  }, []))

  // Listen for native menu actions from Tauri (menu bar / tray)
  useEffect(() => {
    if (!platform.isDesktop()) return

    const unlisten = platform.onMenuAction((action) => {
      switch (action) {
        case 'open-repo':
          // For now, open folder dialog — could be wired to a store action
          platform.openFolderDialog().then((path) => {
            if (path) console.log('[Layout] Open repo:', path)
          })
          break
        case 'new-file':
          // Could open a new file creation dialog
          console.log('[Layout] Menu action: new-file')
          break
        case 'save':
          // Trigger save in editor if available
          console.log('[Layout] Menu action: save')
          break
        case 'quit':
          platform.closeWindow()
          break
        case 'toggle-sidebar':
          toggleLeftPanel()
          break
        case 'toggle-ai-panel':
          toggleRightPanel()
          break
        case 'command-palette':
          setCommandPaletteOpen(true)
          break
        case 'global-search':
          setSearchPanelOpen(true)
          break
        case 'about':
          console.log('[Layout] Menu action: about')
          break
        default:
          console.log('[Layout] Unknown menu action:', action)
      }
    })

    return () => {
      unlisten.then((fn) => fn()).catch(() => {})
    }
  }, [toggleLeftPanel, toggleRightPanel, setCommandPaletteOpen, setSearchPanelOpen])

  return (
    <div
      className={`h-full${isOver ? ' ring-2 ring-blue-500 ring-offset-2' : ''}`}
      onDrop={dropHandler as unknown as React.ReactEventHandler<HTMLDivElement>}
    >
      {/* Drag overlay */}
      {isOver && (
        <div className="fixed inset-0 z-[9999] bg-blue-500/10 border-4 border-dashed border-blue-500 pointer-events-none flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 px-6 py-4 rounded-xl shadow-xl">
            <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">释放文件以导入</p>
            <p className="text-sm text-muted-foreground mt-1">支持 .md, .txt, .pdf, .html, .json 等格式</p>
          </div>
        </div>
      )}
      {/* PWA update banner */}
      <PWAUpdateBanner />

      {/* Top bar */}
      <div className="flex h-9 items-center justify-between border-b bg-white px-2 dark:bg-gray-950 md:px-3 safe-top">
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

      {/* PWA install prompt */}
      <PWAInstallPrompt />

      {/* Overlays */}
      <CommandPalette />
      <ShortcutsDialog />
      <SearchPanel open={searchPanelOpen} onClose={() => setSearchPanelOpen(false)} />
      <ToastContainer />
    </div>
  )
}