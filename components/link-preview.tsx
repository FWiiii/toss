"use client"

import { ExternalLink } from "lucide-react"
import { extractDomain } from "@/lib/link-utils"
import { cn } from "@/lib/utils"

interface LinkPreviewProps {
  url: string
  className?: string
  inline?: boolean
}

export function LinkPreview({ url, className, inline = false }: LinkPreviewProps) {
  const domain = extractDomain(url)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  if (inline) {
    // Inline link style - compact and within text
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-1 text-accent hover:text-accent/80 underline underline-offset-2 decoration-accent/50 hover:decoration-accent transition-colors",
          className
        )}
      >
        <span className="break-all">{url}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    )
  }

  // Card style - for standalone links or rich preview
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={cn(
        "group flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors",
        className
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{domain}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate group-hover:text-foreground/80 transition-colors">
          {url}
        </p>
      </div>
      <div className="text-accent group-hover:text-accent/80 transition-colors shrink-0">
        <ExternalLink className="h-4 w-4" />
      </div>
    </a>
  )
}
