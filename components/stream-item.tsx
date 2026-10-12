'use client'

import type { TransferItem } from '@/lib/types'
import { Monitor, X } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

interface StreamItemProps {
  item: TransferItem
  onStop?: (itemId: string) => void
}

function formatStreamType(type?: string): string {
  switch (type) {
    case 'browser':
      return '标签页'
    case 'window':
      return '窗口'
    case 'monitor':
      return '屏幕'
    default:
      return '屏幕'
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export const StreamItem = memo(({ item, onStop }: StreamItemProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !item.content) {
      return
    }

    const stream = item.content as unknown as MediaStream
    if (!(stream instanceof MediaStream)) {
      return
    }

    video.srcObject = stream
    video.onloadedmetadata = () => {
      video.play().then(() => {
        setIsPlaying(true)
      }).catch(console.error)
    }

    const [track] = stream.getVideoTracks()
    const handleTrackEnded = () => setIsPlaying(false)
    track?.addEventListener('ended', handleTrackEnded)

    return () => {
      video.onloadedmetadata = null
      track?.removeEventListener('ended', handleTrackEnded)
      setIsPlaying(false)
      setDuration(0)
      video.srcObject = null
    }
  }, [item.content])

  useEffect(() => {
    if (!isPlaying) {
      return
    }

    const interval = setInterval(() => {
      setDuration(d => d + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [isPlaying])

  const handleStop = useCallback(() => {
    if (item.content && typeof item.content !== 'string') {
      const stream = item.content as unknown as MediaStream
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
    onStop?.(item.id)
  }, [item.id, item.content, onStop])

  return (
    <div className="rounded-md border border-border/60 bg-card/50 overflow-hidden">
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={item.direction === 'sent'}
          className="w-full h-full object-contain"
        />
        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 text-white text-xs">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>
            正在共享
            {' '}
            {formatStreamType(item.streamType)}
          </span>
        </div>
        <div className="absolute bottom-2 right-2 px-2 py-1 rounded-full bg-black/60 text-white text-xs font-mono">
          {formatDuration(duration)}
        </div>
        {onStop && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleStop}
            className="absolute top-2 right-2 shrink-0 bg-black/60 hover:bg-black/80 text-white"
            aria-label="停止共享"
            title="停止共享"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {item.direction === 'sent' ? '你正在共享' : '正在接收共享'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatStreamType(item.streamType)}
        </span>
      </div>
    </div>
  )
})

StreamItem.displayName = 'StreamItem'
