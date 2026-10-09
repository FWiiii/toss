/**
 * 连接管理模块
 * 处理 WebRTC 连接建立、密钥交换、重连等逻辑
 */

import type { ConnectionAttemptRegistry } from './connection-attempts'
import type { ReceiveStorageHandle } from './receive-storage'
import type { PeerHandshakeState } from './transfer-protocol'
import type { LocalDeviceProfile, TrustedDeviceRecord } from './trusted-devices'
import type { ConnectionInfo, IncomingFileOffer, PeerDeviceInfo, ReceiveHistoryOutcome } from './types'
import { HEARTBEAT_TIMEOUT_MS } from './connection-quality'
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  decryptBytes,
  decryptJSON,
  deriveSharedSecret,
  encryptJSON,
  exportPublicKey,
  generateKeyPair,
  getSessionFingerprint,
  importPublicKey,
  SessionEncryptor,
} from './crypto'
import { buildIncomingTransferSummary } from './incoming-transfer-risk'
import {
  CONNECTION_TIMEOUT,
  detectConnectionType,
  ICE_DISCONNECTED_GRACE_PERIOD_MS,
  MAX_FILE_SIZE_BYTES,
  MAX_RECONNECT_ATTEMPTS,
  PEER_PREFIX,
} from './peer-config'
import { createReceiveStorage, hasStorageQuotaFor } from './receive-storage'
import { createSequentialAsyncProcessor } from './serial-async-processor'
import { readBinaryChunkPayload } from './transfer-chunk'
import { isInboundPeerPayloadAllowed, validateIncomingRawPeerPayload, validateIncomingTransferPayload } from './transfer-protocol'

const IMAGE_FILE_NAME_REGEX = /\.(?:jpg|jpeg|png|gif|webp|svg)$/i

export interface ActiveReceiveBuffer {
  peerId: string
  name: string
  size: number
  type: string
  received: number
  localItemId: string
  remoteItemId: string
  lastTime: number
  lastBytes: number
  smoothedSpeed: number
  storage: ReceiveStorageHandle
  historyOffer: IncomingFileOffer
}

export interface ConnectionRefs {
  connectionsRef: React.MutableRefObject<Map<string, any>>
  encryptorsRef: React.MutableRefObject<Map<string, SessionEncryptor>>
  encryptionFingerprintsRef: React.MutableRefObject<Map<string, string>>
  keyExchangePendingRef: React.MutableRefObject<Map<string, {
    keyPair: Awaited<ReturnType<typeof generateKeyPair>>
    isOutgoing: boolean
  }>>
  fileBuffersRef: React.MutableRefObject<Map<string, ActiveReceiveBuffer>>
  peerDevicesRef: React.MutableRefObject<Map<string, PeerDeviceInfo>>
  localDeviceProfileRef: React.MutableRefObject<LocalDeviceProfile | null>
  trustedDevicesRef: React.MutableRefObject<Map<string, TrustedDeviceRecord>>
  pendingIncomingFileOffersRef: React.MutableRefObject<Map<string, IncomingFileOffer>>
  acceptedIncomingFileOffersRef: React.MutableRefObject<Map<string, IncomingFileOffer>>
  approvedIncomingFileOffersRef: React.MutableRefObject<Map<string, string>>
  pendingFileOfferResponsesRef: React.MutableRefObject<Map<string, {
    resolve: (accepted: boolean) => void
  }>>
  reconnectAttemptsRef: React.MutableRefObject<number>
  reconnectTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
  shouldReconnectRef: React.MutableRefObject<boolean>
  suppressReconnectUntilRef: React.MutableRefObject<number>
  pendingReconnectRef: React.MutableRefObject<boolean>
  peerRef: React.MutableRefObject<any>
  connectingPeersRef: React.MutableRefObject<ConnectionAttemptRegistry>
  setupConnectionRef: React.MutableRefObject<((conn: any, isOutgoing?: boolean) => void) | null>
  attemptReconnectRef: React.MutableRefObject<(() => void) | null>
  joinRoomRef: React.MutableRefObject<((code: string) => Promise<void>) | null>
  cancelledTransfersRef: React.MutableRefObject<Set<string>>
}

export interface ConnectionCallbacks {
  setError: (message: string) => void
  setConnectionStatus: (status: any) => void
  setConnectionInfo: (info: ConnectionInfo) => void
  setErrorMessage: (message: string | null) => void
  setIsEncrypted: (encrypted: boolean) => void
  setPeerCount: (count: number) => void
  updatePeerCount: () => void
  addSystemMessage: (message: string) => void
  addItem: (item: any) => void
  addItemWithId: (item: any) => string
  updateItemProgress: (id: string, updates: any) => void
  createTrackedBlobUrl: (blob: Blob | File, cleanup?: () => Promise<void> | void) => string
  broadcastToConnections: (data: any, excludePeer?: string) => Promise<void>
  cleanupAll: () => void
  handlePong: (peerId: string, id: string) => void
  touchPeer: (peerId: string) => void
  isPeerHealthy: (peerId: string) => boolean
  recordBandwidth: (peerId: string, speed: number) => void
  removePeerQuality: (peerId: string) => void
  notifyReceived: (type: string, name?: string) => void
  handlePeerConnectedToScreenShare?: (peerId: string) => void
  setPeerEncryptionFingerprint?: (peerId: string, fingerprint: string | null) => void
  getLocalDeviceProfile?: () => LocalDeviceProfile
  queueIncomingFileOffer?: (offer: IncomingFileOffer) => void
  resolvePendingFileOfferResponse?: (peerId: string, offerId: string, accepted: boolean) => void
  discardIncomingFileOffersForPeer?: (peerId: string) => void
  rememberTrustedPeer?: (deviceInfo: PeerDeviceInfo) => void
  recordReceiveHistory?: (options: {
    offer: IncomingFileOffer
    outcome: ReceiveHistoryOutcome
    failureReason: string | null
  }) => void
}

export function createSetupConnection(
  refs: ConnectionRefs,
  callbacks: ConnectionCallbacks,
  roomCode: string | null,
) {
  const {
    connectionsRef,
    encryptorsRef,
    encryptionFingerprintsRef,
    keyExchangePendingRef,
    fileBuffersRef,
    peerDevicesRef,
    trustedDevicesRef,
    pendingIncomingFileOffersRef,
    acceptedIncomingFileOffersRef,
    approvedIncomingFileOffersRef,
  } = refs

  const {
    setError,
    setConnectionInfo,
    setIsEncrypted,
    updatePeerCount,
    addItem,
    addItemWithId,
    updateItemProgress,
    createTrackedBlobUrl,
    broadcastToConnections,
    cleanupAll,
    addSystemMessage,
    handlePong,
    touchPeer,
    isPeerHealthy,
    recordBandwidth,
    removePeerQuality,
    notifyReceived,
    getLocalDeviceProfile,
    queueIncomingFileOffer,
    resolvePendingFileOfferResponse,
    discardIncomingFileOffersForPeer,
    rememberTrustedPeer,
    recordReceiveHistory,
  } = callbacks

  const markBuffersPendingForPeer = (peerId: string) => {
    for (const [bufferKey, buffer] of fileBuffersRef.current.entries()) {
      if (buffer.peerId === peerId) {
        fileBuffersRef.current.set(bufferKey, {
          ...buffer,
          lastTime: Date.now(),
          lastBytes: buffer.received,
          smoothedSpeed: 0,
        })
        updateItemProgress(buffer.localItemId, {
          status: 'pending',
          speed: undefined,
          remainingTime: undefined,
        })
      }
    }
  }

  const findBufferKeyByPeer = (peerId: string) => {
    for (const [bufferKey, buffer] of fileBuffersRef.current.entries()) {
      if (buffer.peerId === peerId) {
        return bufferKey
      }
    }
    return null
  }

  const sendPeerControl = async (peerId: string, payload: Record<string, unknown>) => {
    const peerConnection = connectionsRef.current.get(peerId)
    if (!peerConnection || !peerConnection.open) {
      return false
    }

    const encryptor = encryptorsRef.current.get(peerId)
    const isEncrypted = encryptor?.isReady() ?? false

    try {
      if (isEncrypted && encryptor) {
        const encrypted = await encryptJSON(encryptor, payload)
        peerConnection.send({ type: 'encrypted', encrypted })
      }
      else {
        peerConnection.send(payload)
      }
      return true
    }
    catch (error) {
      console.error('Failed to send peer control payload:', error)
      return false
    }
  }

  const removePeerTransferState = (peerId: string) => {
    peerDevicesRef.current.delete(peerId)
    discardIncomingFileOffersForPeer?.(peerId)

    for (const [responseKey, pendingResponse] of refs.pendingFileOfferResponsesRef.current.entries()) {
      if (!responseKey.startsWith(`${peerId}:`)) {
        continue
      }

      refs.pendingFileOfferResponsesRef.current.delete(responseKey)
      pendingResponse.resolve(false)
    }
  }

  const buildIncomingOfferSummary = (decryptedData: Extract<ReturnType<typeof validateIncomingTransferPayload>, { type: 'file-offer' }>) => {
    const summaryFiles = decryptedData.summary?.sampleFiles?.length
      ? decryptedData.summary.sampleFiles
      : [{
          name: decryptedData.name,
          size: decryptedData.size,
          type: decryptedData.fileType || '',
        }]
    const summary = buildIncomingTransferSummary({
      files: summaryFiles,
      declaredFileCount: decryptedData.summary?.fileCount,
      declaredTotalSize: decryptedData.summary?.totalSize,
    })
    const declaredRiskFlags = decryptedData.summary?.riskFlags ?? []
    const riskFlags = Array.from(new Set([
      ...summary.riskFlags,
      ...declaredRiskFlags,
    ]))

    return {
      ...summary,
      riskFlags,
      requiresSecondaryConfirmation:
        summary.requiresSecondaryConfirmation
        || decryptedData.summary?.requiresSecondaryConfirmation === true
        || riskFlags.includes('executable'),
      executableFileName: decryptedData.summary?.executableFileName ?? summary.executableFileName,
    }
  }

  const buildFallbackHistoryOffer = ({
    offerId,
    peerId,
    fileName,
    fileType,
    size,
  }: {
    offerId: string
    peerId: string
    fileName: string
    fileType: string
    size: number
  }): IncomingFileOffer => {
    const peerDevice = peerDevicesRef.current.get(peerId)

    return {
      offerId,
      peerId,
      deviceId: peerDevice?.deviceId ?? null,
      deviceName: peerDevice?.deviceName || '对方设备',
      fileName,
      fileType,
      size,
      fingerprint: encryptionFingerprintsRef.current.get(peerId) ?? null,
      requestedAt: Date.now(),
      summary: buildIncomingTransferSummary({
        files: [{ name: fileName, size, type: fileType }],
      }),
    }
  }

  return async (conn: any, isOutgoing = false) => {
    let connectionTimeout: NodeJS.Timeout | null = null
    let disconnectedTimer: NodeJS.Timeout | null = null
    // PeerJS does not await async data handlers, so preserve protocol order per connection.
    const processIncomingData = createSequentialAsyncProcessor()
    const disconnectedGracePeriodMs = Math.min(
      HEARTBEAT_TIMEOUT_MS,
      ICE_DISCONNECTED_GRACE_PERIOD_MS,
    )
    const releaseConnectionAttempt = () => {
      refs.connectingPeersRef.current.complete(conn.peer)
    }

    const existingConn = connectionsRef.current.get(conn.peer)
    if (existingConn && existingConn !== conn && existingConn.open) {
      releaseConnectionAttempt()
      try {
        conn.close()
      }
      catch {}
      return
    }

    if (isOutgoing) {
      connectionTimeout = setTimeout(() => {
        if (!conn.open) {
          releaseConnectionAttempt()
          conn.close()
          setError('连接超时，请确保两个设备能够互相访问（同一网络或允许 P2P 连接）')
        }
      }, CONNECTION_TIMEOUT)
    }

    // 生成密钥对用于密钥交换
    let keyPair: Awaited<ReturnType<typeof generateKeyPair>>
    try {
      keyPair = await generateKeyPair()
      keyExchangePendingRef.current.set(conn.peer, { keyPair, isOutgoing })
    }
    catch (error) {
      console.error('Failed to generate key pair:', error)
      releaseConnectionAttempt()
      const message = error instanceof Error ? error.message : '加密初始化失败'
      setError(message)
      return
    }

    // Monitor ICE state for connection recovery
    let monitorAttempts = 0
    const maxMonitorAttempts = 25

    const monitorIceState = () => {
      if (!conn || conn.destroyed || monitorAttempts >= maxMonitorAttempts) {
        return
      }

      const pc = conn.peerConnection as RTCPeerConnection | undefined
      if (pc) {
        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'failed') {
            if (connectionTimeout)
              clearTimeout(connectionTimeout)
            try {
              pc.restartIce()
            }
            catch {
              if (!conn.open && isOutgoing) {
                setError('连接失败，请确保两设备在同一网络或允许 P2P 连接')
              }
            }
          }
          else if (pc.iceConnectionState === 'disconnected') {
            if (disconnectedTimer) {
              clearTimeout(disconnectedTimer)
            }
            disconnectedTimer = setTimeout(() => {
              if (
                pc.iceConnectionState === 'disconnected'
                && !isPeerHealthy(conn.peer)
              ) {
                try {
                  pc.restartIce()
                }
                catch {}
              }
            }, disconnectedGracePeriodMs)
          }
          else if (disconnectedTimer) {
            clearTimeout(disconnectedTimer)
            disconnectedTimer = null
          }
        }
      }
      else {
        monitorAttempts++
        setTimeout(monitorIceState, 200)
      }
    }
    setTimeout(monitorIceState, 100)

    conn.on('open', async () => {
      if (connectionTimeout)
        clearTimeout(connectionTimeout)
      releaseConnectionAttempt()
      connectionsRef.current.set(conn.peer, conn)
      touchPeer(conn.peer)

      // 进行密钥交换
      try {
        const pending = keyExchangePendingRef.current.get(conn.peer)
        if (!pending) {
          console.error('Key exchange pending data not found')
          return
        }

        const publicKeyData = await exportPublicKey(pending.keyPair.publicKey)
        const publicKeyBase64 = arrayBufferToBase64(publicKeyData)

        if (pending.isOutgoing) {
          // 发起方：先发送公钥
          conn.send({ type: 'key-exchange', publicKey: publicKeyBase64 })
        }
      }
      catch (error) {
        console.error('Key exchange failed:', error)
        setError('密钥交换失败')
      }

      updatePeerCount()
      callbacks.handlePeerConnectedToScreenShare?.(conn.peer)

      if (!isOutgoing) {
        // 延迟广播，等待加密建立
        setTimeout(() => {
          broadcastToConnections({ type: 'peer-joined' }, conn.peer)
        }, 1000)
      }

      const detectType = async () => {
        const pc = conn.peerConnection as RTCPeerConnection | undefined
        if (pc && pc.connectionState === 'connected') {
          const info = await detectConnectionType(pc)
          setConnectionInfo(info)
        }
        else if (pc) {
          setTimeout(detectType, 1000)
        }
      }
      setTimeout(detectType, 500)
    })

    conn.on('close', () => {
      if (connectionTimeout)
        clearTimeout(connectionTimeout)
      if (disconnectedTimer)
        clearTimeout(disconnectedTimer)
      releaseConnectionAttempt()
      connectionsRef.current.delete(conn.peer)
      markBuffersPendingForPeer(conn.peer)
      encryptorsRef.current.delete(conn.peer)
      callbacks.setPeerEncryptionFingerprint?.(conn.peer, null)
      keyExchangePendingRef.current.delete(conn.peer)
      removePeerQuality(conn.peer)
      removePeerTransferState(conn.peer)

      updatePeerCount()

      if (connectionsRef.current.size === 0 && roomCode && refs.shouldReconnectRef.current && refs.attemptReconnectRef.current) {
        refs.attemptReconnectRef.current()
      }
    })

    conn.on('error', (err: unknown) => {
      console.error('Connection error:', err)
      if (connectionTimeout)
        clearTimeout(connectionTimeout)
      if (disconnectedTimer)
        clearTimeout(disconnectedTimer)
      releaseConnectionAttempt()
      connectionsRef.current.delete(conn.peer)
      markBuffersPendingForPeer(conn.peer)
      encryptorsRef.current.delete(conn.peer)
      callbacks.setPeerEncryptionFingerprint?.(conn.peer, null)
      keyExchangePendingRef.current.delete(conn.peer)
      removePeerQuality(conn.peer)
      removePeerTransferState(conn.peer)

      updatePeerCount()

      if (isOutgoing && connectionsRef.current.size === 0 && refs.shouldReconnectRef.current && refs.attemptReconnectRef.current) {
        refs.attemptReconnectRef.current()
      }
      else if (connectionsRef.current.size === 0) {
        setError('连接失败，正在尝试重连...')
      }
    })

    const handleIncomingData = async (data: unknown) => {
      const validatedData = validateIncomingRawPeerPayload(data)
      if (!validatedData) {
        console.warn(`Dropped invalid peer payload from ${conn.peer}`)
        return
      }

      // 处理密钥交换
      if (validatedData.type === 'key-exchange') {
        try {
          const pending = keyExchangePendingRef.current.get(conn.peer)
          if (!pending) {
            console.error('Key exchange pending data not found')
            return
          }

          const peerPublicKeyData = base64ToArrayBuffer(validatedData.publicKey)
          const peerPublicKey = await importPublicKey(peerPublicKeyData)

          // 计算共享密钥
          const sharedSecret = await deriveSharedSecret(pending.keyPair.privateKey, peerPublicKey)
          callbacks.setPeerEncryptionFingerprint?.(
            conn.peer,
            await getSessionFingerprint(sharedSecret),
          )

          // 创建加密器并派生密钥
          const encryptor = new SessionEncryptor()
          const role = pending.isOutgoing ? 'initiator' : 'responder'
          await encryptor.deriveKeys(sharedSecret, role)
          encryptorsRef.current.set(conn.peer, encryptor)

          // 如果是接收方，现在发送自己的公钥
          if (!pending.isOutgoing) {
            const publicKeyData = await exportPublicKey(pending.keyPair.publicKey)
            const publicKeyBase64 = arrayBufferToBase64(publicKeyData)
            conn.send({ type: 'key-exchange', publicKey: publicKeyBase64 })
          }

          // 清理待处理的密钥交换数据
          keyExchangePendingRef.current.delete(conn.peer)

          // 更新加密状态
          const allEncrypted = Array.from(encryptorsRef.current.values()).every(e => e.isReady())
          setIsEncrypted(allEncrypted && encryptorsRef.current.size > 0)

          const localDeviceProfile = getLocalDeviceProfile?.()
          if (localDeviceProfile) {
            await sendPeerControl(conn.peer, {
              type: 'device-intro',
              deviceId: localDeviceProfile.deviceId,
              deviceName: localDeviceProfile.deviceName,
            })
          }
        }
        catch (error) {
          console.error('Key exchange error:', error)
          setError('密钥交换失败')
        }
        return
      }

      // 获取加密器（如果已建立）
      const encryptor = encryptorsRef.current.get(conn.peer)
      const isEncrypted = encryptor?.isReady() ?? false

      // 入站门控：握手完成前/后，明文控制消息与明文文件块一律丢弃。
      // 合法对端在加密器就绪后只会发送 encrypted 信封、逐块加密的
      // file-chunk、key-exchange 与 ping/pong 心跳。
      const handshake: PeerHandshakeState = isEncrypted
        ? 'ready'
        : keyExchangePendingRef.current.has(conn.peer)
          ? 'pending'
          : 'unknown'
      if (!isInboundPeerPayloadAllowed(
        handshake,
        validatedData.type,
        validatedData.type === 'file-chunk' ? validatedData.encrypted : false,
      )) {
        console.warn(
          `Dropped unexpected plaintext peer payload (type=${validatedData.type}) from ${conn.peer} while handshake=${handshake}`,
        )
        return
      }

      // 处理文件块（简化后，文件块不加密 JSON，直接处理）
      if (validatedData.type === 'file-chunk') {
        // 协议校验已保证 itemId 为非空字符串，无需再按 peer 回退查找
        const bufferKey = validatedData.itemId
        const buffer = bufferKey ? fileBuffersRef.current.get(bufferKey) : undefined
        if (buffer) {
          const expectedOffset = buffer.received
          if (typeof validatedData.offset === 'number') {
            if (validatedData.offset < expectedOffset) {
              return
            }
            if (validatedData.offset > expectedOffset) {
              return
            }
          }

          let bytes: Uint8Array
          if (isEncrypted && validatedData.encrypted) {
            // 直接解密文件块（不再需要解密 JSON）
            try {
              if (!encryptor)
                return
              bytes = await decryptBytes(encryptor, readBinaryChunkPayload(validatedData.bytes))
            }
            catch (error) {
              console.error('File chunk decryption error:', error)
              return
            }
          }
          else {
            bytes = readBinaryChunkPayload(validatedData.bytes)
          }

          try {
            await buffer.storage.appendChunk(bytes)
          }
          catch (error) {
            console.error('Failed to persist file chunk:', error)
            updateItemProgress(buffer.localItemId, {
              status: 'error',
              speed: undefined,
              remainingTime: undefined,
            })
            void buffer.storage.abort()
            fileBuffersRef.current.delete(buffer.remoteItemId)
            recordReceiveHistory?.({
              offer: buffer.historyOffer,
              outcome: 'failed',
              failureReason: '写入文件片段失败',
            })
            return
          }

          buffer.received += bytes.length

          const now = Date.now()
          if (now - buffer.lastTime >= 500 || buffer.received >= buffer.size) {
            const timeDiff = (now - buffer.lastTime) / 1000
            const bytesDiff = buffer.received - buffer.lastBytes
            const instantSpeed = timeDiff > 0 ? Math.round(bytesDiff / timeDiff) : 0

            // EMA smoothing (alpha = 0.2)
            buffer.smoothedSpeed = buffer.smoothedSpeed === 0
              ? instantSpeed
              : Math.round(buffer.smoothedSpeed * 0.8 + instantSpeed * 0.2)

            const speed = buffer.smoothedSpeed
            const remainingBytes = buffer.size - buffer.received
            const remainingTime = speed > 0 ? Math.ceil(remainingBytes / speed) : undefined

            updateItemProgress(buffer.localItemId, {
              status: 'transferring',
              progress: Math.round((buffer.received / buffer.size) * 100),
              transferredBytes: buffer.received,
              speed,
              remainingTime,
            })

            recordBandwidth(conn.peer, speed)

            buffer.lastTime = now
            buffer.lastBytes = buffer.received
          }
        }
        return
      }

      // 解密其他类型的数据（文本、元数据等）- 这些仍然使用 JSON 加密
      let decryptedData = validatedData.type === 'encrypted'
        ? null
        : validateIncomingTransferPayload(validatedData)
      if (validatedData.type === 'encrypted') {
        try {
          if (!encryptor)
            return
          decryptedData = validateIncomingTransferPayload(
            await decryptJSON(encryptor, validatedData.encrypted),
          )
        }
        catch (error) {
          console.error('Decryption error:', error)
          return
        }
      }

      if (!decryptedData) {
        console.warn(`Dropped invalid decrypted payload from ${conn.peer}`)
        return
      }

      if (decryptedData.type === 'device-intro') {
        peerDevicesRef.current.set(conn.peer, {
          deviceId: decryptedData.deviceId,
          deviceName: decryptedData.deviceName,
        })
      }
      else if (decryptedData.type === 'file-offer-response') {
        resolvePendingFileOfferResponse?.(conn.peer, decryptedData.offerId, decryptedData.accepted)
      }
      else if (decryptedData.type === 'file-offer') {
        // 单文件上限：超限直接拒绝，不进入待处理队列
        if (decryptedData.size > MAX_FILE_SIZE_BYTES) {
          await sendPeerControl(conn.peer, {
            type: 'file-offer-response',
            offerId: decryptedData.offerId,
            accepted: false,
          })
          addSystemMessage(
            `已拒绝文件请求：文件过大（超过 ${MAX_FILE_SIZE_BYTES / 1024 / 1024 / 1024}GB 上限）`,
          )
          return
        }

        const peerDevice = peerDevicesRef.current.get(conn.peer)
        const trustedDeviceId = peerDevice?.deviceId
        const summary = buildIncomingOfferSummary(decryptedData)
        const offer: IncomingFileOffer = {
          offerId: decryptedData.offerId,
          peerId: conn.peer,
          deviceId: trustedDeviceId ?? null,
          deviceName: peerDevice?.deviceName || '对方设备',
          fileName: decryptedData.name,
          fileType: decryptedData.fileType || '',
          size: decryptedData.size,
          fingerprint: encryptionFingerprintsRef.current.get(conn.peer) ?? null,
          requestedAt: Date.now(),
          summary,
        }

        if (
          trustedDeviceId
          && trustedDevicesRef.current.has(trustedDeviceId)
          && !offer.summary.requiresSecondaryConfirmation
        ) {
          const autoAccepted = await sendPeerControl(conn.peer, {
            type: 'file-offer-response',
            offerId: decryptedData.offerId,
            accepted: true,
          })

          if (autoAccepted) {
            acceptedIncomingFileOffersRef.current.set(decryptedData.offerId, offer)
            approvedIncomingFileOffersRef.current.set(decryptedData.offerId, conn.peer)
            rememberTrustedPeer?.({
              deviceId: trustedDeviceId,
              deviceName: peerDevice?.deviceName || '对方设备',
            })
            addSystemMessage(`已自动接受来自 ${offer.deviceName} 的文件请求`)
          }
          else {
            pendingIncomingFileOffersRef.current.set(decryptedData.offerId, offer)
            queueIncomingFileOffer?.(offer)
          }
        }
        else {
          pendingIncomingFileOffersRef.current.set(decryptedData.offerId, offer)
          queueIncomingFileOffer?.(offer)
        }
      }
      else if (decryptedData.type === 'text') {
        addItem({
          type: 'text',
          content: decryptedData.content,
          direction: 'received',
        })
        notifyReceived('text')
      }
      else if (decryptedData.type === 'file-start') {
        const remoteItemId = decryptedData.itemId || ''
        const hasRemoteId = typeof remoteItemId === 'string' && remoteItemId.length > 0
        const existing = hasRemoteId ? fileBuffersRef.current.get(remoteItemId) : undefined
        const isResume = Boolean(decryptedData.resume) && Boolean(existing)

        if (
          hasRemoteId
          && !isResume
          && approvedIncomingFileOffersRef.current.get(remoteItemId) !== conn.peer
        ) {
          await sendPeerControl(conn.peer, {
            type: 'file-offer-response',
            offerId: remoteItemId,
            accepted: false,
          })
          return
        }

        if (isResume && existing) {
          existing.peerId = conn.peer
          existing.lastTime = Date.now()
          existing.lastBytes = existing.received
          existing.smoothedSpeed = 0
          fileBuffersRef.current.set(existing.remoteItemId, existing)

          updateItemProgress(existing.localItemId, {
            status: 'transferring',
            progress: Math.round((existing.received / existing.size) * 100),
            transferredBytes: existing.received,
            speed: undefined,
            remainingTime: undefined,
          })
        }
        else {
          const localItemId = addItemWithId({
            type: 'file',
            name: decryptedData.name,
            content: '',
            size: decryptedData.size,
            direction: 'received',
            status: 'transferring',
            progress: 0,
            transferredBytes: 0,
          })

          const newRemoteItemId = hasRemoteId ? remoteItemId : localItemId
          const historyOffer = (
            (hasRemoteId ? acceptedIncomingFileOffersRef.current.get(remoteItemId) : undefined)
            ?? (hasRemoteId ? pendingIncomingFileOffersRef.current.get(remoteItemId) : undefined)
            ?? buildFallbackHistoryOffer({
              offerId: newRemoteItemId,
              peerId: conn.peer,
              fileName: decryptedData.name,
              fileType: decryptedData.fileType || '',
              size: decryptedData.size,
            })
          )

          if (hasRemoteId) {
            acceptedIncomingFileOffersRef.current.delete(remoteItemId)
            approvedIncomingFileOffersRef.current.delete(remoteItemId)
            pendingIncomingFileOffersRef.current.delete(remoteItemId)
          }

          let storage: ReceiveStorageHandle

          // 二次校验：offer 阶段已拦过一次，这里防绕过；同时预检本地配额
          if (decryptedData.size > MAX_FILE_SIZE_BYTES) {
            updateItemProgress(localItemId, {
              status: 'error',
              speed: undefined,
              remainingTime: undefined,
            })
            recordReceiveHistory?.({
              offer: historyOffer,
              outcome: 'failed',
              failureReason: '文件超过大小上限',
            })
            return
          }

          if (!(await hasStorageQuotaFor(decryptedData.size))) {
            updateItemProgress(localItemId, {
              status: 'error',
              speed: undefined,
              remainingTime: undefined,
            })
            recordReceiveHistory?.({
              offer: historyOffer,
              outcome: 'failed',
              failureReason: '本地存储空间不足',
            })
            return
          }

          try {
            storage = await createReceiveStorage({
              fileName: decryptedData.name,
              mimeType: decryptedData.fileType || '',
              transferId: newRemoteItemId,
            })
          }
          catch (error) {
            console.error('Failed to create receive storage:', error)
            updateItemProgress(localItemId, {
              status: 'error',
              speed: undefined,
              remainingTime: undefined,
            })
            recordReceiveHistory?.({
              offer: historyOffer,
              outcome: 'failed',
              failureReason: '存储初始化失败',
            })
            return
          }

          fileBuffersRef.current.set(newRemoteItemId, {
            peerId: conn.peer,
            name: decryptedData.name,
            size: decryptedData.size,
            type: decryptedData.fileType || '',
            received: 0,
            localItemId,
            remoteItemId: newRemoteItemId,
            lastTime: Date.now(),
            lastBytes: 0,
            smoothedSpeed: 0,
            storage,
            historyOffer,
          })
        }
      }
      else if (decryptedData.type === 'file-end') {
        const bufferKey = decryptedData.itemId || findBufferKeyByPeer(conn.peer)
        const buffer = bufferKey ? fileBuffersRef.current.get(bufferKey) : undefined
        if (decryptedData.itemId) {
          acceptedIncomingFileOffersRef.current.delete(decryptedData.itemId)
          approvedIncomingFileOffersRef.current.delete(decryptedData.itemId)
          pendingIncomingFileOffersRef.current.delete(decryptedData.itemId)
        }
        if (buffer) {
          if (buffer.received < buffer.size) {
            updateItemProgress(buffer.localItemId, {
              status: 'error',
              speed: undefined,
              remainingTime: undefined,
            })
            void buffer.storage.abort()
            fileBuffersRef.current.delete(buffer.remoteItemId)
            recordReceiveHistory?.({
              offer: buffer.historyOffer,
              outcome: 'failed',
              failureReason: '接收未完成即结束',
            })
            return
          }

          let finalized
          try {
            finalized = await buffer.storage.finalize()
          }
          catch (error) {
            console.error('Failed to finalize receive storage:', error)
            updateItemProgress(buffer.localItemId, {
              status: 'error',
              speed: undefined,
              remainingTime: undefined,
            })
            void buffer.storage.abort()
            fileBuffersRef.current.delete(buffer.remoteItemId)
            recordReceiveHistory?.({
              offer: buffer.historyOffer,
              outcome: 'failed',
              failureReason: '接收完成后保存失败',
            })
            return
          }

          const url = createTrackedBlobUrl(finalized.file, finalized.cleanup)

          updateItemProgress(buffer.localItemId, {
            content: url,
            status: 'completed',
            progress: 100,
            transferredBytes: buffer.size,
            speed: undefined,
            remainingTime: undefined,
          })

          const fileType = buffer.type.startsWith('image/') || IMAGE_FILE_NAME_REGEX.test(buffer.name) ? 'image' : 'file'
          notifyReceived(fileType, buffer.name)

          fileBuffersRef.current.delete(buffer.remoteItemId)
          recordReceiveHistory?.({
            offer: buffer.historyOffer,
            outcome: 'completed',
            failureReason: null,
          })
        }
      }
      else if (decryptedData.type === 'room-dissolved') {
        callbacks.addSystemMessage('房主已解散房间')
        callbacks.setConnectionStatus('dissolved')
        callbacks.setErrorMessage('房间已解散')
        cleanupAll()
        callbacks.setPeerCount(0)
      }
      else if (decryptedData.type === 'ping') {
        try {
          const pongData = { type: 'pong', id: decryptedData.id }
          if (isEncrypted) {
            if (!encryptor)
              return
            const encrypted = await encryptJSON(encryptor, pongData)
            conn.send({ type: 'encrypted', encrypted })
          }
          else {
            conn.send(pongData)
          }
        }
        catch (err) {
          console.error('Failed to send pong:', err)
        }
      }
      else if (decryptedData.type === 'pong') {
        handlePong(conn.peer, decryptedData.id)
      }
      else if (decryptedData.type === 'file-cancel') {
        const bufferKey = decryptedData.itemId || findBufferKeyByPeer(conn.peer)
        const buffer = bufferKey ? fileBuffersRef.current.get(bufferKey) : undefined
        if (decryptedData.itemId) {
          acceptedIncomingFileOffersRef.current.delete(decryptedData.itemId)
          approvedIncomingFileOffersRef.current.delete(decryptedData.itemId)
          pendingIncomingFileOffersRef.current.delete(decryptedData.itemId)
        }
        if (buffer) {
          updateItemProgress(buffer.localItemId, {
            status: 'cancelled',
            speed: undefined,
          })

          void buffer.storage.abort()
          fileBuffersRef.current.delete(buffer.remoteItemId)
          recordReceiveHistory?.({
            offer: buffer.historyOffer,
            outcome: 'cancelled',
            failureReason: null,
          })
        }

        if (decryptedData.itemId) {
          refs.cancelledTransfersRef.current.add(decryptedData.itemId)
        }
      }
    }

    conn.on('data', (data: unknown) => {
      touchPeer(conn.peer)

      void processIncomingData(async () => {
        await handleIncomingData(data)
      }).catch((error) => {
        console.error('Failed to process incoming data:', error)
      })
    })
  }
}

export function createAttemptReconnect(
  refs: ConnectionRefs,
  callbacks: ConnectionCallbacks,
  roomCode: string | null,
  connectionStatus: string,
  isHost: boolean,
) {
  return () => {
    if (!roomCode || !refs.shouldReconnectRef.current || connectionStatus === 'dissolved') {
      return
    }

    // File pickers and other app switches can temporarily background the page on mobile.
    const reconnectSuppressed = Date.now() < refs.suppressReconnectUntilRef.current
    const documentHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    if (reconnectSuppressed || documentHidden) {
      refs.pendingReconnectRef.current = true
      return
    }

    refs.pendingReconnectRef.current = false

    // Avoid stacking multiple reconnect timers from close/error/visibility events.
    if (refs.reconnectTimeoutRef.current) {
      return
    }

    // Let the browser online event trigger the next reconnect attempt.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      callbacks.setConnectionStatus('reconnecting')
      callbacks.setErrorMessage('Network is offline. Waiting to reconnect...')
      return
    }

    if (refs.reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      callbacks.setConnectionStatus('error')
      callbacks.setErrorMessage('重连失败，请手动重新加入房间')
      callbacks.addSystemMessage('自动重连失败，连接已断开')
      return
    }

    refs.reconnectAttemptsRef.current += 1
    const baseDelay = Math.min(1000 * 2 ** (refs.reconnectAttemptsRef.current - 1), 10000)
    const jitter = Math.floor(Math.random() * 500)
    const delay = baseDelay + jitter

    callbacks.setConnectionStatus('reconnecting')
    callbacks.setErrorMessage(`正在尝试重新连接... (${refs.reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`)

    refs.reconnectTimeoutRef.current = setTimeout(() => {
      refs.reconnectTimeoutRef.current = null
      if (!refs.shouldReconnectRef.current)
        return
      if (refs.connectionsRef.current.size > 0)
        return

      // 简化：只在第一次重连时显示消息
      if (refs.reconnectAttemptsRef.current === 1) {
        callbacks.addSystemMessage('正在尝试重新连接...')
      }

      if (isHost) {
        if (refs.peerRef.current?.disconnected) {
          try {
            refs.peerRef.current.reconnect()
          }
          catch {}
        }
        callbacks.setConnectionStatus('connecting')
      }
      else {
        const hostPeerId = PEER_PREFIX + roomCode
        if (refs.peerRef.current && !refs.peerRef.current.destroyed) {
          if (refs.connectionsRef.current.has(hostPeerId) || refs.connectingPeersRef.current.has(hostPeerId)) {
            return
          }

          if (!refs.connectingPeersRef.current.begin(hostPeerId)) {
            return
          }

          try {
            const conn = refs.peerRef.current.connect(hostPeerId, { reliable: true })
            if (conn && refs.setupConnectionRef.current) {
              refs.setupConnectionRef.current(conn, true)
            }
            else {
              refs.connectingPeersRef.current.complete(hostPeerId)
              createAttemptReconnect(refs, callbacks, roomCode, connectionStatus, isHost)()
            }
          }
          catch {
            refs.connectingPeersRef.current.complete(hostPeerId)
            createAttemptReconnect(refs, callbacks, roomCode, connectionStatus, isHost)()
          }
        }
        else {
          if (refs.joinRoomRef.current) {
            refs.joinRoomRef.current(roomCode)
          }
        }
      }
    }, delay)
  }
}
