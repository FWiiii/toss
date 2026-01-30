import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type EmptyStateProps = {
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
  iconClassName = "bg-secondary text-muted-foreground",
  containerClassName,
}: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center py-12",
      containerClassName
    )}>
      <div className={cn(
        "w-16 h-16 rounded-full flex items-center justify-center mb-4",
        iconClassName
      )}>
        <Icon className="w-7 h-7" />
      </div>
      {title && (
        <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
      )}
      <p className="text-sm text-muted-foreground max-w-md">{description}</p>
    </div>
  )
}
