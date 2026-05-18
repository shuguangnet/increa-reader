import { Menu, MessageSquare, Monitor, Moon, Sun, X } from 'lucide-react'
import { Outlet } from 'react-router-dom'

import { useIsMobile } from '@/hooks/use-mobile'
import { useTheme } from '@/hooks/use-theme'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useUIStore } from '@/stores/ui-store'
import { Button } from '@/components/ui/button'
import { ChatPanel } from './chat'
import { CommandPalette } from './command-palette'
import { LeftPanel } from './left-panel'
import { ShortcutsDialog } from './shortcuts-dialog'
import { ToastContainer } from './toast'

function ThemeToggle() {
  const { theme, toggle } = useTheme()

  const themeIcon = theme === 'dark' ? <Moon className="size-4" /> : theme === 'light' ? <Sun className="size-4" /> : <Monitor className="size-4" />
  const themeLabel = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'

  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} title={`Theme: ${themeLabel} (click to switch)`}>
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

/** Mobile layout: drawer-based single panel navigation */
function MobileLayout() {
  const leftPanelVisible = useUIStore((s) => s.leftPanelVisible)
  const rightPanelVisible = useUIStore((s) => s.rightPanelVisible)
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel)
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel)

  return (
    <div className="h-[calc(100%-2.75rem)] relative">
      {/* Main content - full width */}
      <div className="h-full bg-white dark:bg-gray-950">
        <Outlet />
      </div>

      {/* Left panel drawer overlay */}
      {leftPanelVisible && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={toggleLeftPanel}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-sm shadow-xl animate-in slide-in-from-left duration-200">
            <LeftPanel />
          </div>
        </>
      )}

      {/* Right panel (chat) - fullscreen on mobile */}
      {rightPanelVisible && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={toggleRightPanel}
          />
          <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 animate-in slide-in-from-bottom duration-200 flex flex-col">
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
        </>
      )}
    </div>
  )
}

export function Layout() {
  useKeyboardShortcuts()
  useTheme()

  const isMobile = useIsMobile()
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel)
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel)

  return (
    <div className="h-full">
      {/* Top bar */}
      <div className="flex h-9 items-center justify-between border-b bg-white px-2 dark:bg-gray-950 md:px-3">
        <div className="flex items-center gap-1.5">
          {isMobile && (
            <Button variant="ghost" size="icon-sm" onClick={toggleLeftPanel} title="Toggle sidebar">
              <Menu className="size-4" />
            </Button>
          )}
          <span className="text-sm font-semibold tracking-tight">Increa Reader</span>
        </div>
        <div className="flex items-center gap-1">
          {isMobile && (
            <Button variant="ghost" size="icon-sm" onClick={toggleRightPanel} title="AI Chat">
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
      <ToastContainer />
    </div>
  )
}