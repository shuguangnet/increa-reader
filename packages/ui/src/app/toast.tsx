import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useEffect, useState } from 'react'

type ToastType = 'success' | 'error' | 'info'

type Toast = {
  id: number
  message: string
  type: ToastType
}

let toastCounter = 0
const toastListeners: Set<(toasts: Toast[]) => void> = new Set()
let currentToasts: Toast[] = []

export function showToast(message: string, type: ToastType = 'info') {
  const id = ++toastCounter
  const toast: Toast = { id, message, type }
  currentToasts = [...currentToasts, toast]
  for (const listener of toastListeners) {
    listener(currentToasts)
  }
  // Auto-dismiss after 3 seconds
  setTimeout(() => dismissToast(id), 3000)
}

export function dismissToast(id: number) {
  currentToasts = currentToasts.filter(t => t.id !== id)
  for (const listener of toastListeners) {
    listener(currentToasts)
  }
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const listener = (updated: Toast[]) => {
      setToasts(updated)
    }
    toastListeners.add(listener)
    setToasts(currentToasts)
    return () => {
      toastListeners.delete(listener)
    }
  }, [])

  return { toasts, dismiss: dismissToast }
}

const TOAST_STYLES: Record<
  ToastType,
  { bg: string; border: string; icon: typeof CheckCircle2; iconColor: string }
> = {
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/50',
    border: 'border-emerald-200 dark:border-emerald-800',
    icon: CheckCircle2,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-950/50',
    border: 'border-red-200 dark:border-red-800',
    icon: AlertTriangle,
    iconColor: 'text-red-600 dark:text-red-400',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/50',
    border: 'border-blue-200 dark:border-blue-800',
    icon: Info,
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
}

export function ToastContainer() {
  const { toasts, dismiss } = useToasts()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => {
        const style = TOAST_STYLES[toast.type]
        const Icon = style.icon
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-200 ${style.bg} ${style.border}`}
          >
            <Icon className={`size-4 shrink-0 mt-0.5 ${style.iconColor}`} />
            <p className="text-sm flex-1 text-foreground">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
