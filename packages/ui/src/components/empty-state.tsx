import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-muted-foreground', className)}>
      <Icon className="size-10 mb-3 opacity-25" />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-xs opacity-60 mt-1 text-center max-w-[220px]">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}