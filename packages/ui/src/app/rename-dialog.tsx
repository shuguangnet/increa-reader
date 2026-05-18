import { Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { renameFile } from './api'

type RenameDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoName: string
  path: string
  currentName: string
  onRenamed: () => void
}

export function RenameDialog({
  open,
  onOpenChange,
  repoName,
  path,
  currentName,
  onRenamed,
}: RenameDialogProps) {
  const [newName, setNewName] = useState(currentName)
  const [isRenaming, setIsRenaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setNewName(currentName)
      setError(null)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [open, currentName])

  const handleRename = async () => {
    const trimmed = newName.trim()
    if (!trimmed) {
      setError('请输入名称')
      return
    }
    if (trimmed === currentName) {
      onOpenChange(false)
      return
    }
    const parentDir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : ''
    const newPath = parentDir ? `${parentDir}/${trimmed}` : trimmed
    setIsRenaming(true)
    setError(null)
    try {
      await renameFile(repoName, path, newPath)
      onOpenChange(false)
      onRenamed()
    } catch (err) {
      setError(err instanceof Error ? err.message : '重命名失败')
    } finally {
      setIsRenaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleRename()
    }
    if (e.key === 'Escape') {
      onOpenChange(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative z-50 w-full max-w-md rounded-lg border bg-white p-6 shadow-lg dark:bg-gray-900">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Pencil className="size-4" />
          重命名
        </h2>

        <div className="mb-2 text-sm text-muted-foreground">
          当前名称：<span className="font-medium text-foreground">{currentName}</span>
        </div>

        <Input
          ref={inputRef}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入新名称"
          disabled={isRenaming}
          className="mb-2"
        />

        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isRenaming}>
            取消
          </Button>
          <Button type="button" onClick={handleRename} disabled={isRenaming || !newName.trim()}>
            {isRenaming ? '重命名中...' : '确认'}
          </Button>
        </div>
      </div>
    </div>
  )
}