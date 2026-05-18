import { ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

type BreadcrumbProps = {
  repo: string
  path: string
}

export function Breadcrumb({ repo, path }: BreadcrumbProps) {
  const navigate = useNavigate()
  const segments = path.split('/').filter(Boolean)

  if (segments.length === 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground px-3 py-1 bg-muted/30 border-b select-none">
        <span className="hover:text-foreground cursor-pointer transition-colors" onClick={() => navigate('/')}>
          {repo}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-0.5 text-xs text-muted-foreground px-3 py-1 bg-muted/30 border-b select-none overflow-x-auto whitespace-nowrap">
      <span
        className="hover:text-foreground cursor-pointer transition-colors shrink-0"
        onClick={() => navigate('/')}
        title={repo}
      >
        {repo}
      </span>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1
        const partialPath = segments.slice(0, index + 1).join('/')

        if (isLast) {
          // Last segment = current file
          return (
            <span key={partialPath} className="flex items-center gap-0.5 shrink-0">
              <ChevronRight className="size-3 shrink-0" />
              <span
                className="hover:text-foreground cursor-pointer transition-colors font-medium"
                onClick={() => navigate(`/views/${repo}/${partialPath}`)}
              >
                {segment}
              </span>
            </span>
          )
        }

        // Directory segment - navigate to parent directory view
        const dirSegments = segments.slice(0, index + 1).join('/')
        return (
          <span key={partialPath} className="flex items-center gap-0.5 shrink-0">
            <ChevronRight className="size-3 shrink-0" />
            <span
              className="hover:text-foreground cursor-pointer transition-colors"
              onClick={() => navigate(`/views/${repo}/${dirSegments}`)}
            >
              {segment}
            </span>
          </span>
        )
      })}
    </div>
  )
}