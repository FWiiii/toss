'use client'

import type { TransferItem } from '@/lib/types'
import { useCallback, useRef, useState } from 'react'
import { generateUUID } from '@/lib/utils'

/**
 * Hook for managing transfer items and blob URLs
 */
export function useTransferItems() {
  const [items, setItems] = useState<TransferItem[]>([])

  // Track Blob URLs for cleanup to prevent memory leaks
  const blobUrlsRef = useRef<Set<string>>(new Set())
  const blobUrlCleanupRef = useRef<Map<string, () => Promise<void> | void>>(new Map())

  // 消息去重：记录最近的消息和时间，避免重复显示
  const recentMessagesRef = useRef<Map<string, number>>(new Map())
  const MESSAGE_DEBOUNCE_TIME = 3000 // 3秒内相同消息不重复显示

  // Revoke all tracked Blob URLs to free memory
  const revokeAllBlobUrls = useCallback(() => {
    blobUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url)
      }
      catch {}

      const cleanup = blobUrlCleanupRef.current.get(url)
      if (cleanup) {
        void cleanup()
        blobUrlCleanupRef.current.delete(url)
      }
    })
    blobUrlsRef.current.clear()
  }, [])

  // Create and track a Blob URL
  const createTrackedBlobUrl = useCallback((blob: Blob | File, cleanup?: () => Promise<void> | void): string => {
    const url = URL.createObjectURL(blob)
    blobUrlsRef.current.add(url)
    if (cleanup) {
      blobUrlCleanupRef.current.set(url, cleanup)
    }
    return url
  }, [])

  // Add system message with deduplication
  const addSystemMessage = useCallback((content: string, force = false) => {
    const now = Date.now()
    const lastTime = recentMessagesRef.current.get(content)

    // 如果不是强制显示，且3秒内显示过相同消息，则跳过
    if (!force && lastTime && (now - lastTime) < MESSAGE_DEBOUNCE_TIME) {
      return
    }

    // 更新消息时间戳
    recentMessagesRef.current.set(content, now)

    // 清理过期的消息记录（保留最近1分钟）
    const oneMinuteAgo = now - 60000
    recentMessagesRef.current.forEach((time, msg) => {
      if (time < oneMinuteAgo) {
        recentMessagesRef.current.delete(msg)
      }
    })

    setItems(prev => [
      ...prev,
      {
        id: generateUUID(),
        type: 'system',
        content,
        timestamp: new Date(),
        direction: 'system',
      },
    ])
  }, [])

  // Add a transfer item
  const addItem = useCallback((item: Omit<TransferItem, 'id' | 'timestamp'>) => {
    setItems(prev => [
      ...prev,
      {
        ...item,
        id: generateUUID(),
        timestamp: new Date(),
      },
    ])
  }, [])

  // Add item and return the ID for progress updates
  const addItemWithId = useCallback((item: Omit<TransferItem, 'id' | 'timestamp'>): string => {
    const id = generateUUID()
    setItems(prev => [
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
    updates: Partial<Pick<TransferItem, 'status' | 'progress' | 'transferredBytes' | 'speed' | 'content' | 'remainingTime'>>,
  ) => {
    setItems((prev) => {
      const index = prev.findIndex(item => item.id === id)
      if (index === -1) {
        return prev
      }

      const next = [...prev]
      next[index] = { ...next[index], ...updates }
      return next
    })
  }, [])

  // Remove item by ID
  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id))
  }, [])

  // Clear all items
  const clearHistory = useCallback(() => {
    revokeAllBlobUrls()
    setItems([])
  }, [revokeAllBlobUrls])

  // Cleanup function to be called on unmount
  const cleanup = useCallback(() => {
    blobUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url)
      }
      catch {}

      const cleanup = blobUrlCleanupRef.current.get(url)
      if (cleanup) {
        void cleanup()
        blobUrlCleanupRef.current.delete(url)
      }
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
    removeItem,
    clearHistory,
    createTrackedBlobUrl,
    revokeAllBlobUrls,
    cleanup,
  }
}
