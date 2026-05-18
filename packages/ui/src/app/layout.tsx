import { Monitor, Moon, Sun } from 'lucide-react'
import { Outlet } from 'react-router-dom'

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

export function Layout() {
  useKeyboardShortcuts()
  useTheme()

  const leftPanelVisible = useUIStore((s) => s.leftPanelVisible)
  const rightPanelVisible = useUIStore((s) => s.rightPanelVisible)

  return (
    <div className="h-full">
      {/* Top bar */}
      <div className="flex h-9 items-center justify-between border-b bg-white px-3 dark:bg-gray-950">
        <span className="text-sm font-semibold tracking-tight">Increa Reader</span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>

      {/* Main content area */}
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

      {/* Overlays */}
      <CommandPalette />
      <ShortcutsDialog />
      <ToastContainer />
    </div>
  )
}