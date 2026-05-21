import type { DocumentNote, NotePosition } from '@/types/notes'
import { getApiBase as getPlatformApiBase } from '@/lib/platform'

/** Get the API base URL — uses Tauri local server in desktop mode */
export function getApiBase(): string {
  return getPlatformApiBase()
}

/** Async toast helper — lazy-loads toast module */
function showToastAsync(message: string, type: 'success' | 'error' | 'info') {
  import('@/app/toast').then(({ showToast }) => {
    showToast(message, type)
  })
}

/** Fetch wrapper that auto-prefixes the API base URL with enhanced error handling */
export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(getApiBase() + url, init).then(response => {
    if (response.status === 401) {
      // Dispatch event to open settings drawer for API configuration
      // (BrowserRouter doesn't support hash-based navigation)
      window.dispatchEvent(new CustomEvent('increa:navigate-settings'))
      showToastAsync('API 认证失败，请检查 API 配置', 'error')
      throw response
    }
    if (!response.ok && response.status >= 500) {
      showToastAsync(`服务器错误 (${response.status})`, 'error')
    }
    return response
  }).catch(err => {
    // Network error (no response at all) — TypeError from failed fetch
    if (err instanceof TypeError) {
      showToastAsync('网络连接失败，请检查网络或 API 配置', 'error')
    }
    throw err
  })
}

type TreeNode = {
  type: 'dir' | 'file'
  name: string
  path: string
  children?: TreeNode[]
}

type RepoInfo = {
  name: string
  root: string
}

type RepoTreeData = {
  name: string
  files: TreeNode[]
}

export type WorkspaceTreeData = RepoTreeData[]

type PreviewResponse =
  | { type: 'markdown'; body: string }
  | { type: 'code'; lang: string; body: string }
  | { type: 'image'; path: string }
  | { type: 'unsupported'; path: string }

export async function fetchRepos(): Promise<RepoInfo[]> {
  const response = await apiFetch('/api/workspace/repos')
  const data = await response.json()
  return data.data
}

export async function fetchRepoTree(repoName: string): Promise<RepoTreeData> {
  const response = await apiFetch(`/api/workspace/repos/${encodeURIComponent(repoName)}/tree`)
  const data = await response.json()
  return data.data
}

export async function fetchWorkspaceTree(): Promise<WorkspaceTreeData> {
  const response = await apiFetch('/api/workspace/tree')
  const data = await response.json()
  return data.data
}

export async function fetchPreview(repo: string, path: string): Promise<PreviewResponse> {
  const params = new URLSearchParams({ repo, path })
  const response = await apiFetch(`/api/preview?${params}`)
  const data = await response.json()
  return data
}

export async function fetchDocumentNotes(repo: string, path: string): Promise<DocumentNote[]> {
  const params = new URLSearchParams({ repo, path })
  const response = await fetch(getApiBase() + `/api/notes?${params}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to load notes')
  }
  const data = await response.json()
  return data.notes
}

export async function createDocumentNote(
  repo: string,
  path: string,
  note: { color: DocumentNote['color']; content: string; position: NotePosition },
): Promise<DocumentNote> {
  const response = await fetch(getApiBase() + '/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo, path, note }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to create note')
  }
  const data = await response.json()
  return data.note
}

export async function updateDocumentNote(
  repo: string,
  path: string,
  noteId: string,
  note: { color: DocumentNote['color']; content: string; position: NotePosition },
): Promise<{ deleted: boolean; note?: DocumentNote }> {
  const response = await fetch(getApiBase() + `/api/notes/${encodeURIComponent(noteId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo, path, note }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to update note')
  }
  return response.json()
}

export async function deleteDocumentNote(
  repo: string,
  path: string,
  noteId: string,
): Promise<void> {
  const params = new URLSearchParams({ repo, path })
  const response = await fetch(getApiBase() + `/api/notes/${encodeURIComponent(noteId)}?${params}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to delete note')
  }
}

export async function deleteFile(repo: string, path: string): Promise<{ success: boolean }> {
  const response = await fetch(getApiBase() + `/api/files/${encodeURIComponent(repo)}/${path}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to delete file')
  }
  return response.json()
}

type RepoConfigInfo = {
  name: string
  root: string
  exists: boolean
}

export async function fetchConfigRepos(): Promise<RepoConfigInfo[]> {
  const response = await apiFetch('/api/config/repos')
  const data = await response.json()
  return data.data
}

export async function updateConfigRepos(paths: string[]): Promise<RepoConfigInfo[]> {
  const response = await fetch(getApiBase() + '/api/config/repos', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repos: paths.map(path => ({ path })) }),
  })
  const data = await response.json()
  return data.data
}

export type ApiSettings = {
  base_url: string | null
  api_key: string | null
  default_model: string | null
  ai_provider: string | null
  openai_api_key: string | null
  openai_base_url: string | null
  openai_model: string | null
}

export async function fetchApiSettings(): Promise<ApiSettings> {
  const response = await apiFetch('/api/config/api-settings')
  return response.json()
}

export async function updateApiSettings(settings: Partial<ApiSettings>): Promise<ApiSettings> {
  const response = await fetch(getApiBase() + '/api/config/api-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  return response.json()
}

export async function createFile(repo: string, path: string, type: 'file' | 'dir', content?: string): Promise<{ success: boolean; path: string }> {
  const response = await fetch(getApiBase() + `/api/files/${encodeURIComponent(repo)}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, content }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to create file')
  }
  return response.json()
}

export async function saveFile(repo: string, path: string, content: string): Promise<{ success: boolean }> {
  const response = await fetch(getApiBase() + `/api/files/${encodeURIComponent(repo)}/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to save file')
  }
  return response.json()
}

export async function renameFile(repo: string, path: string, newPath: string): Promise<{ success: boolean; new_path: string }> {
  const response = await fetch(getApiBase() + `/api/files/${encodeURIComponent(repo)}/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_path: newPath }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to rename file')
  }
  return response.json()
}

export async function copyFile(repo: string, sourcePath: string, targetPath: string): Promise<{ success: boolean }> {
  const response = await fetch(getApiBase() + `/api/files/${encodeURIComponent(repo)}/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_path: sourcePath, target_path: targetPath }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to copy file')
  }
  return response.json()
}

export type { RepoConfigInfo, RepoInfo, RepoTreeData, TreeNode }

// --- Template API ---

export type TemplateInfo = {
  id: string
  name: string
  description: string
  category: string
}

export type TemplateDetail = {
  id: string
  name: string
  content: string
}

export async function fetchTemplates(): Promise<TemplateInfo[]> {
  const response = await apiFetch('/api/templates')
  const data = await response.json()
  return data.templates
}

export async function fetchTemplateDetail(templateId: string): Promise<TemplateDetail> {
  const response = await fetch(getApiBase() + `/api/templates/${encodeURIComponent(templateId)}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to load template')
  }
  return response.json()
}

export async function applyTemplate(templateId: string, repo: string, path: string): Promise<{ success: boolean }> {
  const response = await fetch(getApiBase() + `/api/templates/${encodeURIComponent(templateId)}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo, path }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to apply template')
  }
  return response.json()
}

// --- Calendar API ---

export type CalendarDayData = {
  files: { path: string }[]
}

export type CalendarData = {
  year: number
  month: number
  days: Record<string, CalendarDayData>
}

export async function fetchCalendar(repo: string, year: number, month: number): Promise<CalendarData> {
  const params = new URLSearchParams({ repo, year: String(year), month: String(month) })
  const response = await fetch(getApiBase() + `/api/calendar?${params}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to load calendar')
  }
  return response.json()
}
