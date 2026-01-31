"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ImageThumbnail } from "@/components/image-thumbnail"
import { LinkPreview } from "@/components/link-preview"
import { Download, FileText, File as FileIcon, ImageIcon, ZoomIn, Copy, Check, Loader2 } from "lucide-react"
import { cn, formatFileSize, isImageFile } from "@/lib/utils"
import { parseTextWithLinks } from "@/lib/link-utils"
import type { TransferItem } from "@/lib/types"

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond} B/s`
  } else if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  } else {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
  }
}

function getFileIcon(name?: string) {
  if (!name) return FileIcon
  if (isImageFile(name)) return ImageIcon
  const ext = name.split(".").pop()?.toLowerCase()
  if (["txt", "md", "json", "js", "ts", "html", "css"].includes(ext || "")) return FileText
  return FileIcon
}

// Progress bar component - optimized for GPU acceleration
function ProgressBar({ progress, className }: { progress: number; className?: string }) {
  const clampedProgress = Math.min(100, Math.max(0, progress))
  return (
    <div className={cn("w-full h-1.5 bg-muted rounded-full overflow-hidden", className)}>
      <div 
        className="h-full bg-accent rounded-full will-change-transform transform-gpu"
        style={{ 
          width: '100%',
          transform: `scaleX(${clampedProgress / 100})`,
          transformOrigin: 'left',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      />
    </div>
  )
}

type TransferItemProps = {
  item: TransferItem
  onPreviewImage: (url: string, name: string) => void
  onDownload: (url: string, name?: string) => void
}

// System message component
function SystemMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-center">
      <div className="px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground">
        {content}
      </div>
    </div>
  )
}

// Image item component
function ImageItem({ 
  item, 
  onPreviewImage, 
  onDownload 
}: { 
  item: TransferItem
  onPreviewImage: (url: string, name: string) => void
  onDownload: (url: string, name?: string) => void
}) {
  const isTransferring = item.status === "transferring"
  const progress = item.progress ?? 100
  const transferredBytes = item.transferredBytes ?? item.size ?? 0
  const totalSize = item.size ?? 0

  // Show file-style view when transferring (no preview available yet)
  if (isTransferring || !item.content) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shrink-0">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
          
          {/* Progress bar */}
          <ProgressBar progress={progress} className="mt-2" />
          
          {/* Progress info */}
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-muted-foreground">
              {formatFileSize(transferredBytes)} / {formatFileSize(totalSize)}
              <span className="mx-1">·</span>
              {progress}%
            </p>
            {item.speed && item.speed > 0 && (
              <p className="text-xs text-accent font-medium">
                {formatSpeed(item.speed)}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div 
        className="relative group"
        onClick={() => onPreviewImage(item.content, item.name || "image")}
      >
        <ImageThumbnail
          src={item.content}
          alt={item.name || "image"}
          className="bg-background"
          thumbnailSize={300}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center cursor-pointer">
          <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(item.size || 0)} · {formatTime(item.timestamp)} · {item.direction === "sent" ? "已发送" : "已接收"}
          </p>
        </div>
        {item.direction === "received" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              onDownload(item.content, item.name)
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Download className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

// File item component
function FileItem({ 
  item, 
  onDownload 
}: { 
  item: TransferItem
  onDownload: (url: string, name?: string) => void
}) {
  const IconComponent = getFileIcon(item.name)
  const isTransferring = item.status === "transferring"
  const progress = item.progress ?? 100
  const transferredBytes = item.transferredBytes ?? item.size ?? 0
  const totalSize = item.size ?? 0
  
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shrink-0 relative">
        {isTransferring ? (
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
        ) : (
          <IconComponent className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
        
        {isTransferring ? (
          <>
            {/* Progress bar */}
            <ProgressBar progress={progress} className="mt-2" />
            
            {/* Progress info */}
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-xs text-muted-foreground">
                {formatFileSize(transferredBytes)} / {formatFileSize(totalSize)}
                <span className="mx-1">·</span>
                {progress}%
              </p>
              {item.speed && item.speed > 0 && (
                <p className="text-xs text-accent font-medium">
                  {formatSpeed(item.speed)}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{formatFileSize(totalSize)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatTime(item.timestamp)} · {item.direction === "sent" ? "已发送" : "已接收"}
            </p>
          </>
        )}
      </div>
      {item.direction === "received" && !isTransferring && item.content && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDownload(item.content, item.name)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Download className="w-4 h-4" />
        </Button>
      )}
    </div>
  )
}

// Text item component
function TextItem({ item }: { item: TransferItem }) {
  const [copied, setCopied] = useState(false)
  const segments = parseTextWithLinks(item.content)

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(item.content)
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea')
        textArea.value = item.content
        textArea.style.position = 'fixed'
        textArea.style.left = '-9999px'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [item.content])

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
          {segments.map((segment, index) => {
            if (segment.type === "link" && segment.url) {
              return (
                <LinkPreview key={index} url={segment.url} inline />
              )
            }
            return <span key={index}>{segment.content}</span>
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {formatTime(item.timestamp)} · {item.direction === "sent" ? "已发送" : "已接收"}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
        title={copied ? "已复制" : "复制文本"}
      >
        {copied ? (
          <Check className="w-4 h-4 text-emerald-500" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </Button>
    </div>
  )
}

export function TransferItemComponent({ item, onPreviewImage, onDownload }: TransferItemProps) {
  // System messages
  if (item.type === "system") {
    return <SystemMessage content={item.content} />
  }
  
  const isImage = item.type === "file" && isImageFile(item.name || "")
  
  return (
    <div
      className={cn(
        "rounded-lg p-3",
        item.direction === "sent" ? "bg-primary/10 ml-8" : "bg-secondary mr-8"
      )}
    >
      {isImage ? (
        <ImageItem item={item} onPreviewImage={onPreviewImage} onDownload={onDownload} />
      ) : item.type === "file" ? (
        <FileItem item={item} onDownload={onDownload} />
      ) : (
        <TextItem item={item} />
      )}
    </div>
  )
}
