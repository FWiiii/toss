"use client"

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react"
import type { TransferItem, ConnectionStatus, ConnectionType, ConnectionInfo, ConnectionQuality, EncryptionPerformance } from "./types"
import { useNotification } from "@/hooks/use-notification"
import { useTransferItems } from "@/hooks/use-transfer-items"
import { useConnectionQuality } from "@/hooks/use-connection-quality"
import { SessionEncryptor, generateKeyPair } from "./crypto"
import { PEER_OPTIONS } from "./peer-config"
import { createSetupConnection, createAttemptReconnect, type ConnectionRefs, type ConnectionCallbacks } from "./transfer-connection"
import { createRoomManagement, type RoomCallbacks } from "./transfer-room"
import { createDataTransfer, type DataTransferCallbacks } from "./transfer-data"

export type { TransferItem, ConnectionStatus, ConnectionType, ConnectionInfo, ConnectionQuality, EncryptionPerformance }

type TransferContextType = {
  roomCode: string | null
  connectionStatus: ConnectionStatus
  connectionInfo: ConnectionInfo
  connectionQuality: ConnectionQuality
  errorMessage: string | null
  items: TransferItem[]
  createRoom: () => void
  joinRoom: (code: string) => void
  connectToPeer: (peerId: string) => void
  leaveRoom: () => void
  sendText: (text: string) => void
  sendFile: (file: File) => Promise<void>
  cancelTransfer: (itemId: string) => void
  clearHistory: () => void
  peerCount: number
  isHost: boolean
  isCreatingRoom: boolean
  isJoiningRoom: boolean
  sendingCount: number
  isEncrypted: boolean
  selfPeerId: string | null
  notificationSettings: {
    soundEnabled: boolean
    browserNotificationEnabled: boolean
    vibrationEnabled: boolean
  }
  notificationPermission: NotificationPermission
  updateNotificationSettings: (settings: Partial<{
    soundEnabled: boolean
    browserNotificationEnabled: boolean
    vibrationEnabled: boolean
  }>) => void
  requestNotificationPermission: () => Promise<NotificationPermission>
  testNotification: () => void
  encryptionPerformance: EncryptionPerformance | null
  getEncryptionPerformance: () => EncryptionPerformance | null
}

const TransferContext = createContext<TransferContextType | null>(null)

export function useTransfer() {
  const context = useContext(TransferContext)
  if (!context) {
    throw new Error("useTransfer must be used within TransferProvider")
  }
  return context
}

export function TransferProvider({ children }: { children: React.ReactNode }) {
  // ============ Core State ============
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({ type: "unknown" })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [peerCount, setPeerCount] = useState(0)
  const [isHost, setIsHost] = useState(false)
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [isJoiningRoom, setIsJoiningRoom] = useState(false)
  const [sendingCount, setSendingCount] = useState(0)
  const [isEncrypted, setIsEncrypted] = useState(false)
  const [encryptionPerformance, setEncryptionPerformance] = useState<EncryptionPerformance | null>(null)
  const [selfPeerId, setSelfPeerId] = useState<string | null>(null)
  
  // ============ Custom Hooks ============
  const {
    settings: notificationSettings,
    updateSettings: updateNotificationSettings,
    notificationPermission,
    requestNotificationPermission,
    notifyReceived,
    testNotification,
  } = useNotification()
  
  const {
    items,
    addItem,
    addItemWithId,
    addSystemMessage,
    updateItemProgress,
    clearHistory,
    createTrackedBlobUrl,
    cleanup: cleanupItems,
  } = useTransferItems()
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connectionsRef = useRef<Map<string, any>>(new Map())
  
  const {
    connectionQuality,
    startQualityMonitoring,
    stopQualityMonitoring,
    handlePong,
    recordBandwidth,
    cleanup: cleanupQuality,
  } = useConnectionQuality(connectionsRef)
  
  // ============ Refs ============
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peerRef = useRef<any>(null)
  const fileBuffersRef = useRef<Map<string, { 
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
  }>>(new Map())
  
  // 加密相关 refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encryptorsRef = useRef<Map<string, SessionEncryptor>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keyExchangePendingRef = useRef<Map<string, { 
    keyPair: Awaited<ReturnType<typeof generateKeyPair>>
    isOutgoing: boolean
  }>>(new Map())
  
  // Reconnection state
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const shouldReconnectRef = useRef(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setupConnectionRef = useRef<((conn: any, isOutgoing?: boolean) => void) | null>(null)
  const attemptReconnectRef = useRef<(() => void) | null>(null)
  const joinRoomRef = useRef<((code: string) => Promise<void>) | null>(null)
  const startQualityMonitoringRef = useRef<(() => void) | null>(null)
  const stopQualityMonitoringRef = useRef<(() => void) | null>(null)
  
  // Transfer cancellation tracking
  const cancelledTransfersRef = useRef<Set<string>>(new Set())

  // Store quality monitoring functions in refs
  useEffect(() => {
    startQualityMonitoringRef.current = startQualityMonitoring
    stopQualityMonitoringRef.current = stopQualityMonitoring
  }, [startQualityMonitoring, stopQualityMonitoring])

  // ============ Utility Functions ============
  const setError = useCallback((message: string) => {
    setConnectionStatus("error")
    setErrorMessage(message)
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeClose = (conn: any) => {
    try { conn.close() } catch {}
  }

  const destroyPeer = useCallback(() => {
    if (peerRef.current) {
      try {
        peerRef.current.disconnect()
        peerRef.current.destroy()
      } catch {}
      peerRef.current = null
    }
  }, [])

  const cleanupConnections = useCallback(() => {
    connectionsRef.current.forEach(safeClose)
    connectionsRef.current.clear()
    fileBuffersRef.current.clear()
    encryptorsRef.current.clear()
    keyExchangePendingRef.current.clear()
  }, [])

  const cleanupAll = useCallback(() => {
    cleanupConnections()
    destroyPeer()
  }, [cleanupConnections, destroyPeer])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broadcastToConnections = useCallback(async (data: any, excludePeer?: string) => {
    for (const [peerId, conn] of connectionsRef.current.entries()) {
      if (conn.open && conn.peer !== excludePeer) {
        try {
          const encryptor = encryptorsRef.current.get(peerId)
          const isEncrypted = encryptor?.isReady() ?? false

          if (isEncrypted && encryptor) {
            const encrypted = await encryptJSON(encryptor, data)
            conn.send({ type: "encrypted", encrypted })
          } else {
            conn.send(data)
          }
        } catch (error) {
          console.error("Failed to broadcast:", error)
        }
      }
    }
  }, [])

  const updatePeerCount = useCallback(() => {
    const count = connectionsRef.current.size
    setPeerCount(count)
    
    // 更新加密状态
    const allEncrypted = count > 0 && Array.from(encryptorsRef.current.values()).every(e => e.isReady())
    setIsEncrypted(allEncrypted)
    
    if (count > 0) {
      setConnectionStatus("connected")
      setErrorMessage(null)
      reconnectAttemptsRef.current = 0
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (startQualityMonitoringRef.current) {
        startQualityMonitoringRef.current()
      }
    } else {
      setIsEncrypted(false)
      if (roomCode && connectionStatus !== "reconnecting") {
        setConnectionStatus("connecting")
      }
      if (stopQualityMonitoringRef.current) {
        stopQualityMonitoringRef.current()
      }
    }
  }, [roomCode, connectionStatus])

  // ============ Connection Refs Setup ============
  const connectionRefs: ConnectionRefs = {
    connectionsRef,
    encryptorsRef,
    keyExchangePendingRef,
    fileBuffersRef,
    reconnectAttemptsRef,
    reconnectTimeoutRef,
    shouldReconnectRef,
    peerRef,
    setupConnectionRef,
    attemptReconnectRef,
    joinRoomRef,
    cancelledTransfersRef,
  }

  // ============ Connection Callbacks Setup ============
  const connectionCallbacks: ConnectionCallbacks = {
    setError,
    setConnectionStatus,
    setConnectionInfo,
    setErrorMessage,
    setIsEncrypted,
    setPeerCount,
    updatePeerCount,
    addSystemMessage,
    addItem,
    addItemWithId,
    updateItemProgress,
    createTrackedBlobUrl,
    broadcastToConnections,
    cleanupAll,
    handlePong,
    recordBandwidth,
    notifyReceived: (type: string, name?: string) => notifyReceived(type as "text" | "image" | "file", name),
  }

  // ============ Connection Setup ============
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setupConnection = useCallback(async (conn: any, isOutgoing = false) => {
    const setupFn = createSetupConnection(connectionRefs, connectionCallbacks, roomCode)
    return setupFn(conn, isOutgoing)
  }, [roomCode])

  const ensureDiscoveryPeer = useCallback(async () => {
    if (peerRef.current && !peerRef.current.destroyed) {
      return peerRef.current
    }

    const { default: Peer } = await import("peerjs")
    const peer = new Peer(PEER_OPTIONS)

    peer.on("open", (id: string) => {
      setSelfPeerId(id)
    })

    peer.on("connection", (conn: any) => {
      setupConnection(conn, false)
    })

    peer.on("error", (err: any) => {
      console.error("Peer error:", err)
    })

    peer.on("disconnected", () => {
      if (!peer.destroyed) {
        peer.reconnect()
      }
    })

    peerRef.current = peer
    return peer
  }, [setupConnection])

  // ============ Reconnection Logic ============
  const attemptReconnect = useCallback(() => {
    const reconnectFn = createAttemptReconnect(connectionRefs, connectionCallbacks, roomCode, connectionStatus, isHost)
    return reconnectFn()
  }, [roomCode, connectionStatus, isHost, connectionRefs, connectionCallbacks])

  // Store functions in refs
  useEffect(() => {
    setupConnectionRef.current = setupConnection
    attemptReconnectRef.current = attemptReconnect
  }, [setupConnection, attemptReconnect])

  useEffect(() => {
    if (isCreatingRoom || isJoiningRoom) return
    if (!peerRef.current || peerRef.current.destroyed) {
      ensureDiscoveryPeer()
    }
  }, [ensureDiscoveryPeer, isCreatingRoom, isJoiningRoom])

  // ============ Room Management ============
  const roomCallbacks: RoomCallbacks = {
    setIsCreatingRoom,
    setIsJoiningRoom,
    setRoomCode,
    setConnectionStatus,
    setErrorMessage,
    setIsHost,
    setError,
    cleanupAll,
    broadcastToConnections,
    setConnectionInfo,
    setPeerCount,
    setSelfPeerId,
  }

  const { createRoom, joinRoom, leaveRoom: leaveRoomFn } = createRoomManagement(
    connectionRefs,
    roomCallbacks,
    setupConnection
  )

  const leaveRoom = useCallback(async () => {
    await leaveRoomFn(isHost)
  }, [isHost, leaveRoomFn])

  const connectToPeer = useCallback(async (peerId: string) => {
    const targetPeerId = peerId.trim()
    if (!targetPeerId) return

    setIsJoiningRoom(true)
    setErrorMessage(null)
    setConnectionStatus("connecting")
    setIsHost(true)

    try {
      const peer = await ensureDiscoveryPeer()
      const conn = peer.connect(targetPeerId, { reliable: true })
      if (conn) {
        setupConnection(conn, true)
      } else {
        setError("无法创建连接")
      }
    } catch (error) {
      console.error("Direct connect error:", error)
      setError("连接失败，请重试")
    } finally {
      setIsJoiningRoom(false)
    }
  }, [ensureDiscoveryPeer, setupConnection, setError])

  useEffect(() => {
    joinRoomRef.current = joinRoom
  }, [joinRoom])

  // ============ Data Transfer ============
  const dataTransferCallbacks: DataTransferCallbacks = {
    setSendingCount,
    addItem,
    addItemWithId,
    updateItemProgress,
    createTrackedBlobUrl,
  }

  const { sendText, sendFile } = createDataTransfer(
    connectionRefs,
    dataTransferCallbacks,
    encryptorsRef
  )

  const cancelTransfer = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (!item || item.status !== "transferring") return

    if (item.direction === "sent") {
      cancelledTransfersRef.current.add(itemId)
    } else if (item.direction === "received") {
      for (const [peerId, buffer] of fileBuffersRef.current.entries()) {
        if (buffer.localItemId === itemId) {
          buffer.chunks = []
          fileBuffersRef.current.delete(peerId)
          
          const conn = connectionsRef.current.get(buffer.peerId)
          if (conn && conn.open) {
            conn.send({
              type: "file-cancel",
              itemId: buffer.remoteItemId,
            })
          }
          break
        }
      }
      
      updateItemProgress(itemId, {
        status: "cancelled",
        speed: undefined,
      })
    }
  }, [items, updateItemProgress])

  // ============ Cleanup ============
  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      cleanupQuality()
      
      connectionsRef.current.forEach(safeClose)
      connectionsRef.current.clear()
      fileBuffersRef.current.clear()
      
      if (peerRef.current) {
        try { peerRef.current.destroy() } catch {}
        peerRef.current = null
      }
      
      cleanupItems()
    }
  }, [cleanupQuality, cleanupItems])

  // ============ Performance Monitoring ============
  const getEncryptionPerformance = useCallback((): EncryptionPerformance | null => {
    if (encryptorsRef.current.size === 0) {
      return null
    }

    // 聚合所有连接的加密性能数据
    let totalEncryptTime = 0
    let totalDecryptTime = 0
    let totalEncryptThroughput = 0
    let totalDecryptThroughput = 0
    let totalEncrypted = 0
    let totalDecrypted = 0
    let totalChunks = 0
    let encryptorCount = 0

    encryptorsRef.current.forEach((encryptor) => {
      const stats = encryptor.getPerformanceStats()
      if (stats.chunkCount > 0) {
        totalEncryptTime += stats.encryptTime
        totalDecryptTime += stats.decryptTime
        totalEncryptThroughput += stats.encryptThroughput
        totalDecryptThroughput += stats.decryptThroughput
        totalEncrypted += stats.totalEncrypted
        totalDecrypted += stats.totalDecrypted
        totalChunks += stats.chunkCount
        encryptorCount++
      }
    })

    if (encryptorCount === 0) {
      return null
    }

    return {
      encryptTime: totalEncryptTime / encryptorCount,
      decryptTime: totalDecryptTime / encryptorCount,
      encryptThroughput: totalEncryptThroughput / encryptorCount,
      decryptThroughput: totalDecryptThroughput / encryptorCount,
      totalEncrypted,
      totalDecrypted,
      chunkCount: totalChunks,
    }
  }, [])

  // 定期更新性能数据
  useEffect(() => {
    if (!isEncrypted || encryptorsRef.current.size === 0) {
      setEncryptionPerformance(null)
      return
    }

    const updatePerformance = () => {
      const perf = getEncryptionPerformance()
      setEncryptionPerformance(perf)
    }

    updatePerformance()
    const interval = setInterval(updatePerformance, 2000) // 每 2 秒更新一次

    return () => clearInterval(interval)
  }, [isEncrypted, getEncryptionPerformance])

  // ============ Provider ============
  return (
    <TransferContext.Provider
      value={{
        roomCode,
        connectionStatus,
        connectionInfo,
        connectionQuality,
        errorMessage,
        items,
        createRoom,
        joinRoom,
        connectToPeer,
        leaveRoom,
        sendText,
        sendFile,
        cancelTransfer,
        clearHistory,
        peerCount,
        isHost,
        isCreatingRoom,
        isJoiningRoom,
        sendingCount,
        isEncrypted,
        selfPeerId,
        notificationSettings,
        notificationPermission,
        updateNotificationSettings,
        requestNotificationPermission,
        testNotification,
        encryptionPerformance,
        getEncryptionPerformance,
      }}
    >
      {children}
    </TransferContext.Provider>
  )
}
