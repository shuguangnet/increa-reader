import { X } from 'lucide-react'
import type { MouseEvent } from 'react'
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

  const handleClose = (event: MouseEvent, tab: Tab) => {
    event.stopPropagation()
    const isClosingActive = tab.id === activeId
    const idx = tabs.findIndex(t => t.id === tab.id)
    const neighbor = isClosingActive ? (tabs[idx + 1] ?? tabs[idx - 1]) : null
    closeTab(tab.id)
    if (!isClosingActive) return
    navigate(neighbor ? `/views/${neighbor.repo}/${neighbor.path}` : '/')
  }

  return (
    <div className="flex h-9 shrink-0 items-center overflow-x-auto border-b bg-muted/30 scrollbar-thin">
      {tabs.map(tab => {
        const isActive = tab.id === activeId
        const filename = tab.path.split('/').pop() ?? tab.path
        const isDirty = editedFiles[`${tab.repo}:${tab.path}`] &&
          editedFiles[`${tab.repo}:${tab.path}`].content !== editedFiles[`${tab.repo}:${tab.path}`].originalContent

        return (
          <div
            key={tab.id}
            onClick={() => handleClick(tab)}
            onAuxClick={event => {
              if (event.button === 1) handleClose(event, tab)
            }}
            title={`${tab.repo}/${tab.path}`}
            className={`group flex h-full cursor-pointer items-center gap-1.5 border-r px-2 text-sm whitespace-nowrap select-none transition-colors md:px-3 ${
              isActive
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:bg-muted/60'
            }`}
          >
            {getFileIcon(filename)}
            {!isMobile && (
              <span className="max-w-[120px] truncate md:max-w-[160px]">{filename}</span>
            )}
            {isDirty && (
              <span className="size-2 shrink-0 rounded-full bg-amber-500" />
            )}
            <button
              type="button"
              onClick={event => handleClose(event, tab)}
              className={`rounded p-0.5 hover:bg-accent ${
                isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70 md:opacity-0 md:group-hover:opacity-70'
              }`}
              aria-label="Close tab"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}