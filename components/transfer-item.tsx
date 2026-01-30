"use client"

import { Button } from "@/components/ui/button"
import { Download, FileText, File as FileIcon, ImageIcon, ZoomIn } from "lucide-react"
import { cn, formatFileSize, isImageFile } from "@/lib/utils"
import type { TransferItem } from "@/lib/types"

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
}

function getFileIcon(name?: string) {
  if (!name) return FileIcon
  if (isImageFile(name)) return ImageIcon
  const ext = name.split(".").pop()?.toLowerCase()
  if (["txt", "md", "json", "js", "ts", "html", "css"].includes(ext || "")) return FileText
  return FileIcon
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
  return (
    <div className="space-y-2">
      <div 
        className="relative group cursor-pointer"
        onClick={() => onPreviewImage(item.content, item.name || "image")}
      >
        <img 
          src={item.content} 
          alt={item.name || "image"}
          className="max-w-full max-h-48 rounded-lg object-contain bg-background"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
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
  
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shrink-0">
        <IconComponent className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(item.size || 0)}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatTime(item.timestamp)} · {item.direction === "sent" ? "已发送" : "已接收"}
        </p>
      </div>
      {item.direction === "received" && (
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
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">
          {item.content}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatTime(item.timestamp)} · {item.direction === "sent" ? "已发送" : "已接收"}
        </p>
      </div>
    </div>
  )
}

export function TransferItemComponent({ item, onPreviewImage, onDownload }: TransferItemProps) {
  // System messages
  if (item.type === "system") {
    return <SystemMessage content={item.content} />
  }
  
  const isImage = item.type === "file" && isImageFile(item.name)
  
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
