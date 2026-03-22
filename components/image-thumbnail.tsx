'use client'

import { ImageIcon } from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { cn } from '@/lib/utils'

interface ImageThumbnailProps {
  src: string
  alt: string
  className?: string
  thumbnailSize?: number // Max dimension for thumbnail
  onClick?: () => void
}

type LoadingState = 'idle' | 'loading' | 'loaded' | 'error'
interface ThumbnailState {
  shouldLoad: boolean
  loadingState: LoadingState
}

type ThumbnailAction = { type: 'sync', src: string }
  | { type: 'start-load' }
  | { type: 'loaded' }
  | { type: 'error' }

const loadedImageCache = new Set<string>()
const FRAME_HEIGHT_MIN = 160
const FRAME_HEIGHT_MAX = 240

function createThumbnailState(src: string): ThumbnailState {
  const isCached = loadedImageCache.has(src)
  return {
    shouldLoad: isCached,
    loadingState: isCached ? 'loaded' : 'idle',
  }
}

function thumbnailStateReducer(state: ThumbnailState, action: ThumbnailAction): ThumbnailState {
  switch (action.type) {
    case 'sync':
      return createThumbnailState(action.src)
    case 'start-load':
      return {
        shouldLoad: true,
        loadingState: state.loadingState === 'loaded' ? state.loadingState : 'loading',
      }
    case 'loaded':
      return {
        ...state,
        loadingState: 'loaded',
      }
    case 'error':
      return {
        ...state,
        loadingState: 'error',
      }
    default:
      return state
  }
}

export function ImageThumbnail({
  src,
  alt,
  className,
  thumbnailSize = 200,
  onClick,
}: ImageThumbnailProps) {
  const [{ shouldLoad, loadingState }, dispatch] = useReducer(
    thumbnailStateReducer,
    src,
    createThumbnailState,
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const frameHeight = Math.min(FRAME_HEIGHT_MAX, Math.max(FRAME_HEIGHT_MIN, Math.round(thumbnailSize * 0.8)))

  const loadImage = useCallback(() => {
    dispatch({ type: 'start-load' })
  }, [])

  useEffect(() => {
    dispatch({ type: 'sync', src })
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
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          sizes={`${thumbnailSize}px`}
          draggable={false}
          className={cn(
            'max-h-full max-w-full object-contain transition-opacity duration-200',
            loadingState === 'loaded' ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => {
            loadedImageCache.add(src)
            dispatch({ type: 'loaded' })
          }}
          onError={() => {
            dispatch({ type: 'error' })
          }}
        />
      )}
    </div>
  )
}
