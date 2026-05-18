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
  Pencil,
  Star,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteFile } from './api'
import { useFavoritesStore } from '@/stores/favorites-store'
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
  onDeleteClick,
}: {
  menuState: ContextMenuState
  onClose: () => void
  onOpenFile?: () => void
  onCreateFile?: () => void
  onCreateFolder?: () => void
  onRename?: () => void
  onDeleteClick?: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const { x, y, node } = menuState

  return (
    <div
      ref={menuRef}
      className="absolute z-50 min-w-[160px] rounded-md border bg-white py-1 shadow-lg dark:bg-gray-900"
      style={{ left: x, top: y }}
      onContextMenu={e => e.preventDefault()}
    >
      {node.type === 'file' && (
        <div
          className="px-3 py-1.5 text-sm hover:bg-accent cursor-pointer flex items-center gap-2"
          onClick={() => { onOpenFile?.(); onClose() }}
        >
          <File className="size-4" />
          Open
        </div>
      )}
      {node.type === 'file' && (
        <div
          className="px-3 py-1.5 text-sm hover:bg-accent cursor-pointer flex items-center gap-2"
          onClick={() => { onRename?.(); onClose() }}
        >
          <Pencil className="size-4" />
          Rename
        </div>
      )}
      {node.type === 'file' && (
        <div
          className="px-3 py-1.5 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 text-destructive"
          onClick={() => { onDeleteClick?.(); onClose() }}
        >
          <Trash2 className="size-4" />
          Delete
        </div>
      )}
      {node.type === 'dir' && (
        <>
          <div
            className="px-3 py-1.5 text-sm hover:bg-accent cursor-pointer flex items-center gap-2"
            onClick={() => { onCreateFile?.(); onClose() }}
          >
            <FilePlus className="size-4" />
            New File
          </div>
          <div
            className="px-3 py-1.5 text-sm hover:bg-accent cursor-pointer flex items-center gap-2"
            onClick={() => { onCreateFolder?.(); onClose() }}
          >
            <FolderPlus className="size-4" />
            New Folder
          </div>
          <div
            className="px-3 py-1.5 text-sm hover:bg-accent cursor-pointer flex items-center gap-2"
            onClick={() => { onRename?.(); onClose() }}
          >
            <Pencil className="size-4" />
            Rename
          </div>
          <div
            className="px-3 py-1.5 text-sm hover:bg-accent cursor-pointer flex items-center gap-2 text-destructive"
            onClick={() => { onDeleteClick?.(); onClose() }}
          >
            <Trash2 className="size-4" />
            Delete
          </div>
        </>
      )}
    </div>
  )
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

  const isFav = useFavoritesStore(s => s.isFavorite(repoName, node.path))
  const addFavorite = useFavoritesStore(s => s.addFavorite)
  const removeFavorite = useFavoritesStore(s => s.removeFavorite)

  const toggleFavorite = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
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
          onClick={() => onFileClick?.(node.path)}
          onContextMenu={handleContextMenu}
        >
          {getFileIcon(node.name)}
          <span className="flex-1 truncate">{node.name}</span>
          <div className="absolute right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isFav ? 'opacity-100' : ''}`}
              onClick={toggleFavorite}
              title={isFav ? 'Remove from favorites' : 'Add to favorites'}
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
          {/* Show star inline when favorited and not hovered */}
          {isFav && (
            <Star className="size-3.5 fill-yellow-400 text-yellow-400 shrink-0 group-hover:hidden" />
          )}
        </div>
        {contextMenu && (
          <ContextMenu
            menuState={contextMenu}
            onClose={closeContextMenu}
            onOpenFile={() => onFileClick?.(node.path)}
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
          if (searchActive) return
          setIsOpen(!isOpen)
        }}
        onContextMenu={handleContextMenu}
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
        <span>{node.name}</span>
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