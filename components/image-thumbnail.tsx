"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type ImageThumbnailProps = {
  src: string
  alt: string
  className?: string
  thumbnailSize?: number // Max dimension for thumbnail
  onClick?: () => void
}

type LoadingState = "idle" | "loading" | "loaded" | "error"

/**
 * Generate a thumbnail from an image URL using Canvas
 */
async function generateThumbnail(
  src: string, 
  maxSize: number = 200
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    
    img.onload = () => {
      // Calculate thumbnail dimensions while maintaining aspect ratio
      let width = img.width
      let height = img.height
      
      if (width > height) {
        if (width > maxSize) {
          height = Math.round((height * maxSize) / width)
          width = maxSize
        }
      } else {
        if (height > maxSize) {
          width = Math.round((width * maxSize) / height)
          height = maxSize
        }
      }
      
      // Create canvas and draw thumbnail
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Failed to get canvas context"))
        return
      }
      
      // Use better quality scaling
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(img, 0, 0, width, height)
      
      // Convert to data URL with reduced quality for smaller size
      const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.7)
      resolve(thumbnailUrl)
    }
    
    img.onerror = () => {
      reject(new Error("Failed to load image"))
    }
    
    img.src = src
  })
}

// Cache for generated thumbnails
const thumbnailCache = new Map<string, string>()

export function ImageThumbnail({ 
  src, 
  alt, 
  className,
  thumbnailSize = 200,
  onClick 
}: ImageThumbnailProps) {
  const [loadingState, setLoadingState] = useState<LoadingState>("idle")
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null)
  const [showFullImage, setShowFullImage] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasStartedLoading = useRef(false)

  // Generate thumbnail when component mounts or becomes visible
  const loadThumbnail = useCallback(async () => {
    if (hasStartedLoading.current) return
    hasStartedLoading.current = true
    
    setLoadingState("loading")
    
    // Check cache first
    const cached = thumbnailCache.get(src)
    if (cached) {
      setThumbnailSrc(cached)
      setLoadingState("loaded")
      return
    }
    
    try {
      const thumbnail = await generateThumbnail(src, thumbnailSize)
      thumbnailCache.set(src, thumbnail)
      setThumbnailSrc(thumbnail)
      setLoadingState("loaded")
    } catch {
      // If thumbnail generation fails, use original image
      setThumbnailSrc(src)
      setLoadingState("loaded")
    }
  }, [src, thumbnailSize])

  // Intersection Observer for lazy loading
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadThumbnail()
            observer.unobserve(entry.target)
          }
        })
      },
      {
        rootMargin: "100px", // Start loading 100px before entering viewport
        threshold: 0
      }
    )

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [loadThumbnail])

  // Preload full image when thumbnail is loaded
  useEffect(() => {
    if (loadingState !== "loaded" || !thumbnailSrc) return
    
    // Preload full image in background
    const img = new Image()
    img.onload = () => {
      setShowFullImage(true)
    }
    img.src = src
  }, [loadingState, thumbnailSrc, src])

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative overflow-hidden bg-muted/50 rounded-lg",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {/* Loading placeholder */}
      {loadingState === "idle" || loadingState === "loading" ? (
        <div className="flex items-center justify-center w-full h-32 animate-pulse">
          <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
        </div>
      ) : loadingState === "error" ? (
        <div className="flex items-center justify-center w-full h-32">
          <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
        </div>
      ) : (
        <>
          {/* Thumbnail (blurred background) */}
          {thumbnailSrc && !showFullImage && (
            <img
              src={thumbnailSrc}
              alt={alt}
              className="max-w-full max-h-48 object-contain transition-opacity duration-300"
            />
          )}
          
          {/* Full image (fades in over thumbnail) */}
          {showFullImage && (
            <img
              src={src}
              alt={alt}
              className={cn(
                "max-w-full max-h-48 object-contain transition-opacity duration-300",
                showFullImage ? "opacity-100" : "opacity-0"
              )}
            />
          )}
        </>
      )}
    </div>
  )
}
