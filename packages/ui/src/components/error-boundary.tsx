import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
  /** Optional fallback UI; receives error + reset callback */
  fallback?: (error: Error, reset: () => void) => ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
  showDetails: boolean
}

/**
 * Global ErrorBoundary that catches rendering errors in child components
 * and displays a friendly error page instead of white screen.
 *
 * - Development mode: shows full error message + component stack
 * - Production mode: shows a generic message
 * - Provides "重试" (retry) button to re-mount children
 * - Error details are collapsible
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, showDetails: false }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console in development for debugging
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false })
  }

  toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }))
  }

  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children
    }

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.handleReset)
    }

    const isDev = import.meta.env.DEV
    const error = this.state.error
    const { showDetails } = this.state

    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center p-6 text-center">
        <div className="flex flex-col items-center gap-4 max-w-md">
          <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/40">
            <AlertTriangle className="size-6 text-red-600 dark:text-red-400" />
          </div>

          <h2 className="text-lg font-semibold text-foreground">页面出现了问题</h2>

          <p className="text-sm text-muted-foreground">
            {isDev ? error.message : '渲染时发生了意外错误，请尝试刷新页面。'}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="size-3.5" />
              重试
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              刷新页面
            </button>
          </div>

          {/* Collapsible error details */}
          <button
            type="button"
            onClick={this.toggleDetails}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showDetails ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {showDetails ? '收起详情' : '查看详情'}
          </button>

          {showDetails && (
            <div className="w-full rounded-md border bg-muted/50 p-3 text-left">
              <p className="text-xs font-mono text-red-600 dark:text-red-400 break-words">
                {error.toString()}
              </p>
              {error.stack && (
                <pre className="mt-2 max-h-40 overflow-auto text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-words">
                  {error.stack}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }
}
