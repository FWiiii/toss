/**
 * 连接管理模块
 * 处理 WebRTC 连接建立、密钥交换、重连等逻辑
 */

import { base64ToUint8 } from "./utils"
import { 
  PEER_PREFIX, 
  CONNECTION_TIMEOUT,
  MAX_RECONNECT_ATTEMPTS,
  detectConnectionType 
} from "./peer-config"
import {
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedSecret,
  SessionEncryptor,
  encryptJSON,
  decryptJSON,
  encryptBytes,
  decryptBytes,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from "./crypto"
import type { ConnectionInfo } from "./types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConnectionRefs = {
  connectionsRef: React.MutableRefObject<Map<string, any>>
  encryptorsRef: React.MutableRefObject<Map<string, SessionEncryptor>>
  keyExchangePendingRef: React.MutableRefObject<Map<string, { 
    keyPair: Awaited<ReturnType<typeof generateKeyPair>>
    isOutgoing: boolean
  }>>
  fileBuffersRef: React.MutableRefObject<Map<string, { 
    peerId: string
    name: string
    size: number
    chunks: Uint8Array[]
    received: number
    localItemId: string
    remoteItemId: string
    lastTime: number
    lastBytes: number 
    smoothedSpeed: number
  }>>
  reconnectAttemptsRef: React.MutableRefObject<number>
  reconnectTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
  shouldReconnectRef: React.MutableRefObject<boolean>
  peerRef: React.MutableRefObject<any>
  setupConnectionRef: React.MutableRefObject<((conn: any, isOutgoing?: boolean) => void) | null>
  attemptReconnectRef: React.MutableRefObject<(() => void) | null>
  joinRoomRef: React.MutableRefObject<((code: string) => Promise<void>) | null>
  cancelledTransfersRef: React.MutableRefObject<Set<string>>
}

export type ConnectionCallbacks = {
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
  createTrackedBlobUrl: (blob: Blob) => string
  broadcastToConnections: (data: any, excludePeer?: string) => Promise<void>
  cleanupAll: () => void
  handlePong: (id: string) => void
  recordBandwidth: (speed: number) => void
  notifyReceived: (type: string, name?: string) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSetupConnection(
  refs: ConnectionRefs,
  callbacks: ConnectionCallbacks,
  roomCode: string | null
) {
  const {
    connectionsRef,
    encryptorsRef,
    keyExchangePendingRef,
    fileBuffersRef,
  } = refs

  const {
    setError,
    setConnectionStatus,
    setConnectionInfo,
    setIsEncrypted,
    updatePeerCount,
    addItem,
    addItemWithId,
    updateItemProgress,
    createTrackedBlobUrl,
    broadcastToConnections,
    cleanupAll,
    handlePong,
    recordBandwidth,
    notifyReceived,
  } = callbacks

  const removeBuffersForPeer = (peerId: string) => {
    for (const [bufferKey, buffer] of fileBuffersRef.current.entries()) {
      if (buffer.peerId === peerId) {
        fileBuffersRef.current.delete(bufferKey)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (conn: any, isOutgoing = false) => {
    let connectionTimeout: NodeJS.Timeout | null = null
    let disconnectedTimer: NodeJS.Timeout | null = null
    
    if (isOutgoing) {
      connectionTimeout = setTimeout(() => {
        if (!conn.open) {
          conn.close()
          setError("连接超时，请确保两个设备能够互相访问（同一网络或允许 P2P 连接）")
        }
      }, CONNECTION_TIMEOUT)
    }

    // 生成密钥对用于密钥交换
    let keyPair: Awaited<ReturnType<typeof generateKeyPair>>
    try {
      keyPair = await generateKeyPair()
      keyExchangePendingRef.current.set(conn.peer, { keyPair, isOutgoing })
    } catch (error) {
      console.error("Failed to generate key pair:", error)
      setError("加密初始化失败")
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
          if (pc.iceConnectionState === "failed") {
            if (connectionTimeout) clearTimeout(connectionTimeout)
            try {
              pc.restartIce()
            } catch {
              if (!conn.open && isOutgoing) {
                setError("连接失败，请确保两设备在同一网络或允许 P2P 连接")
              }
            }
          } else if (pc.iceConnectionState === "disconnected") {
            if (disconnectedTimer) {
              clearTimeout(disconnectedTimer)
            }
            disconnectedTimer = setTimeout(() => {
              if (pc.iceConnectionState === "disconnected") {
                try {
                  pc.restartIce()
                } catch {}
              }
            }, 1000)
          } else if (disconnectedTimer) {
            clearTimeout(disconnectedTimer)
            disconnectedTimer = null
          }
        }
      } else {
        monitorAttempts++
        setTimeout(monitorIceState, 200)
      }
    }
    setTimeout(monitorIceState, 100)

    conn.on("open", async () => {
      if (connectionTimeout) clearTimeout(connectionTimeout)
      connectionsRef.current.set(conn.peer, conn)
      
      // 进行密钥交换
      try {
        const pending = keyExchangePendingRef.current.get(conn.peer)
        if (!pending) {
          console.error("Key exchange pending data not found")
          return
        }

        const publicKeyData = await exportPublicKey(pending.keyPair.publicKey)
        const publicKeyBase64 = arrayBufferToBase64(publicKeyData)

        if (pending.isOutgoing) {
          // 发起方：先发送公钥
          conn.send({ type: "key-exchange", publicKey: publicKeyBase64 })
        }
      } catch (error) {
        console.error("Key exchange failed:", error)
        setError("密钥交换失败")
      }
      
      updatePeerCount()
      
      if (!isOutgoing) {
        // 延迟广播，等待加密建立
        setTimeout(() => {
          broadcastToConnections({ type: "peer-joined" }, conn.peer)
        }, 1000)
      }
      
      const detectType = async () => {
        const pc = conn.peerConnection as RTCPeerConnection | undefined
        if (pc && pc.connectionState === "connected") {
          const info = await detectConnectionType(pc)
          setConnectionInfo(info)
        } else if (pc) {
          setTimeout(detectType, 1000)
        }
      }
      setTimeout(detectType, 500)
    })

    conn.on("close", () => {
      if (connectionTimeout) clearTimeout(connectionTimeout)
      if (disconnectedTimer) clearTimeout(disconnectedTimer)
      connectionsRef.current.delete(conn.peer)
      removeBuffersForPeer(conn.peer)
      encryptorsRef.current.delete(conn.peer)
      keyExchangePendingRef.current.delete(conn.peer)
      
      updatePeerCount()
      
      if (connectionsRef.current.size === 0 && roomCode && refs.shouldReconnectRef.current && refs.attemptReconnectRef.current) {
        refs.attemptReconnectRef.current()
      }
    })

    conn.on("error", (err: unknown) => {
      console.error("Connection error:", err)
      if (connectionTimeout) clearTimeout(connectionTimeout)
      if (disconnectedTimer) clearTimeout(disconnectedTimer)
      connectionsRef.current.delete(conn.peer)
      removeBuffersForPeer(conn.peer)
      encryptorsRef.current.delete(conn.peer)
      keyExchangePendingRef.current.delete(conn.peer)
      
      updatePeerCount()
      
      if (isOutgoing && connectionsRef.current.size === 0 && refs.shouldReconnectRef.current && refs.attemptReconnectRef.current) {
        refs.attemptReconnectRef.current()
      } else if (connectionsRef.current.size === 0) {
        setError("连接失败，正在尝试重连...")
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conn.on("data", async (data: any) => {
      // 处理密钥交换
      if (data.type === "key-exchange") {
        try {
          const pending = keyExchangePendingRef.current.get(conn.peer)
          if (!pending) {
            console.error("Key exchange pending data not found")
            return
          }

          const peerPublicKeyData = base64ToArrayBuffer(data.publicKey)
          const peerPublicKey = await importPublicKey(peerPublicKeyData)

          // 计算共享密钥
          const sharedSecret = await deriveSharedSecret(pending.keyPair.privateKey, peerPublicKey)

          // 创建加密器并派生密钥
          const encryptor = new SessionEncryptor()
          const role = pending.isOutgoing ? "initiator" : "responder"
          await encryptor.deriveKeys(sharedSecret, role)
          encryptorsRef.current.set(conn.peer, encryptor)

          // 如果是接收方，现在发送自己的公钥
          if (!pending.isOutgoing) {
            const publicKeyData = await exportPublicKey(pending.keyPair.publicKey)
            const publicKeyBase64 = arrayBufferToBase64(publicKeyData)
            conn.send({ type: "key-exchange", publicKey: publicKeyBase64 })
          }

          // 清理待处理的密钥交换数据
          keyExchangePendingRef.current.delete(conn.peer)
          
          // 更新加密状态
          const allEncrypted = Array.from(encryptorsRef.current.values()).every(e => e.isReady())
          setIsEncrypted(allEncrypted && encryptorsRef.current.size > 0)
        } catch (error) {
          console.error("Key exchange error:", error)
          setError("密钥交换失败")
        }
        return
      }

      // 获取加密器（如果已建立）
      const encryptor = encryptorsRef.current.get(conn.peer)
      const isEncrypted = encryptor?.isReady() ?? false

      // 处理文件块（简化后，文件块不加密 JSON，直接处理）
      if (data.type === "file-chunk") {
        const bufferKey = data.itemId ?? findBufferKeyByPeer(conn.peer)
        const buffer = bufferKey ? fileBuffersRef.current.get(bufferKey) : undefined
        if (buffer) {
          let bytes: Uint8Array
          if (isEncrypted && data.encrypted) {
            // 直接解密文件块（不再需要解密 JSON）
            try {
              bytes = await decryptBytes(encryptor!, data.encrypted)
            } catch (error) {
              console.error("File chunk decryption error:", error)
              return
            }
          } else {
            // 未加密的文件块
            bytes = base64ToUint8(data.data)
          }
          buffer.chunks.push(bytes)
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
              progress: Math.round((buffer.received / buffer.size) * 100),
              transferredBytes: buffer.received,
              speed,
              remainingTime,
            })
            
            recordBandwidth(speed)
            
            buffer.lastTime = now
            buffer.lastBytes = buffer.received
          }
        }
        return
      }

      // 解密其他类型的数据（文本、元数据等）- 这些仍然使用 JSON 加密
      let decryptedData: any = data
      if (isEncrypted && data.encrypted) {
        try {
          decryptedData = await decryptJSON(encryptor, data.encrypted)
        } catch (error) {
          console.error("Decryption error:", error)
          return
        }
      }

      if (decryptedData.type === "text") {
        addItem({
          type: "text",
          content: decryptedData.content,
          direction: "received",
        })
        notifyReceived("text")
      } else if (decryptedData.type === "file-start") {
        const localItemId = addItemWithId({
          type: "file",
          name: decryptedData.name,
          content: "",
          size: decryptedData.size,
          direction: "received",
          status: "transferring",
          progress: 0,
          transferredBytes: 0,
        })

        const remoteItemId = decryptedData.itemId || localItemId
        fileBuffersRef.current.set(remoteItemId, {
          peerId: conn.peer,
          name: decryptedData.name,
          size: decryptedData.size,
          chunks: [],
          received: 0,
          localItemId,
          remoteItemId,
          lastTime: Date.now(),
          lastBytes: 0,
          smoothedSpeed: 0,
        })
      } else if (decryptedData.type === "file-end") {
        const bufferKey = decryptedData.itemId || findBufferKeyByPeer(conn.peer)
        const buffer = bufferKey ? fileBuffersRef.current.get(bufferKey) : undefined
        if (buffer) {
          const blob = new Blob(buffer.chunks as unknown as BlobPart[])
          const url = createTrackedBlobUrl(blob)
          
          updateItemProgress(buffer.localItemId, {
            content: url,
            status: "completed",
            progress: 100,
            transferredBytes: buffer.size,
            speed: undefined,
            remainingTime: undefined,
          })
          
          const fileType = buffer.name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ? "image" : "file"
          notifyReceived(fileType, buffer.name)
          
          buffer.chunks = []
          fileBuffersRef.current.delete(buffer.remoteItemId)
        }
      } else if (decryptedData.type === "room-dissolved") {
        callbacks.addSystemMessage("房主已解散房间")
        callbacks.setConnectionStatus("dissolved")
        callbacks.setErrorMessage("房间已解散")
        cleanupAll()
        callbacks.setPeerCount(0)
      } else if (decryptedData.type === "ping") {
        try {
          const pongData = { type: "pong", id: decryptedData.id }
          if (isEncrypted) {
            const encrypted = await encryptJSON(encryptor!, pongData)
            conn.send({ type: "encrypted", encrypted })
          } else {
            conn.send(pongData)
          }
        } catch (err) {
          console.error("Failed to send pong:", err)
        }
      } else if (decryptedData.type === "pong") {
        handlePong(decryptedData.id)
      } else if (decryptedData.type === "file-cancel") {
        const bufferKey = decryptedData.itemId || findBufferKeyByPeer(conn.peer)
        const buffer = bufferKey ? fileBuffersRef.current.get(bufferKey) : undefined
        if (buffer) {
          updateItemProgress(buffer.localItemId, {
            status: "cancelled",
            speed: undefined,
          })
          
          buffer.chunks = []
          fileBuffersRef.current.delete(buffer.remoteItemId)
        }
        
        if (decryptedData.itemId) {
          refs.cancelledTransfersRef.current.add(decryptedData.itemId)
        }
      }
    })
  }
}

export function createAttemptReconnect(
  refs: ConnectionRefs,
  callbacks: ConnectionCallbacks,
  roomCode: string | null,
  connectionStatus: string,
  isHost: boolean
) {
  return () => {
    if (!roomCode || !refs.shouldReconnectRef.current || connectionStatus === "dissolved") {
      return
    }

    if (refs.reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      callbacks.setConnectionStatus("error")
      callbacks.setErrorMessage("重连失败，请手动重新加入房间")
      callbacks.addSystemMessage("自动重连失败，连接已断开")
      return
    }

    refs.reconnectAttemptsRef.current += 1
    const delay = Math.min(1000 * Math.pow(2, refs.reconnectAttemptsRef.current - 1), 10000)
    
    callbacks.setConnectionStatus("reconnecting")
    callbacks.setErrorMessage(`正在尝试重新连接... (${refs.reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`)
    
    refs.reconnectTimeoutRef.current = setTimeout(() => {
      if (!refs.shouldReconnectRef.current) return
      
      // 简化：只在第一次重连时显示消息
      if (refs.reconnectAttemptsRef.current === 1) {
        callbacks.addSystemMessage("正在尝试重新连接...")
      }
      
      if (isHost) {
        callbacks.setConnectionStatus("connecting")
      } else {
        const hostPeerId = PEER_PREFIX + roomCode
        if (refs.peerRef.current && !refs.peerRef.current.destroyed) {
          try {
            const conn = refs.peerRef.current.connect(hostPeerId, { reliable: true })
            if (conn && refs.setupConnectionRef.current) {
              refs.setupConnectionRef.current(conn, true)
            } else {
              createAttemptReconnect(refs, callbacks, roomCode, connectionStatus, isHost)()
            }
          } catch {
            createAttemptReconnect(refs, callbacks, roomCode, connectionStatus, isHost)()
          }
        } else {
          if (refs.joinRoomRef.current) {
            refs.joinRoomRef.current(roomCode)
          }
        }
      }
    }, delay)
  }
}
