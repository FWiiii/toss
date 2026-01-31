"use client"

import { useState, useCallback, useRef } from "react"
import { generateUUID } from "@/lib/utils"
import type { TransferItem } from "@/lib/types"

/**
 * Hook for managing transfer items and blob URLs
 */
export function useTransferItems() {
  const [items, setItems] = useState<TransferItem[]>([])
  
  // Track Blob URLs for cleanup to prevent memory leaks
  const blobUrlsRef = useRef<Set<string>>(new Set())

  // Revoke all tracked Blob URLs to free memory
  const revokeAllBlobUrls = useCallback(() => {
    blobUrlsRef.current.forEach(url => {
      try { URL.revokeObjectURL(url) } catch {}
    })
    blobUrlsRef.current.clear()
  }, [])

  // Create and track a Blob URL
  const createTrackedBlobUrl = useCallback((blob: Blob | File): string => {
    const url = URL.createObjectURL(blob)
    blobUrlsRef.current.add(url)
    return url
  }, [])

  // Add system message
  const addSystemMessage = useCallback((content: string) => {
    setItems((prev) => [
      ...prev,
      {
        id: generateUUID(),
        type: "system",
        content,
        timestamp: new Date(),
        direction: "system",
      },
    ])
  }, [])

  // Add a transfer item
  const addItem = useCallback((item: Omit<TransferItem, "id" | "timestamp">) => {
    setItems((prev) => [
      ...prev,
      {
        ...item,
        id: generateUUID(),
        timestamp: new Date(),
      },
    ])
  }, [])

  // Add item and return the ID for progress updates
  const addItemWithId = useCallback((item: Omit<TransferItem, "id" | "timestamp">): string => {
    const id = generateUUID()
    setItems((prev) => [
      ...prev,
      {
        ...item,
        id,
        timestamp: new Date(),
      },
    ])
    return id
  }, [])

  // Update item progress by ID
  const updateItemProgress = useCallback((
    id: string, 
    updates: Partial<Pick<TransferItem, "status" | "progress" | "transferredBytes" | "speed" | "content" | "remainingTime">>
  ) => {
    setItems((prev) => 
      prev.map((item) => 
        item.id === id ? { ...item, ...updates } : item
      )
    )
  }, [])

  // Clear all items
  const clearHistory = useCallback(() => {
    revokeAllBlobUrls()
    setItems([])
  }, [revokeAllBlobUrls])

  // Cleanup function to be called on unmount
  const cleanup = useCallback(() => {
    blobUrlsRef.current.forEach(url => {
      try { URL.revokeObjectURL(url) } catch {}
    })
    blobUrlsRef.current.clear()
  }, [])

  return {
    items,
    setItems,
    addItem,
    addItemWithId,
    addSystemMessage,
    updateItemProgress,
    clearHistory,
    createTrackedBlobUrl,
    revokeAllBlobUrls,
    cleanup,
  }
}
