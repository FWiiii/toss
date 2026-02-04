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

      const totalSize = file.size
      const peers = Array.from(refs.connectionsRef.current.entries())
        .filter(([, conn]) => conn.open)
        .map(([peerId, conn]) => {
          const encryptor = encryptorsRef.current.get(peerId)
          const isEncrypted = encryptor?.isReady() ?? false
          return { peerId, conn, encryptor, isEncrypted, active: true }
        })

      for (const peer of peers) {
        if (!peer.conn.open) {
          peer.active = false
          continue
        }

        try {
          if (peer.isEncrypted && peer.encryptor) {
            const encrypted = await encryptJSON(peer.encryptor, {
              type: "file-start",
              name: file.name,
              size: file.size,
              itemId,
            })
            peer.conn.send({ type: "encrypted", encrypted })
          } else {
            peer.conn.send({
              type: "file-start",
              name: file.name,
              size: file.size,
              itemId,
            })
          }
        } catch (error) {
          peer.active = false
          console.error("Failed to send file-start:", error)
        }
      }

      let offset = 0
      let chunkIndex = 0
      let lastTime = Date.now()
      let lastBytes = 0
      let smoothedSpeed = 0

      while (offset < totalSize) {
        if (refs.cancelledTransfersRef.current.has(itemId)) {
          cancelled = true
          for (const peer of peers) {
            if (!peer.active || !peer.conn.open) continue
            try {
              if (peer.isEncrypted && peer.encryptor) {
                const encrypted = await encryptJSON(peer.encryptor, {
                  type: "file-cancel",
                  itemId,
                })
                peer.conn.send({ type: "encrypted", encrypted })
              } else {
                peer.conn.send({
                  type: "file-cancel",
                  itemId,
                })
              }
            } catch (error) {
              peer.active = false
              console.error("Failed to send file-cancel:", error)
            }
          }
          break
        }
        
        const end = Math.min(offset + FILE_CHUNK_SIZE, totalSize)
        const chunkBuffer = await file.slice(offset, end).arrayBuffer()
        const chunk = new Uint8Array(chunkBuffer)
        
        for (const peer of peers) {
          if (!peer.active || !peer.conn.open) continue
          try {
            if (peer.isEncrypted && peer.encryptor) {
              // 简化：只加密文件块，JSON 元数据不加密（减少双重加密）
              const encryptedChunk = await encryptBytes(peer.encryptor, chunk)
              peer.conn.send({
                type: "file-chunk",
                itemId,
                encrypted: encryptedChunk, // 直接发送加密后的 base64，不再次加密 JSON
              })
            } else {
              peer.conn.send({
                type: "file-chunk",
                itemId,
                data: uint8ToBase64(chunk),
              })
            }
          } catch (error) {
            peer.active = false
            console.error("Failed to send file-chunk:", error)
          }
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
        chunkIndex += 1
        if (chunkIndex % 3 === 0) {
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
        for (const peer of peers) {
          if (!peer.active || !peer.conn.open) continue
          try {
            if (peer.isEncrypted && peer.encryptor) {
              const encrypted = await encryptJSON(peer.encryptor, { type: "file-end", itemId })
              peer.conn.send({ type: "encrypted", encrypted })
            } else {
              peer.conn.send({ type: "file-end", itemId })
            }
          } catch (error) {
            peer.active = false
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
