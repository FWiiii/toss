/**
 * Data transfer module
 * Handles text and file sending with resume and adaptive chunk sizing.
 */

import { uint8ToBase64 } from "./utils"
import {
  FILE_CHUNK_SIZE,
  FILE_CHUNK_MIN_SIZE,
  FILE_CHUNK_MAX_SIZE,
  FILE_RESUME_WAIT_TIMEOUT,
} from "./peer-config"
import { encryptJSON, encryptBytes, SessionEncryptor } from "./crypto"
import type { ConnectionRefs } from "./transfer-connection"

export type DataTransferCallbacks = {
  setSendingCount: (updater: (prev: number) => number) => void
  addItem: (item: any) => void
  addItemWithId: (item: any) => string
  updateItemProgress: (id: string, updates: any) => void
  createTrackedBlobUrl: (blob: Blob | File) => string
}

type PeerSendResult = {
  status: "completed" | "failed" | "cancelled"
  bytesSent: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PeerConnectionLike = any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ControlPayload = Record<string, any>

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

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

  const sendText = async (text: string) => {
    if (!text.trim()) return

    for (const [peerId, conn] of refs.connectionsRef.current.entries()) {
      if (!conn.open) continue

      const encryptor = encryptorsRef.current.get(peerId)
      const isEncrypted = encryptor?.isReady() ?? false

      try {
        if (isEncrypted && encryptor) {
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

  const sendControlToPeer = async (peerId: string, payload: ControlPayload): Promise<boolean> => {
    const conn = refs.connectionsRef.current.get(peerId)
    if (!conn || !conn.open) return false

    const encryptor = encryptorsRef.current.get(peerId)
    const isEncrypted = encryptor?.isReady() ?? false

    try {
      if (isEncrypted && encryptor) {
        const encrypted = await encryptJSON(encryptor, payload)
        conn.send({ type: "encrypted", encrypted })
      } else {
        conn.send(payload)
      }
      return true
    } catch (error) {
      console.error("Failed to send control message:", error)
      return false
    }
  }

  const sendChunkToPeer = async (
    peerId: string,
    itemId: string,
    offset: number,
    chunk: Uint8Array
  ): Promise<boolean> => {
    const conn = refs.connectionsRef.current.get(peerId)
    if (!conn || !conn.open) return false

    const encryptor = encryptorsRef.current.get(peerId)
    const isEncrypted = encryptor?.isReady() ?? false

    try {
      if (isEncrypted && encryptor) {
        const encryptedChunk = await encryptBytes(encryptor, chunk)
        conn.send({
          type: "file-chunk",
          itemId,
          offset,
          encrypted: encryptedChunk,
        })
      } else {
        conn.send({
          type: "file-chunk",
          itemId,
          offset,
          data: uint8ToBase64(chunk),
        })
      }
      return true
    } catch (error) {
      console.error("Failed to send file chunk:", error)
      return false
    }
  }

  const waitForPeerConnection = async (
    peerId: string,
    itemId: string,
    timeoutMs: number
  ): Promise<PeerConnectionLike | null> => {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      if (refs.cancelledTransfersRef.current.has(itemId)) {
        return null
      }

      const conn = refs.connectionsRef.current.get(peerId)
      if (conn && conn.open) {
        return conn
      }

      await sleep(250)
    }

    return null
  }

  const tuneChunkSize = (current: number, sendDurationMs: number, bufferedAmount: number) => {
    let next = current

    if (bufferedAmount > 2 * 1024 * 1024 || sendDurationMs > 40) {
      next = Math.max(FILE_CHUNK_MIN_SIZE, Math.floor(current / 2))
    } else if (bufferedAmount < 256 * 1024 && sendDurationMs < 10) {
      next = Math.min(FILE_CHUNK_MAX_SIZE, current + 4096)
    }

    return next
  }

  const sendFileToPeer = async (
    peerId: string,
    file: File,
    itemId: string,
    onProgress: (bytesSent: number) => void
  ): Promise<PeerSendResult> => {
    const totalSize = file.size
    let offset = 0
    let chunkSize = FILE_CHUNK_SIZE
    let chunkIndex = 0
    let hasSentStart = false

    while (offset < totalSize) {
      if (refs.cancelledTransfersRef.current.has(itemId)) {
        await sendControlToPeer(peerId, { type: "file-cancel", itemId })
        return { status: "cancelled", bytesSent: offset }
      }

      let conn: PeerConnectionLike | null = refs.connectionsRef.current.get(peerId) ?? null
      if (!conn || !conn.open) {
        conn = await waitForPeerConnection(peerId, itemId, FILE_RESUME_WAIT_TIMEOUT)
        if (!conn) {
          return refs.cancelledTransfersRef.current.has(itemId)
            ? { status: "cancelled", bytesSent: offset }
            : { status: "failed", bytesSent: offset }
        }

        const resumed = offset > 0
        const started = await sendControlToPeer(peerId, {
          type: "file-start",
          name: file.name,
          size: totalSize,
          itemId,
          resume: resumed,
          offset,
        })

        if (!started) {
          await sleep(80)
          continue
        }

        hasSentStart = true
      } else if (!hasSentStart) {
        const started = await sendControlToPeer(peerId, {
          type: "file-start",
          name: file.name,
          size: totalSize,
          itemId,
          resume: false,
          offset: 0,
        })

        if (!started) {
          await sleep(80)
          continue
        }

        hasSentStart = true
      }

      const end = Math.min(offset + chunkSize, totalSize)
      const chunkBuffer = await file.slice(offset, end).arrayBuffer()
      const chunk = new Uint8Array(chunkBuffer)

      const sentAt = Date.now()
      const sent = await sendChunkToPeer(peerId, itemId, offset, chunk)
      if (!sent) {
        await sleep(60)
        continue
      }

      offset = end
      onProgress(offset)

      const dataChannel = (conn as { dataChannel?: RTCDataChannel }).dataChannel
      const bufferedAmount = dataChannel?.bufferedAmount ?? 0
      const sendDurationMs = Date.now() - sentAt
      chunkSize = tuneChunkSize(chunkSize, sendDurationMs, bufferedAmount)

      if (bufferedAmount > 4 * 1024 * 1024) {
        await sleep(16)
      }

      chunkIndex += 1
      if (chunkIndex % 3 === 0) {
        if (typeof requestIdleCallback !== "undefined") {
          await new Promise<void>((resolve) => {
            requestIdleCallback(() => resolve(), { timeout: 5 })
          })
        } else {
          await sleep(0)
        }
      }
    }

    const sentEnd = await sendControlToPeer(peerId, { type: "file-end", itemId })
    if (!sentEnd) {
      return { status: "failed", bytesSent: offset }
    }

    return { status: "completed", bytesSent: totalSize }
  }

  const sendFile = async (file: File): Promise<void> => {
    setSendingCount((prev) => prev + 1)

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
      const targetPeerIds = Array.from(refs.connectionsRef.current.entries())
        .filter(([, conn]) => conn.open)
        .map(([peerId]) => peerId)

      if (targetPeerIds.length === 0) {
        throw new Error("No active peers")
      }

      const peerProgress = new Map<string, number>()
      targetPeerIds.forEach((peerId) => peerProgress.set(peerId, 0))

      let lastTime = Date.now()
      let lastBytes = 0
      let smoothedSpeed = 0

      const updateAggregateProgress = (force = false) => {
        const offsets = Array.from(peerProgress.values())
        if (offsets.length === 0) return

        const guaranteedOffset = Math.min(...offsets)
        const now = Date.now()

        if (!force && now - lastTime < 500 && guaranteedOffset < totalSize) {
          return
        }

        const timeDiff = (now - lastTime) / 1000
        const bytesDiff = guaranteedOffset - lastBytes
        const instantSpeed = timeDiff > 0 ? Math.round(bytesDiff / timeDiff) : 0

        smoothedSpeed = smoothedSpeed === 0
          ? instantSpeed
          : Math.round(smoothedSpeed * 0.8 + instantSpeed * 0.2)

        const speed = smoothedSpeed
        const remainingBytes = totalSize - guaranteedOffset
        const remainingTime = speed > 0 ? Math.ceil(remainingBytes / speed) : undefined

        updateItemProgress(itemId!, {
          status: guaranteedOffset < totalSize ? "transferring" : "completed",
          progress: Math.round((guaranteedOffset / totalSize) * 100),
          transferredBytes: guaranteedOffset,
          speed: guaranteedOffset < totalSize ? speed : undefined,
          remainingTime: guaranteedOffset < totalSize ? remainingTime : undefined,
        })

        lastTime = now
        lastBytes = guaranteedOffset
      }

      const peerResults = await Promise.all(
        targetPeerIds.map(async (peerId) => {
          const result = await sendFileToPeer(peerId, file, itemId!, (bytesSent) => {
            peerProgress.set(peerId, bytesSent)
            updateAggregateProgress(false)
          })

          if (result.status === "completed") {
            peerProgress.set(peerId, totalSize)
            updateAggregateProgress(false)
          } else {
            peerProgress.set(peerId, result.bytesSent)
          }

          return result
        })
      )

      updateAggregateProgress(true)

      cancelled = refs.cancelledTransfersRef.current.has(itemId)
        || peerResults.some((result) => result.status === "cancelled")

      const completedCount = peerResults.filter((result) => result.status === "completed").length
      const failedCount = peerResults.filter((result) => result.status === "failed").length

      if (cancelled) {
        updateItemProgress(itemId, {
          status: "cancelled",
          speed: undefined,
          remainingTime: undefined,
        })
        refs.cancelledTransfersRef.current.delete(itemId)
      } else if (completedCount > 0) {
        if (failedCount > 0) {
          console.warn(`Partial delivery: ${failedCount} peer(s) failed to receive ${file.name}`)
        }

        updateItemProgress(itemId, {
          status: "completed",
          progress: 100,
          transferredBytes: totalSize,
          speed: undefined,
          remainingTime: undefined,
        })
      } else {
        updateItemProgress(itemId, {
          status: "error",
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
      setSendingCount((prev) => Math.max(0, prev - 1))
      if (itemId) {
        refs.cancelledTransfersRef.current.delete(itemId)
      }
    }
  }

  return { sendText, sendFile }
}
