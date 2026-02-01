/**
 * 数据传输模块
 * 处理文本和文件的发送逻辑
 */

import { uint8ToBase64 } from "./utils"
import { FILE_CHUNK_SIZE } from "./peer-config"
import { encryptJSON, encryptBytes, SessionEncryptor } from "./crypto"
import type { ConnectionRefs } from "./transfer-connection"

export type DataTransferCallbacks = {
  setSendingCount: (updater: (prev: number) => number) => void
  addItem: (item: any) => void
  addItemWithId: (item: any) => string
  updateItemProgress: (id: string, updates: any) => void
  createTrackedBlobUrl: (blob: Blob | File) => string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDataTransfer(
  refs: ConnectionRefs,
  callbacks: DataTransferCallbacks,
  encryptorsRef: React.MutableRefObject<Map<string, SessionEncryptor>>
) {
  const {
    setSendingCount,
    addItem,
    addItemWithId,
    updateItemProgress,
    createTrackedBlobUrl,
  } = callbacks

  const sendText = async (text: string) => {
    if (!text.trim()) return
    
    // 发送到所有连接（带加密）
    for (const [peerId, conn] of refs.connectionsRef.current.entries()) {
      if (!conn.open) continue

      const encryptor = encryptorsRef.current.get(peerId)
      const isEncrypted = encryptor?.isReady() ?? false

      try {
        if (isEncrypted) {
          const encrypted = await encryptJSON(encryptor, { type: "text", content: text })
          conn.send({ type: "encrypted", encrypted })
        } else {
          conn.send({ type: "text", content: text })
        }
      } catch (error) {
        console.error("Failed to send text:", error)
      }
    }
    
    addItem({
      type: "text",
      content: text,
      direction: "sent",
    })
  }

  const sendFile = async (file: File): Promise<void> => {
    setSendingCount(prev => prev + 1)
    
    let itemId: string | null = null
    let cancelled = false
    
    try {
      const url = createTrackedBlobUrl(file)
      
      itemId = addItemWithId({
        type: "file",
        name: file.name,
        content: url,
        size: file.size,
        direction: "sent",
        status: "transferring",
        progress: 0,
        transferredBytes: 0,
      })

      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      const totalSize = uint8Array.length
      
      let lastTime = Date.now()
      let lastBytes = 0
      let smoothedSpeed = 0

      for (const [peerId, conn] of refs.connectionsRef.current.entries()) {
        if (!conn.open) continue

        const encryptor = encryptorsRef.current.get(peerId)
        const isEncrypted = encryptor?.isReady() ?? false

        // 发送文件开始消息
        try {
          if (isEncrypted) {
            const encrypted = await encryptJSON(encryptor, {
              type: "file-start",
              name: file.name,
              size: file.size,
              itemId,
            })
            conn.send({ type: "encrypted", encrypted })
          } else {
            conn.send({
              type: "file-start",
              name: file.name,
              size: file.size,
              itemId,
            })
          }
        } catch (error) {
          console.error("Failed to send file-start:", error)
          continue
        }

        let offset = 0
        while (offset < uint8Array.length) {
          if (refs.cancelledTransfersRef.current.has(itemId)) {
            cancelled = true
            try {
              if (isEncrypted) {
                const encrypted = await encryptJSON(encryptor, {
                  type: "file-cancel",
                  itemId,
                })
                conn.send({ type: "encrypted", encrypted })
              } else {
                conn.send({
                  type: "file-cancel",
                  itemId,
                })
              }
            } catch (error) {
              console.error("Failed to send file-cancel:", error)
            }
            break
          }
          
          const end = Math.min(offset + FILE_CHUNK_SIZE, uint8Array.length)
          const chunk = uint8Array.subarray(offset, end)
          
          try {
            if (isEncrypted) {
              // 简化：只加密文件块，JSON 元数据不加密（减少双重加密）
              const encryptedChunk = await encryptBytes(encryptor, chunk)
              conn.send({
                type: "file-chunk",
                encrypted: encryptedChunk, // 直接发送加密后的 base64，不再次加密 JSON
              })
            } else {
              conn.send({
                type: "file-chunk",
                data: uint8ToBase64(chunk),
              })
            }
          } catch (error) {
            console.error("Failed to send file-chunk:", error)
            break
          }
          
          offset = end
          
          const now = Date.now()
          if (now - lastTime >= 500 || offset >= totalSize) {
            const timeDiff = (now - lastTime) / 1000
            const bytesDiff = offset - lastBytes
            const instantSpeed = timeDiff > 0 ? Math.round(bytesDiff / timeDiff) : 0
            
            // EMA smoothing (alpha = 0.2)
            smoothedSpeed = smoothedSpeed === 0 
              ? instantSpeed 
              : Math.round(smoothedSpeed * 0.8 + instantSpeed * 0.2)
            
            const speed = smoothedSpeed
            const remainingBytes = totalSize - offset
            const remainingTime = speed > 0 ? Math.ceil(remainingBytes / speed) : undefined
            
            updateItemProgress(itemId, {
              progress: Math.round((offset / totalSize) * 100),
              transferredBytes: offset,
              speed,
              remainingTime,
            })
            
            lastTime = now
            lastBytes = offset
          }
          
          // 优化批量处理：使用 requestIdleCallback 或 setTimeout 给 UI 让路
          // 每处理 3 个块就让出控制权，避免阻塞主线程
          if ((offset / FILE_CHUNK_SIZE) % 3 === 0) {
            // 优先使用 requestIdleCallback，如果不支持则使用 setTimeout
            if (typeof requestIdleCallback !== 'undefined') {
              await new Promise(resolve => {
                requestIdleCallback(() => resolve(undefined), { timeout: 5 })
              })
            } else {
              await new Promise(resolve => setTimeout(resolve, 0))
            }
          }
        }

        if (!cancelled) {
          try {
            if (isEncrypted) {
              const encrypted = await encryptJSON(encryptor, { type: "file-end" })
              conn.send({ type: "encrypted", encrypted })
            } else {
              conn.send({ type: "file-end" })
            }
          } catch (error) {
            console.error("Failed to send file-end:", error)
          }
        }
      }
      
      if (cancelled) {
        updateItemProgress(itemId, {
          status: "cancelled",
          speed: undefined,
        })
        refs.cancelledTransfersRef.current.delete(itemId)
      } else {
        updateItemProgress(itemId, {
          status: "completed",
          progress: 100,
          transferredBytes: totalSize,
          speed: undefined,
          remainingTime: undefined,
        })
      }
    } catch (error) {
      console.error("File send error:", error)
      if (itemId) {
        updateItemProgress(itemId, {
          status: "error",
          speed: undefined,
          remainingTime: undefined,
        })
      }
    } finally {
      setSendingCount(prev => Math.max(0, prev - 1))
      if (itemId) {
        refs.cancelledTransfersRef.current.delete(itemId)
      }
    }
  }

  return { sendText, sendFile }
}
