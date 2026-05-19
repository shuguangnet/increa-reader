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
import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteFile } from './api'
import { useFavoritesStore } from '@/stores/favorites-store'
import { useIsMobile } from '@/hooks/use-mobile'
import { CreateFileDialog } from './create-file-dialog'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import { RenameDialog } from './rename-dialog'

type TreeNode = {
  type: 'dir' | 'file'
  name: string
  path: string
  children?: TreeNode[]
}

type ContextMenuState = {
  x: number
  y: number
  node: TreeNode
} | null

type TreeItemProps = {
  node: TreeNode
  onFileClick?: (path: string) => void
  repoName: string
  selectedPath?: string | null
  onDelete?: (path: string) => void
  onRefresh?: () => void
  searchActive?: boolean
  forcedOpenPaths?: Set<string>
}

type FileIconType = 'code' | 'config' | 'text' | 'image' | 'pdf' | 'default'

const EXT_TO_TYPE: Record<string, FileIconType> = {
  js: 'code',
  jsx: 'code',
  ts: 'code',
  tsx: 'code',
  py: 'code',
  java: 'code',
  cpp: 'code',
  c: 'code',
  go: 'code',
  rs: 'code',
  json: 'config',
  yaml: 'config',
  yml: 'config',
  toml: 'config',
  md: 'text',
  txt: 'text',
  doc: 'text',
  docx: 'text',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
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

  // Clamp menu position to stay within viewport
  const menuWidth = 180
  const menuHeight = node.type === 'dir' ? 180 : 160
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clampedX = Math.min(x, vw - menuWidth - 8)
  const clampedY = Math.min(y, vh - menuHeight - 8)

  return (
    <div
      ref={menuRef}
      className="fixed z-[60] min-w-[160px] rounded-lg border bg-white dark:bg-gray-900 py-1.5 shadow-xl animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left: clampedX, top: clampedY }}
      onContextMenu={e => e.preventDefault()}
    >
      {node.type === 'file' && (
        <div
          className="px-3 py-2 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 active:bg-accent/80"
          onClick={() => { onOpenFile?.(); onClose() }}
        >
          <File className="size-4" />
          打开
        </div>
      )}
      {node.type === 'file' && onToggleFavorite && (
        <div
          className="px-3 py-2 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 active:bg-accent/80"
          onClick={() => { onToggleFavorite?.(); onClose() }}
        >
          <Star className="size-4" />
          收藏/取消收藏
        </div>
      )}
      <div
        className="px-3 py-2 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 active:bg-accent/80"
        onClick={() => { onRename?.(); onClose() }}
      >
        <Pencil className="size-4" />
        重命名
      </div>
      {node.type === 'dir' && (
        <>
          <div
            className="px-3 py-2 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 active:bg-accent/80"
            onClick={() => { onCreateFile?.(); onClose() }}
          >
            <FilePlus className="size-4" />
            新建文件
          </div>
          <div
            className="px-3 py-2 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 active:bg-accent/80"
            onClick={() => { onCreateFolder?.(); onClose() }}
          >
            <FolderPlus className="size-4" />
            新建文件夹
          </div>
        </>
      )}
      <div className="my-1 border-t border-border" />
      <div
        className="px-3 py-2 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 text-destructive active:bg-accent/80"
        onClick={() => { onDeleteClick?.(); onClose() }}
      >
        <Trash2 className="size-4" />
        删除
      </div>
    </div>
  )
}

/**
 * Hook for long-press touch gesture to trigger context menu on mobile.
 * Returns touch event handlers and a "long-press triggered" flag for visual feedback.
 */
function useLongPressContextMenu(
  node: TreeNode,
  setContextMenu: (state: ContextMenuState) => void,
) {
  const longPressTimerRef = useRef<number>(0)
  const longPressTriggeredRef = useRef(false)
  const touchStartPosRef = useRef({ x: 0, y: 0 })

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    longPressTriggeredRef.current = false

    // Start long-press timer (500ms)
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true
      // Provide haptic feedback if available
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
    // Cancel long press if finger moves more than 10px
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimerRef.current)
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    clearTimeout(longPressTimerRef.current)
  }, [])

  // Cleanup on unmount
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

function TreeItem({
  node,
  onFileClick,
  repoName,
  selectedPath,
  onDelete,
  onRefresh,
  searchActive = false,
  forcedOpenPaths = new Set<string>(),
}: TreeItemProps) {
  const isMobile = useIsMobile()
  const storageKey = `filetree-${repoName}-${node.path}`
  const isSelected = selectedPath === `${repoName}/${node.path}`

  const shouldAutoOpen = isSelected || selectedPath?.startsWith(`${repoName}/${node.path}/`)
  const [isOpen, setIsOpen] = useState(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored === null) return shouldAutoOpen
    try {
      return JSON.parse(stored)
    } catch {
      return shouldAutoOpen
    }
  })
  const effectiveIsOpen = searchActive ? forcedOpenPaths.has(node.path) : isOpen

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createDialogType, setCreateDialogType] = useState<'file' | 'dir'>('file')
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)

  useEffect(() => {
    if (searchActive) return
    localStorage.setItem(storageKey, JSON.stringify(isOpen))
  }, [isOpen, searchActive, storageKey])

  useEffect(() => {
    if (searchActive || !shouldAutoOpen) return
    setIsOpen(true)
  }, [searchActive, shouldAutoOpen])

  const handleRefresh = useCallback(() => {
    onRefresh?.()
  }, [onRefresh])

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteFile(repoName, node.path)
      setDeleteDialogOpen(false)
      onDelete?.(node.path)
      onRefresh?.()
    } catch (error) {
      console.error('Failed to delete:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  // Long-press support for mobile context menu
  const { handleTouchStart, handleTouchMove, handleTouchEnd, wasLongPress } =
    useLongPressContextMenu(node, setContextMenu)

  const favorites = useFavoritesStore(s => s.favorites)
  const isFav = favorites.some(f => f.repo === repoName && f.path === (node.path.startsWith('/') ? node.path.slice(1) : node.path))
  const addFavorite = useFavoritesStore(s => s.addFavorite)
  const removeFavorite = useFavoritesStore(s => s.removeFavorite)

  const toggleFavorite = useCallback(
    (e?: React.MouseEvent | React.TouchEvent) => {
      e?.stopPropagation()
      if (isFav) {
        removeFavorite(repoName, node.path)
      } else {
        addFavorite(repoName, node.path)
      }
    },
    [isFav, repoName, node.path, addFavorite, removeFavorite],
  )

  if (node.type === 'file') {
    return (
      <>
        <div
          className={`group relative py-1 px-2 hover:bg-accent cursor-pointer text-sm flex items-center gap-2 ${
            isSelected
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
              : ''
          }`}
          onClick={() => {
            // On mobile, if long-press was just triggered, ignore the click
            if (wasLongPress.current) {
              wasLongPress.current = false
              return
            }
            onFileClick?.(node.path)
          }}
          onContextMenu={handleContextMenu}
          onTouchStart={isMobile ? handleTouchStart : undefined}
          onTouchMove={isMobile ? handleTouchMove : undefined}
          onTouchEnd={isMobile ? handleTouchEnd : undefined}
        >
          {getFileIcon(node.name)}
          <span className="flex-1 truncate">{node.name}</span>
          {/* Mobile: always-visible "more" button to trigger context menu */}
          {isMobile && (
            <button
              type="button"
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600 shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                const rect = (e.target as HTMLElement).getBoundingClientRect()
                setContextMenu({ x: rect.left, y: rect.bottom, node })
              }}
              title="更多操作"
            >
              <MoreHorizontal className="size-3.5 text-muted-foreground" />
            </button>
          )}
          {/* Desktop: hover-reveal action buttons */}
          {!isMobile && (
            <div className="absolute right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isFav ? 'opacity-100' : ''}`}
                onClick={toggleFavorite}
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
                  setDeleteDialogOpen(true)
                }}
              >
                <Trash2 className="size-3.5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          )}
          {/* Show star inline when favorited and not hovered (desktop only) */}
          {!isMobile && isFav && (
            <Star className="size-3.5 fill-yellow-400 text-yellow-400 shrink-0 group-hover:hidden" />
          )}
        </div>
        {contextMenu && (
          <ContextMenu
            menuState={contextMenu}
            onClose={closeContextMenu}
            onOpenFile={() => onFileClick?.(node.path)}
            onToggleFavorite={toggleFavorite}
            onRename={() => setRenameDialogOpen(true)}
            onDeleteClick={() => setDeleteDialogOpen(true)}
          />
        )}
        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          fileName={node.name}
          onConfirm={handleDelete}
          isDeleting={isDeleting}
        />
        <RenameDialog
          open={renameDialogOpen}
          onOpenChange={setRenameDialogOpen}
          repoName={repoName}
          path={node.path}
          currentName={node.name}
          onRenamed={handleRefresh}
        />
      </>
    )
  }

  return (
    <div>
      <div
        className="py-1 px-2 hover:bg-accent cursor-pointer text-sm flex items-center gap-1"
        onClick={() => {
          // On mobile, if long-press was just triggered, ignore the click
          if (wasLongPress.current) {
            wasLongPress.current = false
            return
          }
          if (searchActive) return
          setIsOpen(!isOpen)
        }}
        onContextMenu={handleContextMenu}
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
      >
        {effectiveIsOpen ? (
          <ChevronDown className="size-4 shrink-0" />
        ) : (
          <ChevronRight className="size-4 shrink-0" />
        )}
        {effectiveIsOpen ? (
          <FolderOpen className="size-4 text-yellow-600" />
        ) : (
          <Folder className="size-4 text-yellow-600" />
        )}
        <span className="flex-1 truncate">{node.name}</span>
        {/* Mobile: always-visible "more" button for folders too */}
        {isMobile && (
          <button
            type="button"
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600 shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              const rect = (e.target as HTMLElement).getBoundingClientRect()
              setContextMenu({ x: rect.left, y: rect.bottom, node })
            }}
            title="更多操作"
          >
            <MoreHorizontal className="size-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
      {effectiveIsOpen && node.children && (
        <div className="pl-4">
          {node.children.map(child => (
            <TreeItem
              key={child.path}
              node={child}
              onFileClick={onFileClick}
              repoName={repoName}
              selectedPath={selectedPath}
              onDelete={onDelete}
              onRefresh={onRefresh}
              searchActive={searchActive}
              forcedOpenPaths={forcedOpenPaths}
            />
          ))}
        </div>
      )}
      {contextMenu && (
        <ContextMenu
          menuState={contextMenu}
          onClose={closeContextMenu}
          onCreateFile={() => { setCreateDialogType('file'); setCreateDialogOpen(true) }}
          onCreateFolder={() => { setCreateDialogType('dir'); setCreateDialogOpen(true) }}
          onRename={() => setRenameDialogOpen(true)}
          onDeleteClick={() => setDeleteDialogOpen(true)}
        />
      )}
      <CreateFileDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        repoName={repoName}
        parentPath={node.path}
        defaultType={createDialogType}
        onCreated={handleRefresh}
      />
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        fileName={node.name}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />
      <RenameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        repoName={repoName}
        path={node.path}
        currentName={node.name}
        onRenamed={handleRefresh}
      />
    </div>
  )
}

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

export function FileTree({
  nodes,
  onFileClick,
  repoName,
  selectedPath,
  onDelete,
  onRefresh,
  searchActive = false,
  forcedOpenPaths = new Set<string>(),
}: FileTreeProps) {
  return (
    <div className="text-foreground">
      {nodes.map(node => (
        <TreeItem
          key={node.path}
          node={node}
          onFileClick={onFileClick}
          repoName={repoName}
          selectedPath={selectedPath}
          onDelete={onDelete}
          onRefresh={onRefresh}
          searchActive={searchActive}
          forcedOpenPaths={forcedOpenPaths}
        />
      ))}
    </div>
  )
}