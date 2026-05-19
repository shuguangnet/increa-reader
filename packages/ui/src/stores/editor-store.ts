import { create } from 'zustand'

type FileKey = string // "repo:path"

type EditedFile = {
  content: string
  originalContent: string
  lastSaved: number | null
}

interface EditorState {
  editedFiles: Record<FileKey, EditedFile>
  currentFile: { repo: string; path: string } | null
  isEditMode: boolean

  setEditMode: (mode: boolean) => void
  openFile: (repo: string, path: string, content: string) => void
  updateContent: (repo: string, path: string, content: string) => void
  markSaved: (repo: string, path: string) => void
  isDirty: (repo: string, path: string) => boolean
  getFileContent: (repo: string, path: string) => string | undefined
  closeFile: (repo: string, path: string) => void
}

const makeKey = (repo: string, path: string): FileKey => `${repo}:${path}`

export const useEditorStore = create<EditorState>((set, get) => ({
  editedFiles: {},
  currentFile: null,
  isEditMode: false,

  setEditMode: (mode) => set({ isEditMode: mode }),

  openFile: (repo, path, content) => {
    const key = makeKey(repo, path)
    set((state) => ({
      currentFile: { repo, path },
      editedFiles: {
        ...state.editedFiles,
        [key]: state.editedFiles[key] ?? { content, originalContent: content, lastSaved: null },
      },
    }))
  },

  updateContent: (repo, path, content) => {
    const key = makeKey(repo, path)
    set((state) => {
      const existing = state.editedFiles[key]
      if (!existing) return state
      return {
        editedFiles: {
          ...state.editedFiles,
          [key]: { ...existing, content },
        },
      }
    })
  },

  markSaved: (repo, path) => {
    const key = makeKey(repo, path)
    set((state) => {
      const existing = state.editedFiles[key]
      if (!existing) return state
      return {
        editedFiles: {
          ...state.editedFiles,
          [key]: { content: existing.content, originalContent: existing.content, lastSaved: Date.now() },
        },
      }
    })
  },

  isDirty: (repo, path) => {
    const key = makeKey(repo, path)
    const file = get().editedFiles[key]
    if (!file) return false
    return file.content !== file.originalContent
  },

  getFileContent: (repo, path) => {
    const key = makeKey(repo, path)
    return get().editedFiles[key]?.content
  },

  closeFile: (repo, path) => {
    const key = makeKey(repo, path)
    set((state) => {
      const { [key]: _, ...rest } = state.editedFiles
      return { editedFiles: rest }
    })
  },
}))