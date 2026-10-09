/**
 * Data transfer module
 * Handles text and file sending with resume and adaptive chunk sizing.
 */

import type { SessionEncryptor } from './crypto'
import type { ConnectionRefs } from './transfer-connection'
import type { FileOfferSummary } from './transfer-protocol'
import { encryptBytes, encryptJSON } from './crypto'
import { buildIncomingTransferSummary } from './incoming-transfer-risk'
import {
  FILE_CHUNK_MAX_SIZE,
  FILE_CHUNK_MIN_SIZE,
  FILE_CHUNK_SIZE,
  FILE_RESUME_WAIT_TIMEOUT,
} from './peer-config'
import { createBinaryFileChunkPayload } from './transfer-chunk'
import { getFileOfferResponseKey } from './transfer-protocol'

export interface DataTransferCallbacks {
  setSendingCount: (updater: (prev: number) => number) => void
  addItem: (item: any) => void
  addItemWithId: (item: any) => string
  updateItemProgress: (id: string, updates: any) => void
  createTrackedBlobUrl: (blob: Blob | File, cleanup?: () => Promise<void> | void) => string
  addSystemMessage: (message: string, force?: boolean) => void
}

interface PeerSendResult {
  status: 'completed' | 'failed' | 'cancelled' | 'rejected'
  bytesSent: number
}

type PeerConnectionLike = any

type ControlPayload = Record<string, any>

/**
 * 等待与对端加密通道就绪的最长时长。密钥交换通常在连接建立后 1 个 RTT 内
 * 完成；超时意味着对端异常或拒绝握手，此时宁可不发送也不降级为明文。
 */
export const ENCRYPTOR_WAIT_TIMEOUT_MS = 10_000

/**
 * 等待指定对端的会话加密器就绪。返回 null 表示超时——调用方应放弃发送，
 * 而不是降级为明文（接收端在握手完成后会直接丢弃明文控制消息）。
 */
export async function waitForPeerEncryptor(
  encryptorsRef: { current: Map<string, SessionEncryptor> },
  peerId: string,
  timeoutMs = ENCRYPTOR_WAIT_TIMEOUT_MS,
): Promise<SessionEncryptor | null> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const encryptor = encryptorsRef.current.get(peerId)
    if (encryptor?.isReady()) {
      return encryptor
    }
    if (Date.now() >= deadline) {
      return null
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

export function buildOutgoingTransferOfferSummary(files: File[]): FileOfferSummary | undefined {
  if (files.length <= 1) {
    return undefined
  }

  const summary = buildIncomingTransferSummary({
    files: files.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
    })),
  })

  return {
    fileCount: summary.fileCount,
    totalSize: summary.totalSize,
    sampleFiles: summary.sampleFiles,
    ...(summary.riskFlags.length > 0 ? { riskFlags: summary.riskFlags } : {}),
    ...(summary.requiresSecondaryConfirmation ? { requiresSecondaryConfirmation: true } : {}),
    ...(summary.executableFileName ? { executableFileName: summary.executableFileName } : {}),
  }
}

export function createDataTransfer(
  refs: ConnectionRefs,
  callbacks: DataTransferCallbacks,
  encryptorsRef: React.MutableRefObject<Map<string, SessionEncryptor>>,
) {
  const {
    setSendingCount,
    addItem,
    addItemWithId,
    updateItemProgress,
    createTrackedBlobUrl,
    addSystemMessage,
  } = callbacks

  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
  const FILE_OFFER_RESPONSE_TIMEOUT_MS = 60_000

  const sendText = async (text: string) => {
    if (!text.trim())
      return

    // 加密通道未就绪前不发送明文：逐个对端等待加密器，超时的跳过。
    const results = await Promise.all(
      Array.from(refs.connectionsRef.current.entries()).map(async ([peerId, conn]) => {
        if (!conn.open)
          return false

        const encryptor = await waitForPeerEncryptor(encryptorsRef, peerId)
        if (!encryptor) {
          console.error(`Refusing to send plaintext text to ${peerId}: encryption not ready`)
          return false
        }

        try {
          const encrypted = await encryptJSON(encryptor, { type: 'text', content: text })
          conn.send({ type: 'encrypted', encrypted })
          return true
        }
        catch (error) {
          console.error('Failed to send text:', error)
          return false
        }
      }),
    )

    const delivered = results.filter(Boolean).length
    if (delivered > 0) {
      addItem({
        type: 'text',
        content: text,
        direction: 'sent',
      })
    }
    if (delivered < results.length) {
      addSystemMessage('部分设备的加密通道未建立，文本未发送（未降级为明文）')
    }
  }

  const sendControlToPeer = async (peerId: string, payload: ControlPayload): Promise<boolean> => {
    const conn = refs.connectionsRef.current.get(peerId)
    if (!conn || !conn.open)
      return false

    // 控制消息（offer / start / end / cancel / response）必须走加密信封；
    // 加密器未就绪则等待，超时直接失败，绝不发送明文。
    const encryptor = await waitForPeerEncryptor(encryptorsRef, peerId)
    if (!encryptor) {
      console.error(`Refusing to send plaintext control payload to ${peerId}: encryption not ready`)
      return false
    }

    try {
      const encrypted = await encryptJSON(encryptor, payload)
      conn.send({ type: 'encrypted', encrypted })
      return true
    }
    catch (error) {
      console.error('Failed to send control message:', error)
      return false
    }
  }

  const sendChunkToPeer = async (
    peerId: string,
    itemId: string,
    offset: number,
    chunk: Uint8Array,
  ): Promise<boolean> => {
    const conn = refs.connectionsRef.current.get(peerId)
    if (!conn || !conn.open)
      return false

    const encryptor = encryptorsRef.current.get(peerId)
    if (!encryptor?.isReady()) {
      // 文件块必须逐块加密；offer/start 阶段已保证加密器就绪，
      // 这里做最后一道防线，绝不发送明文块。
      console.error(`Refusing to send plaintext file chunk to ${peerId}: encryption not ready`)
      return false
    }

    try {
      const bytes = await encryptBytes(encryptor, chunk)
      conn.send(createBinaryFileChunkPayload({
        bytes,
        encrypted: true,
        itemId,
        offset,
      }))
      return true
    }
    catch (error) {
      console.error('Failed to send file chunk:', error)
      return false
    }
  }

  const waitForPeerConnection = async (
    peerId: string,
    itemId: string,
    timeoutMs: number,
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

  const waitForFileOfferResponse = async (
    peerId: string,
    offerId: string,
  ): Promise<boolean> => {
    const responseKey = getFileOfferResponseKey(peerId, offerId)

    return await new Promise<boolean>((resolve) => {
      const timeoutId = setTimeout(() => {
        refs.pendingFileOfferResponsesRef.current.delete(responseKey)
        resolve(false)
      }, FILE_OFFER_RESPONSE_TIMEOUT_MS)

      refs.pendingFileOfferResponsesRef.current.set(responseKey, {
        resolve: (accepted) => {
          clearTimeout(timeoutId)
          refs.pendingFileOfferResponsesRef.current.delete(responseKey)
          resolve(accepted)
        },
      })
    })
  }

  /**
   * 发送背压：当 SCTP 发送缓冲超过高水位时，等待其排空到低水位再继续，
   * 避免慢对端把发送方内存撑爆。等待期间也会响应用户取消。
   */
  const SEND_BUFFER_HIGH_WATERMARK = 4 * 1024 * 1024
  const SEND_BUFFER_LOW_WATERMARK = 1 * 1024 * 1024
  const SEND_BUFFER_DRAIN_TIMEOUT_MS = 30_000

  const waitForSendBufferDrain = async (
    dataChannel: { bufferedAmount?: number } | undefined,
    itemId: string,
  ) => {
    const deadline = Date.now() + SEND_BUFFER_DRAIN_TIMEOUT_MS
    for (;;) {
      if (refs.cancelledTransfersRef.current.has(itemId)) {
        return
      }
      const buffered = dataChannel?.bufferedAmount ?? 0
      if (buffered <= SEND_BUFFER_LOW_WATERMARK) {
        return
      }
      if (Date.now() >= deadline) {
        return
      }
      await sleep(50)
    }
  }

  const tuneChunkSize = (current: number, sendDurationMs: number, bufferedAmount: number) => {
    let next = current

    if (bufferedAmount > 2 * 1024 * 1024 || sendDurationMs > 40) {
      next = Math.max(FILE_CHUNK_MIN_SIZE, Math.floor(current / 2))
    }
    else if (bufferedAmount < 256 * 1024 && sendDurationMs < 10) {
      next = Math.min(FILE_CHUNK_MAX_SIZE, current + 4096)
    }

    return next
  }

  const sendFileToPeer = async (
    peerId: string,
    file: File,
    itemId: string,
    offerSummary: FileOfferSummary | undefined,
    onProgress: (bytesSent: number) => void,
  ): Promise<PeerSendResult> => {
    const totalSize = file.size
    let offset = 0
    let chunkSize = FILE_CHUNK_SIZE
    let chunkIndex = 0
    let hasSentStart = false
    // file-start 发送连续失败计数：加密器长期未就绪（对端异常/拒绝握手）时
    // 不应无限重试，直接判失败，交由用户决定是否重发。
    let startFailures = 0
    const MAX_START_FAILURES = 3

    const offered = await sendControlToPeer(peerId, {
      type: 'file-offer',
      offerId: itemId,
      fileType: file.type,
      name: file.name,
      size: totalSize,
      ...(offerSummary ? { summary: offerSummary } : {}),
    })

    if (!offered) {
      return { status: 'failed', bytesSent: 0 }
    }

    const accepted = await waitForFileOfferResponse(peerId, itemId)
    if (!accepted) {
      return { status: 'rejected', bytesSent: 0 }
    }

    while (offset < totalSize) {
      if (refs.cancelledTransfersRef.current.has(itemId)) {
        await sendControlToPeer(peerId, { type: 'file-cancel', itemId })
        return { status: 'cancelled', bytesSent: offset }
      }

      let conn: PeerConnectionLike | null = refs.connectionsRef.current.get(peerId) ?? null
      if (!conn || !conn.open) {
        conn = await waitForPeerConnection(peerId, itemId, FILE_RESUME_WAIT_TIMEOUT)
        if (!conn) {
          return refs.cancelledTransfersRef.current.has(itemId)
            ? { status: 'cancelled', bytesSent: offset }
            : { status: 'failed', bytesSent: offset }
        }

        const resumed = offset > 0
        const started = await sendControlToPeer(peerId, {
          type: 'file-start',
          fileType: file.type,
          name: file.name,
          size: totalSize,
          itemId,
          resume: resumed,
          offset,
        })

        if (!started) {
          startFailures += 1
          if (startFailures >= MAX_START_FAILURES) {
            return { status: 'failed', bytesSent: offset }
          }
          await sleep(80)
          continue
        }

        hasSentStart = true
        startFailures = 0
      }
      else if (!hasSentStart) {
        const started = await sendControlToPeer(peerId, {
          type: 'file-start',
          fileType: file.type,
          name: file.name,
          size: totalSize,
          itemId,
          resume: false,
          offset: 0,
        })

        if (!started) {
          startFailures += 1
          if (startFailures >= MAX_START_FAILURES) {
            return { status: 'failed', bytesSent: offset }
          }
          await sleep(80)
          continue
        }

        hasSentStart = true
        startFailures = 0
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

      if (bufferedAmount > SEND_BUFFER_HIGH_WATERMARK) {
        await waitForSendBufferDrain(dataChannel, itemId)
      }

      chunkIndex += 1
      if (chunkIndex % 3 === 0) {
        if (typeof requestIdleCallback !== 'undefined') {
          await new Promise<void>((resolve) => {
            requestIdleCallback(() => resolve(), { timeout: 5 })
          })
        }
        else {
          await sleep(0)
        }
      }
    }

    const sentEnd = await sendControlToPeer(peerId, { type: 'file-end', itemId })
    if (!sentEnd) {
      return { status: 'failed', bytesSent: offset }
    }

    return { status: 'completed', bytesSent: totalSize }
  }

  const sendFile = async (file: File, offerSummary?: FileOfferSummary): Promise<void> => {
    setSendingCount(prev => prev + 1)

    let itemId: string | null = null
    let cancelled = false

    try {
      const url = createTrackedBlobUrl(file)

      itemId = addItemWithId({
        type: 'file',
        name: file.name,
        content: url,
        size: file.size,
        direction: 'sent',
        status: 'pending',
        progress: 0,
        transferredBytes: 0,
      })

      const totalSize = file.size
      const targetPeerIds = Array.from(refs.connectionsRef.current.entries())
        .filter(([, conn]) => conn.open)
        .map(([peerId]) => peerId)

      if (targetPeerIds.length === 0) {
        throw new Error('No active peers')
      }

      const peerProgress = new Map<string, number>()
      targetPeerIds.forEach(peerId => peerProgress.set(peerId, 0))

      let lastTime = Date.now()
      let lastBytes = 0
      let smoothedSpeed = 0

      const updateAggregateProgress = (force = false) => {
        const offsets = Array.from(peerProgress.values())
        if (offsets.length === 0)
          return

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
          status: guaranteedOffset < totalSize ? 'transferring' : 'completed',
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
          const result = await sendFileToPeer(peerId, file, itemId!, offerSummary, (bytesSent) => {
            peerProgress.set(peerId, bytesSent)
            updateAggregateProgress(false)
          })

          if (result.status === 'completed') {
            peerProgress.set(peerId, totalSize)
            updateAggregateProgress(false)
          }
          else {
            peerProgress.set(peerId, result.bytesSent)
          }

          return result
        }),
      )

      updateAggregateProgress(true)

      cancelled = refs.cancelledTransfersRef.current.has(itemId)
        || peerResults.some(result => result.status === 'cancelled')

      const completedCount = peerResults.filter(result => result.status === 'completed').length
      const failedCount = peerResults.filter(result => result.status === 'failed').length
      const rejectedCount = peerResults.filter(result => result.status === 'rejected').length

      if (cancelled) {
        updateItemProgress(itemId, {
          status: 'cancelled',
          speed: undefined,
          remainingTime: undefined,
        })
        refs.cancelledTransfersRef.current.delete(itemId)
      }
      else if (completedCount > 0) {
        if (failedCount > 0) {
          console.warn(`Partial delivery: ${failedCount} peer(s) failed to receive ${file.name}`)
        }
        if (rejectedCount > 0) {
          addSystemMessage(`${rejectedCount} 个设备拒绝接收 ${file.name}`, true)
        }

        updateItemProgress(itemId, {
          status: 'completed',
          progress: 100,
          transferredBytes: totalSize,
          speed: undefined,
          remainingTime: undefined,
        })
      }
      else if (rejectedCount > 0) {
        addSystemMessage(`对方拒绝接收 ${file.name}`, true)
        updateItemProgress(itemId, {
          status: 'error',
          speed: undefined,
          remainingTime: undefined,
        })
      }
      else {
        updateItemProgress(itemId, {
          status: 'error',
          speed: undefined,
          remainingTime: undefined,
        })
      }
    }
    catch (error) {
      console.error('File send error:', error)
      if (itemId) {
        updateItemProgress(itemId, {
          status: 'error',
          speed: undefined,
          remainingTime: undefined,
        })
      }
    }
    finally {
      setSendingCount(prev => Math.max(0, prev - 1))
      if (itemId) {
        refs.cancelledTransfersRef.current.delete(itemId)
      }
    }
  }

  return { sendText, sendFile }
}
