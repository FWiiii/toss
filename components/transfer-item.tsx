'use client'

import type { TransferItem } from '@/lib/types'
import { Ban, Check, Copy, Download, File as FileIcon, FileText, ImageIcon, Loader2, X, ZoomIn } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ImageThumbnail } from '@/components/image-thumbnail'
import { LinkPreview } from '@/components/link-preview'
import { StreamItem } from '@/components/stream-item'
import { Button } from '@/components/ui/button'
import { INTERACTIVE_TONES, STATUS_TONES } from '@/lib/design-tokens'
import { parseTextWithLinks } from '@/lib/link-utils'
import { cn, formatFileSize, isImageFile } from '@/lib/utils'

function formatTime(date: Date) {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond} B/s`
  }
  else if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  }
  else {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
  }
}

function formatTimeRemaining(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0)
    return ''
  if (seconds < 60)
    return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function getFileIcon(name?: string) {
  if (!name)
    return FileIcon
  if (isImageFile(name))
    return ImageIcon
  const ext = name.split('.').pop()?.toLowerCase()
  if (['txt', 'md', 'json', 'js', 'ts', 'html', 'css'].includes(ext || ''))
    return FileText
  return FileIcon
}

// Progress bar component - optimized for GPU acceleration
function ProgressBar({ progress, className }: { progress: number, className?: string }) {
  const clampedProgress = Math.min(100, Math.max(0, progress))
  const [showFinishPulse, setShowFinishPulse] = useReducer(
    (_current: boolean, next: boolean) => next,
    false,
  )
  const previousProgressRef = useRef(clampedProgress)

  useEffect(() => {
    const previousProgress = previousProgressRef.current
    previousProgressRef.current = clampedProgress

    if (clampedProgress === 100 && previousProgress < 100) {
      setShowFinishPulse(true)
      const timeoutId = window.setTimeout(() => {
        setShowFinishPulse(false)
      }, 540)

      return () => {
        window.clearTimeout(timeoutId)
      }
    }
  }, [clampedProgress, setShowFinishPulse])

  return (
    <div className={cn('w-full h-1 bg-muted rounded-full overflow-hidden', showFinishPulse && 'delight-progress-finish', className)}>
      <div
        className="h-full bg-foreground/70 rounded-full will-change-transform transform-gpu"
        style={{
          width: '100%',
          transform: `scaleX(${clampedProgress / 100})`,
          transformOrigin: 'left',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </div>
  )
}

interface TransferItemProps {
  item: TransferItem
  onPreviewImage: (url: string, name: string) => void
  onDownload: (url: string, name?: string) => void
  onCancel?: (itemId: string) => void
  onStopStream?: (itemId: string) => void
}

// System message component
function SystemMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-center delight-fade-up">
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
  onDownload,
  onCancel,
}: {
  item: TransferItem
  onPreviewImage: (url: string, name: string) => void
  onDownload: (url: string, name?: string) => void
  onCancel?: (itemId: string) => void
}) {
  const isTransferring = item.status === 'transferring'
  const isCancelled = item.status === 'cancelled'
  const progress = item.progress ?? 100
  const transferredBytes = item.transferredBytes ?? item.size ?? 0
  const totalSize = item.size ?? 0
  const imageName = item.name || '图片'

  // Show cancelled state
  if (isCancelled) {
    return (
      <div className="flex items-start gap-3 opacity-60">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Ban className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{imageName}</p>
          <p className="text-xs text-muted-foreground mt-1">
            已取消 ·
            {' '}
            {formatFileSize(transferredBytes)}
            {' '}
            /
            {' '}
            {formatFileSize(totalSize)}
          </p>
        </div>
      </div>
    )
  }

  // Show file-style view when transferring (no preview available yet)
  if (isTransferring || !item.content) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shrink-0">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{imageName}</p>

          {/* Progress bar */}
          <ProgressBar progress={progress} className="mt-2" />

          {/* Progress info */}
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-muted-foreground">
              {formatFileSize(transferredBytes)}
              {' '}
              /
              {formatFileSize(totalSize)}
              <span className="mx-1">·</span>
              {progress}
              %
            </p>
            <div className="flex items-center gap-2">
              {item.remainingTime && item.remainingTime > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatTimeRemaining(item.remainingTime)}
                </p>
              )}
              {item.speed && item.speed > 0 && (
                <p className="text-xs text-accent font-medium">
                  {formatSpeed(item.speed)}
                </p>
              )}
            </div>
          </div>
        </div>
        {/* Cancel button */}
        {onCancel && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onCancel(item.id)}
            className={cn('shrink-0', INTERACTIVE_TONES.dangerHover)}
            aria-label={`取消传输 ${imageName}`}
            title="取消传输"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="group relative block w-full overflow-hidden rounded-lg text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        onClick={() => onPreviewImage(item.content, imageName)}
        aria-label={`预览图片 ${imageName}`}
      >
        <ImageThumbnail
          src={item.content}
          alt={imageName}
          className="bg-background"
          thumbnailSize={300}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 transition-colors group-hover:bg-black/20">
          <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{imageName}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(item.size || 0)}
            {' '}
            ·
            {formatTime(item.timestamp)}
            {' '}
            ·
            {item.direction === 'sent' ? '已发送' : '已接收'}
          </p>
        </div>
        {item.direction === 'received' && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation()
              onDownload(item.content, item.name)
            }}
            className="shrink-0 bg-background/80 text-foreground/80 hover:bg-background hover:text-foreground"
            aria-label={`下载图片 ${imageName}`}
            title={`下载图片 ${imageName}`}
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
  onDownload,
  onCancel,
}: {
  item: TransferItem
  onDownload: (url: string, name?: string) => void
  onCancel?: (itemId: string) => void
}) {
  const IconComponent = getFileIcon(item.name)
  const isTransferring = item.status === 'transferring'
  const isCancelled = item.status === 'cancelled'
  const progress = item.progress ?? 100
  const transferredBytes = item.transferredBytes ?? item.size ?? 0
  const totalSize = item.size ?? 0
  const fileName = item.name || '文件'

  // Show cancelled state
  if (isCancelled) {
    return (
      <div className="flex items-start gap-3 opacity-60">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Ban className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
          <p className="text-xs text-muted-foreground mt-1">
            已取消 ·
            {' '}
            {formatFileSize(transferredBytes)}
            {' '}
            /
            {' '}
            {formatFileSize(totalSize)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shrink-0 relative">
        {isTransferring
          ? (
              <Loader2 className="w-5 h-5 text-accent animate-spin" />
            )
          : (
              <IconComponent className="w-5 h-5 text-muted-foreground" />
            )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{fileName}</p>

        {isTransferring
          ? (
              <>
                {/* Progress bar */}
                <ProgressBar progress={progress} className="mt-2" />

                {/* Progress info */}
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(transferredBytes)}
                    {' '}
                    /
                    {formatFileSize(totalSize)}
                    <span className="mx-1">·</span>
                    {progress}
                    %
                  </p>
                  <div className="flex items-center gap-2">
                    {item.remainingTime && item.remainingTime > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {formatTimeRemaining(item.remainingTime)}
                      </p>
                    )}
                    {item.speed && item.speed > 0 && (
                      <p className="text-xs text-accent font-medium">
                        {formatSpeed(item.speed)}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )
          : (
              <>
                <p className="text-xs text-muted-foreground">{formatFileSize(totalSize)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatTime(item.timestamp)}
                  {' '}
                  ·
                  {item.direction === 'sent' ? '已发送' : '已接收'}
                </p>
              </>
            )}
      </div>
      {/* Cancel button during transfer */}
      {isTransferring && onCancel && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onCancel(item.id)}
          className={cn('shrink-0', INTERACTIVE_TONES.dangerHover)}
          aria-label={`取消传输 ${fileName}`}
          title="取消传输"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
      {/* Download button after transfer */}
      {item.direction === 'received' && !isTransferring && item.content && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onDownload(item.content, item.name)}
          className="shrink-0 bg-background/80 text-foreground/80 hover:bg-background hover:text-foreground"
          aria-label={`下载文件 ${fileName}`}
          title={`下载文件 ${fileName}`}
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
  const segments = useMemo(() => parseTextWithLinks(item.content), [item.content])

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(item.content)
      }
      else {
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
      setTimeout(setCopied, 2000, false)
    }
    catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [item.content])

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
          {segments.map((segment) => {
            if (segment.type === 'link' && segment.url) {
              return (
                <LinkPreview key={segment.id} url={segment.url} inline />
              )
            }
            return <span key={segment.id}>{segment.content}</span>
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {formatTime(item.timestamp)}
          {' '}
          ·
          {item.direction === 'sent' ? '已发送' : '已接收'}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleCopy}
        className="shrink-0"
        aria-label={copied ? '文本已复制' : '复制文本'}
        title={copied ? '已复制' : '复制文本'}
      >
        {copied
          ? (
              <Check className={cn('h-4 w-4', STATUS_TONES.success.inline)} />
            )
          : (
              <Copy className="h-4 w-4" />
            )}
      </Button>
    </div>
  )
}

export const TransferItemComponent = memo(({ item, onPreviewImage, onDownload, onCancel, onStopStream }: TransferItemProps) => {
  const [showSettleIn, setShowSettleIn] = useReducer(
    (_current: boolean, next: boolean) => next,
    false,
  )

  useEffect(() => {
    if (item.type === 'system' || item.status === 'completed') {
      setShowSettleIn(true)
      const timeoutId = window.setTimeout(() => {
        setShowSettleIn(false)
      }, 260)

      return () => {
        window.clearTimeout(timeoutId)
      }
    }
  }, [item.id, item.status, item.type, setShowSettleIn])

  // System messages
  if (item.type === 'system') {
    return <SystemMessage content={item.content} />
  }

  // Stream items (screen share)
  if (item.type === 'stream') {
    return (
      <StreamItem
        item={item}
        onStop={item.direction === 'sent' ? onStopStream : undefined}
      />
    )
  }

  const isImage = item.type === 'file' && isImageFile(item.name || '')
  const directionClass = item.direction === 'sent' ? 'border-l-2 border-l-foreground/60' : 'border-l-2 border-l-accent/70'
  return (
    <div
      className={cn(
        'rounded-md border border-border/60 bg-card/50 px-3 py-2 hover:bg-card transition-colors',
        directionClass,
        showSettleIn && 'delight-rise-in',
      )}
    >
      {isImage
        ? (
            <ImageItem item={item} onPreviewImage={onPreviewImage} onDownload={onDownload} onCancel={onCancel} />
          )
        : item.type === 'file'
          ? (
              <FileItem item={item} onDownload={onDownload} onCancel={onCancel} />
            )
          : (
              <TextItem item={item} />
            )}
    </div>
  )
})

TransferItemComponent.displayName = 'TransferItemComponent'
