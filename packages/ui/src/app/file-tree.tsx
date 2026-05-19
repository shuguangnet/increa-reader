import { type VirtualItem, useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FileJson,
  FilePlus,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  FolderPlus,
  Image,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteFile } from './api'
import { useFileTreeStore } from '@/stores/file-tree-store'
import { useFavoritesStore } from '@/stores/favorites-store'
import { useIsMobile } from '@/hooks/use-mobile'
import { CreateFileDialog } from './create-file-dialog'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import { RenameDialog } from './rename-dialog'
import type { TreeNode } from './api'

// ─── Types ───────────────────────────────────────────────────────────────────

type ContextMenuState = {
  x: number
  y: number
  node: FlatNode
} | null

/** Flattened list item for virtual scrolling */
type FlatNode = {
  type: 'dir' | 'file'
  name: string
  path: string
  depth: number
  hasChildren: boolean
}

// ─── File Icons ──────────────────────────────────────────────────────────────

type FileIconType = 'code' | 'config' | 'text' | 'image' | 'pdf' | 'default'

const EXT_TO_TYPE: Record<string, FileIconType> = {
  js: 'code', jsx: 'code', ts: 'code', tsx: 'code', py: 'code',
  java: 'code', cpp: 'code', c: 'code', go: 'code', rs: 'code',
  json: 'config', yaml: 'config', yml: 'config', toml: 'config',
  md: 'text', txt: 'text', doc: 'text', docx: 'text',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image',
  pdf: 'pdf',
}

const TYPE_TO_ICON: Record<FileIconType, React.ReactElement> = {
  code: <FileCode className="size-4 shrink-0 text-blue-500" />,
  config: <FileJson className="size-4 shrink-0 text-yellow-500" />,
  text: <FileText className="size-4 shrink-0 text-gray-500" />,
  image: <Image className="size-4 shrink-0 text-purple-500" />,
  pdf: <FileType className="size-4 shrink-0 text-red-500" />,
  default: <File className="size-4 shrink-0 text-gray-400" />,
}

export function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase()
  const type = ext ? EXT_TO_TYPE[ext] || 'default' : 'default'
  return TYPE_TO_ICON[type]
}

// ─── Flatten Tree ───────────────────────────────────────────────────────────

/**
 * Flatten a nested TreeNode[] into a FlatNode[] based on which directories
 * are expanded (provided as a Set of dir paths).
 */
function flattenTree(
  nodes: TreeNode[],
  expandedDirs: Set<string>,
  depth: number,
  result: FlatNode[],
): void {
  // Sort: directories first, then files; alphabetical within each group
  const dirs = nodes.filter(n => n.type === 'dir').sort((a, b) => a.name.localeCompare(b.name))
  const files = nodes.filter(n => n.type === 'file').sort((a, b) => a.name.localeCompare(b.name))
  const sorted = [...dirs, ...files]

  for (const node of sorted) {
    if (node.type === 'dir') {
      const isExpanded = expandedDirs.has(node.path)
      result.push({
        type: 'dir',
        name: node.name,
        path: node.path,
        depth,
        hasChildren: (node.children?.length ?? 0) > 0,
      })
      if (isExpanded && node.children) {
        flattenTree(node.children, expandedDirs, depth + 1, result)
      }
    } else {
      result.push({
        type: 'file',
        name: node.name,
        path: node.path,
        depth,
        hasChildren: false,
      })
    }
  }
}

// ─── Context Menu ────────────────────────────────────────────────────────────

function ContextMenu({
  menuState,
  onClose,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onRename,
  onToggleFavorite,
  onDeleteClick,
}: {
  menuState: ContextMenuState
  onClose: () => void
  onOpenFile?: () => void
  onCreateFile?: () => void
  onCreateFolder?: () => void
  onRename?: () => void
  onToggleFavorite?: () => void
  onDeleteClick?: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [onClose])

  if (!menuState) return null
  const { x, y, node } = menuState

  const menuWidth = 180
  const menuHeight = node.type === 'dir' ? 180 : 160
  const vw = window.innerWidth
  const vh = window.innerHeight
  const safeBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('padding-bottom') || '0')
  const clampedX = Math.max(8, Math.min(x, vw - menuWidth - 8))
  const clampedY = Math.max(8, Math.min(y, vh - menuHeight - 8 - safeBottom))

  return (
    <div
      ref={menuRef}
      className="fixed z-[60] min-w-[160px] rounded-lg border bg-white dark:bg-gray-900 py-1.5 shadow-xl animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left: clampedX, top: clampedY }}
      onContextMenu={e => e.preventDefault()}
    >
      {node.type === 'file' && (
        <div
          className="px-3 py-2.5 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 active:bg-accent/80"
          onClick={() => { onOpenFile?.(); onClose() }}
        >
          <File className="size-4" />
          打开
        </div>
      )}
      {node.type === 'file' && onToggleFavorite && (
        <div
          className="px-3 py-2.5 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 active:bg-accent/80"
          onClick={() => { onToggleFavorite?.(); onClose() }}
        >
          <Star className="size-4" />
          收藏/取消收藏
        </div>
      )}
      <div
        className="px-3 py-2.5 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 active:bg-accent/80"
        onClick={() => { onRename?.(); onClose() }}
      >
        <Pencil className="size-4" />
        重命名
      </div>
      {node.type === 'dir' && (
        <>
          <div
            className="px-3 py-2.5 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 active:bg-accent/80"
            onClick={() => { onCreateFile?.(); onClose() }}
          >
            <FilePlus className="size-4" />
            新建文件
          </div>
          <div
            className="px-3 py-2.5 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 active:bg-accent/80"
            onClick={() => { onCreateFolder?.(); onClose() }}
          >
            <FolderPlus className="size-4" />
            新建文件夹
          </div>
        </>
      )}
      <div className="my-1 border-t border-border" />
      <div
        className="px-3 py-2.5 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 text-destructive active:bg-accent/80"
        onClick={() => { onDeleteClick?.(); onClose() }}
      >
        <Trash2 className="size-4" />
        删除
      </div>
    </div>
  )
}

// ─── Long Press Hook ────────────────────────────────────────────────────────

function useLongPressContextMenu(
  node: FlatNode,
  setContextMenu: (state: ContextMenuState) => void,
) {
  const longPressTimerRef = useRef<number>(0)
  const longPressTriggeredRef = useRef(false)
  const touchStartPosRef = useRef({ x: 0, y: 0 })

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    longPressTriggeredRef.current = false

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true
      if (navigator.vibrate) {
        navigator.vibrate(30)
      }
      setContextMenu({ x: touchStartPosRef.current.x, y: touchStartPosRef.current.y, node })
    }, 500)
  }, [node, setContextMenu])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x)
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y)
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimerRef.current)
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    clearTimeout(longPressTimerRef.current)
  }, [])

  useEffect(() => {
    return () => clearTimeout(longPressTimerRef.current)
  }, [])

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    wasLongPress: longPressTriggeredRef,
  }
}

// ─── VirtualRow (memo-ized row component) ───────────────────────────────────

type VirtualRowProps = {
  node: FlatNode
  repoName: string
  isExpanded: boolean
  isSelected: boolean
  isFav: boolean
  isMobile: boolean
  searchActive: boolean
  onToggleDir: () => void
  onFileClick: () => void
  onToggleFavorite: () => void
  onDelete: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onTouchHandlers?: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: (e: React.TouchEvent) => void
  }
  wasLongPress: React.RefObject<boolean>
  onShowMobileMenu: () => void
}

const VirtualRow = memo(function VirtualRow({
  node,
  isExpanded,
  isSelected,
  isFav,
  isMobile,
  searchActive,
  onToggleDir,
  onFileClick,
  onToggleFavorite,
  onDelete,
  onContextMenu,
  onTouchHandlers,
  wasLongPress,
  onShowMobileMenu,
}: VirtualRowProps) {
  if (node.type === 'file') {
    return (
      <div
        className={`group relative px-2 hover:bg-accent cursor-pointer text-sm flex items-center gap-2 ${
          isMobile ? 'py-2.5' : 'py-1'
        } ${
          isSelected
            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
            : ''
        }`}
        style={{ paddingLeft: `${8 + node.depth * 16}px` }}
        onClick={() => {
          if (wasLongPress.current) {
            wasLongPress.current = false
            return
          }
          onFileClick()
        }}
        onContextMenu={onContextMenu}
        onTouchStart={onTouchHandlers?.onTouchStart}
        onTouchMove={onTouchHandlers?.onTouchMove}
        onTouchEnd={onTouchHandlers?.onTouchEnd}
      >
        {getFileIcon(node.name)}
        <span className="flex-1 truncate">{node.name}</span>
        {isMobile && (
          <button
            type="button"
            className="p-2 -mr-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600 shrink-0 touch-target"
            onClick={e => {
              e.stopPropagation()
              onShowMobileMenu()
            }}
            title="更多操作"
          >
            <MoreHorizontal className="size-4 text-muted-foreground" />
          </button>
        )}
        {!isMobile && (
          <div className="absolute right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isFav ? 'opacity-100' : ''}`}
              onClick={onToggleFavorite}
              title={isFav ? '取消收藏' : '添加收藏'}
            >
              {isFav ? (
                <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
              ) : (
                <Star className="size-3.5 text-gray-600 dark:text-gray-400" />
              )}
            </button>
            <button
              type="button"
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              onClick={e => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <Trash2 className="size-3.5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        )}
        {!isMobile && isFav && (
          <Star className="size-3.5 fill-yellow-400 text-yellow-400 shrink-0 group-hover:hidden" />
        )}
      </div>
    )
  }

  // Directory row
  return (
    <div
      className={`px-2 hover:bg-accent cursor-pointer text-sm flex items-center gap-1 ${isMobile ? 'py-2.5' : 'py-1'}`}
      style={{ paddingLeft: `${8 + node.depth * 16}px` }}
      onClick={() => {
        if (wasLongPress.current) {
          wasLongPress.current = false
          return
        }
        if (searchActive) return
        onToggleDir()
      }}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchHandlers?.onTouchStart}
      onTouchMove={onTouchHandlers?.onTouchMove}
      onTouchEnd={onTouchHandlers?.onTouchEnd}
    >
      {isExpanded ? (
        <ChevronDown className="size-4 shrink-0" />
      ) : (
        <ChevronRight className="size-4 shrink-0" />
      )}
      {isExpanded ? (
        <FolderOpen className="size-4 text-yellow-600" />
      ) : (
        <Folder className="size-4 text-yellow-600" />
      )}
      <span className="flex-1 truncate">{node.name}</span>
      {isMobile && (
        <button
          type="button"
          className="p-2 -mr-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600 shrink-0 touch-target"
          onClick={e => {
            e.stopPropagation()
            onShowMobileMenu()
          }}
          title="更多操作"
        >
          <MoreHorizontal className="size-4 text-muted-foreground" />
        </button>
      )}
    </div>
  )
})

// ─── FileTree (main component with virtual scrolling) ────────────────────────

type FileTreeProps = {
  nodes: TreeNode[]
  onFileClick?: (path: string) => void
  repoName: string
  selectedPath?: string | null
  onDelete?: (path: string) => void
  onRefresh?: () => void
  searchActive?: boolean
  forcedOpenPaths?: Set<string>
}

const ITEM_HEIGHT = 30 // approximate row height
const MOBILE_ITEM_HEIGHT = 44 // larger touch target on mobile

// Stable empty set constant to avoid creating new Set() on every render
const EMPTY_SET = new Set<string>()

export function FileTree({
  nodes,
  onFileClick,
  repoName,
  selectedPath,
  onDelete,
  onRefresh,
  searchActive = false,
  forcedOpenPaths,
}: FileTreeProps) {
  const isMobile = useIsMobile()
  const parentRef = useRef<HTMLDivElement>(null)

  // ── Expanded state from store ──
  // Use stable EMPTY_SET constant to avoid creating new Set() on every render
  const expandedDirs = useFileTreeStore(s => s.expandedDirs[repoName] ?? EMPTY_SET)
  const toggleDir = useFileTreeStore(s => s.toggle)
  const openDir = useFileTreeStore(s => s.open)
  const ensurePathOpen = useFileTreeStore(s => s.ensurePathOpen)

  // During search, merge store expanded + forcedOpenPaths
  const effectiveExpanded = useMemo(() => {
    const forced = forcedOpenPaths ?? EMPTY_SET
    if (!searchActive && forced === EMPTY_SET) return expandedDirs
    const merged = new Set(expandedDirs)
    for (const p of forced) merged.add(p)
    return merged
  }, [searchActive, expandedDirs, forcedOpenPaths])

  // Auto-expand path when selectedPath changes (ensure ancestors are open)
  useEffect(() => {
    if (!selectedPath) return
    // selectedPath is "repoName/path" — extract the path part
    const prefix = `${repoName}/`
    if (!selectedPath.startsWith(prefix)) return
    const pathPart = selectedPath.slice(prefix.length)
    // Find all ancestor directories and open them
    const parts = pathPart.split('/')
    // The last part may be a file; open all ancestor dirs
    for (let i = 1; i < parts.length; i++) {
      const ancestorPath = parts.slice(0, i).join('/')
      if (!expandedDirs.has(ancestorPath)) {
        ensurePathOpen(repoName, ancestorPath)
        break // ensurePathOpen opens all ancestors at once
      }
    }
  }, [selectedPath, repoName, expandedDirs, ensurePathOpen])

  // ── Flatten tree ──
  const flatNodes = useMemo(() => {
    const result: FlatNode[] = []
    flattenTree(nodes, effectiveExpanded, 0, result)
    return result
  }, [nodes, effectiveExpanded])

  // ── Virtualizer ──
  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => isMobile ? MOBILE_ITEM_HEIGHT : ITEM_HEIGHT,
    overscan: 20,
  })

  // ── Dialogs & context menu state ──
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>(null)
  const [deleteDialogState, setDeleteDialogState] = useState<{ open: boolean; node: FlatNode | null }>({
    open: false,
    node: null,
  })
  const [renameDialogState, setRenameDialogState] = useState<{ open: boolean; node: FlatNode | null }>({
    open: false,
    node: null,
  })
  const [createDialogState, setCreateDialogState] = useState<{
    open: boolean
    type: 'file' | 'dir'
    node: FlatNode | null
  }>({ open: false, type: 'file', node: null })

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null)
  }, [])

  // ── Favorites (optimized selectors) ──
  const isFavorite = useCallback(
    (nodePath: string) => {
      const cleanPath = nodePath.startsWith('/') ? nodePath.slice(1) : nodePath
      return useFavoritesStore.getState().favorites.some(
        f => f.repo === repoName && f.path === cleanPath,
      )
    },
    [repoName],
  )

  // We subscribe to favorites count to detect changes — but use getState() in render
  // to avoid re-rendering all items when one favorite changes
  const _favCount = useFavoritesStore(s => s.favorites.length)
  void _favCount // suppress unused warning; subscription needed for reactivity

  const addFavorite = useFavoritesStore(s => s.addFavorite)
  const removeFavorite = useFavoritesStore(s => s.removeFavorite)

  // ── Delete handler ──
  const handleDelete = useCallback(
    async (node: FlatNode) => {
      try {
        await deleteFile(repoName, node.path)
        setDeleteDialogState({ open: false, node: null })
        onDelete?.(node.path)
        onRefresh?.()
      } catch (error) {
        console.error('Failed to delete:', error)
      }
    },
    [repoName, onDelete, onRefresh],
  )

  return (
    <div
      ref={parentRef}
      className="text-foreground overflow-auto"
      style={{ height: '100%' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualItem => {
          const node = flatNodes[virtualItem.index]!
          const isDirExpanded = node.type === 'dir' && effectiveExpanded.has(node.path)
          const isSelected =
            node.type === 'file' && selectedPath === `${repoName}/${node.path}`
          const fav = node.type === 'file' ? isFavorite(node.path) : false

          return (
            <VirtualRowAdapter
              key={node.path}
              virtualItem={virtualItem}
              node={node}
              repoName={repoName}
              isExpanded={isDirExpanded}
              isSelected={isSelected}
              isFav={fav}
              isMobile={isMobile}
              searchActive={searchActive}
              effectiveExpanded={effectiveExpanded}
              onFileClick={onFileClick}
              toggleDir={toggleDir}
              addFavorite={addFavorite}
              removeFavorite={removeFavorite}
              setContextMenuState={setContextMenuState}
              setDeleteDialogState={setDeleteDialogState}
              handleDelete={handleDelete}
              onRefresh={onRefresh}
            />
          )
        })}
      </div>

      {/* Context Menu */}
      {contextMenuState && (
        <ContextMenu
          menuState={contextMenuState}
          onClose={closeContextMenu}
          onOpenFile={
            contextMenuState.node.type === 'file'
              ? () => onFileClick?.(contextMenuState.node.path)
              : undefined
          }
          onToggleFavorite={
            contextMenuState.node.type === 'file'
              ? () => {
                  const n = contextMenuState.node
                  const cleanPath = n.path.startsWith('/') ? n.path.slice(1) : n.path
                  if (isFavorite(n.path)) {
                    removeFavorite(repoName, cleanPath)
                  } else {
                    addFavorite(repoName, cleanPath)
                  }
                }
              : undefined
          }
          onRename={() => setRenameDialogState({ open: true, node: contextMenuState.node })}
          onCreateFile={
            contextMenuState.node.type === 'dir'
              ? () => {
                  setCreateDialogState({
                    open: true,
                    type: 'file',
                    node: contextMenuState.node,
                  })
                }
              : undefined
          }
          onCreateFolder={
            contextMenuState.node.type === 'dir'
              ? () => {
                  setCreateDialogState({
                    open: true,
                    type: 'dir',
                    node: contextMenuState.node,
                  })
                }
              : undefined
          }
          onDeleteClick={() => setDeleteDialogState({ open: true, node: contextMenuState.node })}
        />
      )}

      {/* Dialogs — rendered once at FileTree level, not per row */}
      <DeleteConfirmDialog
        open={deleteDialogState.open}
        onOpenChange={open => setDeleteDialogState(s => ({ ...s, open }))}
        fileName={deleteDialogState.node?.name ?? ''}
        onConfirm={() => {
          if (deleteDialogState.node) handleDelete(deleteDialogState.node)
        }}
        isDeleting={false}
      />
      <RenameDialog
        open={renameDialogState.open}
        onOpenChange={open => setRenameDialogState(s => ({ ...s, open }))}
        repoName={repoName}
        path={renameDialogState.node?.path ?? ''}
        currentName={renameDialogState.node?.name ?? ''}
        onRenamed={() => onRefresh?.()}
      />
      <CreateFileDialog
        open={createDialogState.open}
        onOpenChange={open => setCreateDialogState(s => ({ ...s, open }))}
        repoName={repoName}
        parentPath={createDialogState.node?.path ?? ''}
        defaultType={createDialogState.type}
        onCreated={() => {
          // Open the parent dir after creation
          if (createDialogState.node) {
            openDir(repoName, createDialogState.node.path)
          }
          onRefresh?.()
        }}
      />
    </div>
  )
}

// ─── VirtualRow Adapter (connects virtual row to actions) ─────────────────────

type VirtualRowAdapterProps = {
  virtualItem: VirtualItem
  node: FlatNode
  repoName: string
  isExpanded: boolean
  isSelected: boolean
  isFav: boolean
  isMobile: boolean
  searchActive: boolean
  effectiveExpanded: Set<string>
  onFileClick?: (path: string) => void
  toggleDir: (repoName: string, dirPath: string) => void
  addFavorite: (repo: string, path: string) => void
  removeFavorite: (repo: string, path: string) => void
  setContextMenuState: (state: ContextMenuState) => void
  setDeleteDialogState: (state: { open: boolean; node: FlatNode | null }) => void
  handleDelete: (node: FlatNode) => void
  onRefresh?: () => void
}

function VirtualRowAdapter({
  virtualItem,
  node,
  repoName,
  isExpanded,
  isSelected,
  isFav,
  isMobile,
  searchActive,
  onFileClick,
  toggleDir,
  addFavorite,
  removeFavorite,
  setContextMenuState,
  setDeleteDialogState,
}: VirtualRowAdapterProps) {
  // Long press handlers
  const { handleTouchStart, handleTouchMove, handleTouchEnd, wasLongPress } =
    useLongPressContextMenu(node, setContextMenuState)

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenuState({ x: e.clientX, y: e.clientY, node })
    },
    [node, setContextMenuState],
  )

  const handleToggleFavorite = useCallback(() => {
    const cleanPath = node.path.startsWith('/') ? node.path.slice(1) : node.path
    if (isFav) {
      removeFavorite(repoName, cleanPath)
    } else {
      addFavorite(repoName, cleanPath)
    }
  }, [isFav, node.path, repoName, addFavorite, removeFavorite])

  const handleShowMobileMenu = useCallback(() => {
    setContextMenuState({ x: 0, y: 0, node })
  }, [node, setContextMenuState])

  const handleFileClick = useCallback(() => {
    onFileClick?.(node.path)
  }, [onFileClick, node.path])

  const handleToggleDir = useCallback(() => {
    toggleDir(repoName, node.path)
  }, [toggleDir, repoName, node.path])

  const handleDeleteClick = useCallback(() => {
    setDeleteDialogState({ open: true, node })
  }, [setDeleteDialogState, node])

  const touchHandlers = isMobile
    ? { onTouchStart: handleTouchStart, onTouchMove: handleTouchMove, onTouchEnd: handleTouchEnd }
    : undefined

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${virtualItem.size}px`,
        transform: `translateY(${virtualItem.start}px)`,
      }}
    >
      <VirtualRow
        node={node}
        repoName={repoName}
        isExpanded={isExpanded}
        isSelected={isSelected}
        isFav={isFav}
        isMobile={isMobile}
        searchActive={searchActive}
        onToggleDir={handleToggleDir}
        onFileClick={handleFileClick}
        onToggleFavorite={handleToggleFavorite}
        onDelete={handleDeleteClick}
        onContextMenu={handleContextMenu}
        onTouchHandlers={touchHandlers}
        wasLongPress={wasLongPress}
        onShowMobileMenu={handleShowMobileMenu}
      />
    </div>
  )
}