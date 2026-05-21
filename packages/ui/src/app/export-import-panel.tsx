import { Download, Loader2, Upload, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { apiFetch } from '@/app/api'
import { showToast } from '@/app/toast'
import { useIsMobile } from '@/hooks/use-mobile'

type ExportImportPanelProps = {
  repo: string
  path: string
  onClose: () => void
}

type ExportFormat = 'html' | 'pdf' | 'plain'
type ZipFormat = 'markdown' | 'html'

export function ExportImportPanel({ repo, path, onClose }: ExportImportPanelProps) {
  const isMobile = useIsMobile()
  // Export states
  const [exportFormat, setExportFormat] = useState<ExportFormat>('html')
  const [exporting, setExporting] = useState(false)
  const [zipDirectory, setZipDirectory] = useState('')
  const [zipFormat, setZipFormat] = useState<ZipFormat>('markdown')
  const [zipping, setZipping] = useState(false)

  // Import states
  const [importProgress, setImportProgress] = useState<string | null>(null)
  const [importUrl, setImportUrl] = useState('')
  const [importingUrl, setImportingUrl] = useState(false)
  const [importResults, setImportResults] = useState<Array<{
    path: string
    size?: number
    error?: string
  }> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Download helper
  const downloadBlob = useCallback((content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  const downloadArrayBuffer = useCallback(
    (data: ArrayBuffer, filename: string, mimeType: string) => {
      const blob = new Blob([data], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
    [],
  )

  // Export single file
  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const res = await apiFetch('/api/export/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, path, format: exportFormat }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || '导出失败')
      }
      const data = await res.json()

      if (exportFormat === 'pdf') {
        // Download PDF from temp path
        if (data.temp_path) {
          const pdfRes = await apiFetch(
            `/api/export/pdf-download?temp_path=${encodeURIComponent(data.temp_path)}`,
          )
          if (!pdfRes.ok) throw new Error('PDF 下载失败')
          const pdfBuffer = await pdfRes.arrayBuffer()
          downloadArrayBuffer(pdfBuffer, data.filename, 'application/pdf')
          showToast('PDF 已导出', 'success')
        }
      } else {
        const mimeType = exportFormat === 'html' ? 'text/html' : 'text/plain'
        downloadBlob(data.content, data.filename, mimeType)
        showToast('文件已导出', 'success')
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '导出失败', 'error')
    } finally {
      setExporting(false)
    }
  }, [repo, path, exportFormat, downloadBlob, downloadArrayBuffer])

  // Export directory as ZIP
  const handleZipExport = useCallback(async () => {
    if (!zipDirectory) {
      showToast('请输入目录路径', 'error')
      return
    }
    setZipping(true)
    try {
      const res = await apiFetch('/api/export/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, directory: zipDirectory, format: zipFormat }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'ZIP 导出失败')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('content-disposition')
      let filename = `${zipDirectory.replace(/\/$/, '')}.zip`
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/)
        if (match) filename = match[1]
      }
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('ZIP 已导出', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ZIP 导出失败', 'error')
    } finally {
      setZipping(false)
    }
  }, [repo, zipDirectory, zipFormat])

  // Handle file upload
  const handleFileUpload = useCallback(
    async (files: FileList | File[]) => {
      setImportProgress('上传中...')
      setImportResults(null)
      const formData = new FormData()
      formData.append('repo', repo)
      formData.append('target_path', '')
      for (const file of files) {
        formData.append('files', file)
      }

      try {
        const res = await apiFetch('/api/import/upload', {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || '导入失败')
        }
        const data = await res.json()
        setImportResults(data.imported)
        setImportProgress(null)
        showToast('文件导入成功', 'success')
      } catch (e) {
        setImportProgress(null)
        showToast(e instanceof Error ? e.message : '导入失败', 'error')
      }
    },
    [repo],
  )

  // Handle drag & drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files)
      }
    },
    [handleFileUpload],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // Import from URL
  const handleUrlImport = useCallback(async () => {
    if (!importUrl) return
    setImportingUrl(true)
    setImportResults(null)
    try {
      const res = await apiFetch('/api/import/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, target_path: 'imported/', url: importUrl }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'URL 导入失败')
      }
      const data = await res.json()
      setImportResults([data])
      setImportUrl('')
      showToast('URL 导入成功', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'URL 导入失败', 'error')
    } finally {
      setImportingUrl(false)
    }
  }, [repo, importUrl])

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div
      className={`flex flex-col h-full bg-background ${isMobile ? 'w-full' : 'border-l border-border w-80 min-w-[320px]'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Download size={16} className="text-emerald-500" />
          导出 / 导入
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Export section */}
        <div className="p-3 border-b border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            导出当前文件
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={exportFormat}
                onChange={e => setExportFormat(e.target.value as ExportFormat)}
                className="flex-1 h-8 px-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="html">HTML</option>
                <option value="pdf">PDF</option>
                <option value="plain">纯文本</option>
              </select>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="h-8 px-3 flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                导出
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground truncate" title={path}>
              {path}
            </p>
          </div>
        </div>

        {/* Directory ZIP export */}
        <div className="p-3 border-b border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            目录导出 (ZIP)
          </h3>
          <div className="space-y-2">
            <input
              type="text"
              value={zipDirectory}
              onChange={e => setZipDirectory(e.target.value)}
              placeholder="目录路径，如 docs/"
              className="w-full h-8 px-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <div className="flex items-center gap-2">
              <select
                value={zipFormat}
                onChange={e => setZipFormat(e.target.value as ZipFormat)}
                className="flex-1 h-8 px-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="markdown">Markdown 原样</option>
                <option value="html">转为 HTML</option>
              </select>
              <button
                type="button"
                onClick={handleZipExport}
                disabled={zipping}
                className="h-8 px-3 flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {zipping ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                ZIP
              </button>
            </div>
          </div>
        </div>

        {/* Import section - File upload */}
        <div className="p-3 border-b border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            导入文件
          </h3>
          <div
            className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <Upload size={24} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">拖拽文件到此处，或点击选择</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              支持 .md, .txt, .pdf, .html, .json, .yaml, 图片
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileUpload(e.target.files)
                e.target.value = ''
              }
            }}
          />
          {importProgress && (
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              {importProgress}
            </div>
          )}
        </div>

        {/* Import section - URL */}
        <div className="p-3 border-b border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            从 URL 导入
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
              placeholder="https://example.com/page.html"
              className="flex-1 h-8 px-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={handleUrlImport}
              disabled={importingUrl}
              className="h-8 px-3 flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
            >
              {importingUrl ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              抓取
            </button>
          </div>
        </div>

        {/* Import results */}
        {importResults && importResults.length > 0 && (
          <div className="p-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              导入结果
            </h3>
            <div className="space-y-1">
              {importResults.map((item, i) => (
                <div
                  key={i}
                  className={`text-xs px-2 py-1.5 rounded-md ${
                    item.error
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                      : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  <span className="font-mono">{item.path}</span>
                  {item.size !== undefined && (
                    <span className="ml-2 text-muted-foreground">({formatSize(item.size)})</span>
                  )}
                  {item.error && <span className="ml-1">: {item.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
