import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title?: string
  description: string
  iconClassName?: string
  containerClassName?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  iconClassName = 'bg-secondary text-muted-foreground',
  containerClassName,
}: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center px-4 py-12 text-center',
      containerClassName,
    )}
    >
      <div className="empty-state-illustration relative mb-5 flex h-[72px] w-[72px] items-center justify-center">
        <svg className="absolute inset-0 h-full w-full text-accent/30" viewBox="0 0 72 72" fill="none" aria-hidden="true">
          <circle cx="36" cy="36" r="34" stroke="currentColor" strokeDasharray="3 5" />
          <circle cx="36" cy="36" r="27" stroke="currentColor" strokeOpacity="0.45" />
          <circle cx="58" cy="17" r="3" fill="currentColor" />
        </svg>
        <div className={cn(
          'relative flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ring-1 ring-border/60',
          iconClassName,
        )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {title && (
        <h3 className="mb-2 text-base font-semibold tracking-tight text-foreground">{title}</h3>
      )}
      <p className="text-sm text-muted-foreground max-w-md">{description}</p>
    </div>
  )
}
