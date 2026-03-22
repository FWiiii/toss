'use client'

import { ImageIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ImageThumbnailProps {
  src: string
  alt: string
  className?: string
  thumbnailSize?: number // Max dimension for thumbnail
  onClick?: () => void
}

type LoadingState = 'idle' | 'loading' | 'loaded' | 'error'
const loadedImageCache = new Set<string>()
const FRAME_HEIGHT_MIN = 160
const FRAME_HEIGHT_MAX = 240

export function ImageThumbnail({
  src,
  alt,
  className,
  thumbnailSize = 200,
  onClick,
}: ImageThumbnailProps) {
  const [shouldLoad, setShouldLoad] = useState(() => loadedImageCache.has(src))
  const [loadingState, setLoadingState] = useState<LoadingState>(() =>
    loadedImageCache.has(src) ? 'loaded' : 'idle',
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const frameHeight = Math.min(FRAME_HEIGHT_MAX, Math.max(FRAME_HEIGHT_MIN, Math.round(thumbnailSize * 0.8)))

  const loadImage = useCallback(() => {
    setShouldLoad(true)
    setLoadingState(current => (current === 'loaded' ? current : 'loading'))
  }, [])

  useEffect(() => {
    const isCached = loadedImageCache.has(src)
    setShouldLoad(isCached)
    setLoadingState(isCached ? 'loaded' : 'idle')
  }, [src])

  useEffect(() => {
    if (shouldLoad)
      return

    const container = containerRef.current
    if (!container)
      return

    if (typeof IntersectionObserver === 'undefined') {
      loadImage()
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadImage()
            observer.unobserve(entry.target)
          }
        })
      },
      {
        rootMargin: '240px 0px',
        threshold: 0,
      },
    )

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [loadImage, shouldLoad])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-muted/50',
        onClick && 'cursor-pointer',
        className,
      )}
      style={{ height: `${frameHeight}px` }}
      onClick={onClick}
    >
      {(loadingState === 'idle' || loadingState === 'loading') && (
        <div className="absolute inset-0 flex items-center justify-center animate-pulse">
          <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
        </div>
      )}

      {loadingState === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
        </div>
      )}

      {shouldLoad && loadingState !== 'error' && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          draggable={false}
          className={cn(
            'max-h-full max-w-full object-contain transition-opacity duration-200',
            loadingState === 'loaded' ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => {
            loadedImageCache.add(src)
            setLoadingState('loaded')
          }}
          onError={() => {
            setLoadingState('error')
          }}
        />
      )}
    </div>
  )
}
