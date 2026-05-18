import { FilePlus, FolderPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createFile } from './api'

type CreateFileDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoName: string
  parentPath: string
  defaultType?: 'file' | 'dir'
  onCreated: () => void
}

export function CreateFileDialog({
  open,
  onOpenChange,
  repoName,
  parentPath,
  defaultType = 'file',
  onCreated,
}: CreateFileDialogProps) {
  const [createType, setCreateType] = useState<'file' | 'dir'>(defaultType)
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setCreateType(defaultType)
      setName('')
      setError(null)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open, defaultType])

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name is required')
      return
    }
    const fullPath = parentPath ? `${parentPath}/${trimmed}` : trimmed
    setIsCreating(true)
    setError(null)
    try {
      await createFile(repoName, fullPath, createType)
      onOpenChange(false)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setIsCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreate()
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
        <h2 className="mb-4 text-lg font-semibold">New {createType === 'file' ? 'File' : 'Folder'}</h2>

        <div className="mb-4 flex gap-2">
          <Button
            type="button"
            variant={createType === 'file' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCreateType('file')}
          >
            <FilePlus className="size-4" />
            File
          </Button>
          <Button
            type="button"
            variant={createType === 'dir' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCreateType('dir')}
          >
            <FolderPlus className="size-4" />
            Folder
          </Button>
        </div>

        <div className="mb-2 text-sm text-muted-foreground">
          Parent: {parentPath || '/'}
        </div>

        <Input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={createType === 'file' ? 'filename.ext' : 'folder-name'}
          disabled={isCreating}
          className="mb-2"
        />

        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button type="button" onClick={handleCreate} disabled={isCreating || !name.trim()}>
            {isCreating ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  )
}