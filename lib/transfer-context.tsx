'use client'

import type { generateKeyPair, SessionEncryptor } from './crypto'
import type { ConnectionCallbacks, ConnectionRefs } from './transfer-connection'
import type { DataTransferCallbacks } from './transfer-data'
import type { RoomCallbacks } from './transfer-room'
import type { ConnectionInfo, ConnectionQuality, ConnectionStatus, ConnectionType, EncryptionPerformance, TransferItem } from './types'
import * as React from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useConnectionQuality } from '@/hooks/use-connection-quality'
import { useConnectionSettings } from '@/hooks/use-connection-settings'
import { useNotification } from '@/hooks/use-notification'
import { useTransferItems } from '@/hooks/use-transfer-items'
import { encryptJSON } from './crypto'
import { createAttemptReconnect, createSetupConnection } from './transfer-connection'
import { createDataTransfer } from './transfer-data'
import { createRoomManagement } from './transfer-room'

export type { ConnectionInfo, ConnectionQuality, ConnectionStatus, ConnectionType, EncryptionPerformance, TransferItem }

interface TransferContextType {
  roomCode: string | null
  connectionStatus: ConnectionStatus
  connectionInfo: ConnectionInfo
  connectionQuality: ConnectionQuality
  errorMessage: string | null
  items: TransferItem[]
  createRoom: () => void
  joinRoom: (code: string) => void
  leaveRoom: () => void
  sendText: (text: string) => void
  sendFile: (file: File) => Promise<void>
  cancelTransfer: (itemId: string) => void
  clearHistory: () => void
  addSystemMessage: (message: string, force?: boolean) => void
  peerCount: number
  isHost: boolean
  isCreatingRoom: boolean
  isJoiningRoom: boolean
  sendingCount: number
  isEncrypted: boolean
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
  connectionSettings: {
    forceRelay: boolean
  }
  updateConnectionSettings: (settings: Partial<{
    forceRelay: boolean
  }>) => void
  encryptionPerformance: EncryptionPerformance | null
  getEncryptionPerformance: () => EncryptionPerformance | null
  suspendAutoReconnect: (durationMs?: number) => void
}

const TransferContext = createContext<TransferContextType | null>(null)
const DEFAULT_CONNECTION_INFO: ConnectionInfo = { type: 'unknown' }

interface ConnectionState {
  roomCode: string | null
  connectionStatus: ConnectionStatus
  connectionInfo: ConnectionInfo
  errorMessage: string | null
  peerCount: number
  isHost: boolean
  isEncrypted: boolean
  encryptionPerformance: EncryptionPerformance | null
}

const INITIAL_CONNECTION_STATE: ConnectionState = {
  roomCode: null,
  connectionStatus: 'disconnected',
  connectionInfo: DEFAULT_CONNECTION_INFO,
  errorMessage: null,
  peerCount: 0,
  isHost: false,
  isEncrypted: false,
  encryptionPerformance: null,
}

function connectionStateReducer(
  state: ConnectionState,
  patch: Partial<ConnectionState>,
): ConnectionState {
  return {
    ...state,
    ...patch,
  }
}

export function useTransfer() {
  const context = use(TransferContext)
  if (!context) {
    throw new Error('useTransfer must be used within TransferProvider')
  }
  return context
}

export function TransferProvider({ children }: { children: React.ReactNode }) {
  // ============ Core State ============
  const [connectionState, patchConnectionState] = useReducer(
    connectionStateReducer,
    INITIAL_CONNECTION_STATE,
  )
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [isJoiningRoom, setIsJoiningRoom] = useState(false)
  const [sendingCount, setSendingCount] = useState(0)
  const {
    roomCode,
    connectionStatus,
    connectionInfo,
    errorMessage,
    peerCount,
    isHost,
    isEncrypted,
    encryptionPerformance,
  } = connectionState
  const setRoomCode = useCallback((nextRoomCode: string | null) => {
    patchConnectionState({ roomCode: nextRoomCode })
  }, [])
  const setConnectionStatus = useCallback((nextStatus: ConnectionStatus) => {
    patchConnectionState({ connectionStatus: nextStatus })
  }, [])
  const setConnectionInfo = useCallback((nextInfo: ConnectionInfo) => {
    patchConnectionState({ connectionInfo: nextInfo })
  }, [])
  const setErrorMessage = useCallback((nextMessage: string | null) => {
    patchConnectionState({ errorMessage: nextMessage })
  }, [])
  const setPeerCount = useCallback((nextPeerCount: number) => {
    patchConnectionState({ peerCount: nextPeerCount })
  }, [])
  const setIsHost = useCallback((nextIsHost: boolean) => {
    patchConnectionState({ isHost: nextIsHost })
  }, [])
  const setIsEncrypted = useCallback((nextIsEncrypted: boolean) => {
    patchConnectionState({ isEncrypted: nextIsEncrypted })
  }, [])
  const setEncryptionPerformance = useCallback((nextPerformance: EncryptionPerformance | null) => {
    patchConnectionState({ encryptionPerformance: nextPerformance })
  }, [])

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
    settings: connectionSettings,
    updateSettings: updateConnectionSettings,
  } = useConnectionSettings()

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

  const encryptorsRef = useRef<Map<string, SessionEncryptor>>(new Map())

  const keyExchangePendingRef = useRef<Map<string, {
    keyPair: Awaited<ReturnType<typeof generateKeyPair>>
    isOutgoing: boolean
  }>>(new Map())

  // Reconnection state
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const shouldReconnectRef = useRef(true)

  const setupConnectionRef = useRef<((conn: any, isOutgoing?: boolean) => void) | null>(null)
  const attemptReconnectRef = useRef<(() => void) | null>(null)
  const joinRoomRef = useRef<((code: string) => Promise<void>) | null>(null)
  const startQualityMonitoringRef = useRef<(() => void) | null>(null)
  const stopQualityMonitoringRef = useRef<(() => void) | null>(null)
  const forceRelayRef = useRef(connectionSettings.forceRelay)
  const suppressReconnectUntilRef = useRef(0)

  // Transfer cancellation tracking
  const cancelledTransfersRef = useRef<Set<string>>(new Set())

  // Store quality monitoring functions in refs
  useEffect(() => {
    startQualityMonitoringRef.current = startQualityMonitoring
    stopQualityMonitoringRef.current = stopQualityMonitoring
  }, [startQualityMonitoring, stopQualityMonitoring])

  // ============ Utility Functions ============
  const setError = useCallback((message: string) => {
    setConnectionStatus('error')
    setErrorMessage(message)
  }, [setConnectionStatus, setErrorMessage])

  const safeClose = (conn: any) => {
    try {
      conn.close()
    }
    catch {}
  }

  const destroyPeer = useCallback(() => {
    if (peerRef.current) {
      try {
        peerRef.current.disconnect()
        peerRef.current.destroy()
      }
      catch {}
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

  const suspendAutoReconnect = useCallback((durationMs = 15000) => {
    const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
    suppressReconnectUntilRef.current = Date.now() + safeDuration
  }, [])

  useEffect(() => {
    if (forceRelayRef.current === connectionSettings.forceRelay) {
      return
    }

    forceRelayRef.current = connectionSettings.forceRelay
    shouldReconnectRef.current = false
    cleanupAll()

    setRoomCode(null)
    setConnectionStatus('disconnected')
    setConnectionInfo(DEFAULT_CONNECTION_INFO)
    setErrorMessage(null)
    setPeerCount(0)
    setIsHost(false)
    setIsEncrypted(false)

    if (stopQualityMonitoringRef.current) {
      stopQualityMonitoringRef.current()
    }

    addSystemMessage('已切换连接模式，请重新连接', true)
    shouldReconnectRef.current = true
  }, [
    addSystemMessage,
    cleanupAll,
    connectionSettings.forceRelay,
    setConnectionInfo,
    setConnectionStatus,
    setErrorMessage,
    setIsEncrypted,
    setIsHost,
    setPeerCount,
    setRoomCode,
  ])

  const broadcastToConnections = useCallback(async (data: any, excludePeer?: string) => {
    for (const [peerId, conn] of connectionsRef.current.entries()) {
      if (conn.open && conn.peer !== excludePeer) {
        try {
          const encryptor = encryptorsRef.current.get(peerId)
          const isEncrypted = encryptor?.isReady() ?? false

          if (isEncrypted && encryptor) {
            const encrypted = await encryptJSON(encryptor, data)
            conn.send({ type: 'encrypted', encrypted })
          }
          else {
            conn.send(data)
          }
        }
        catch (error) {
          console.error('Failed to broadcast:', error)
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
      setConnectionStatus('connected')
      setErrorMessage(null)
      reconnectAttemptsRef.current = 0
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (startQualityMonitoringRef.current) {
        startQualityMonitoringRef.current()
      }
    }
    else {
      setIsEncrypted(false)
      if (roomCode && connectionStatus !== 'reconnecting') {
        setConnectionStatus('connecting')
      }
      if (stopQualityMonitoringRef.current) {
        stopQualityMonitoringRef.current()
      }
    }
  }, [connectionStatus, roomCode, setConnectionStatus, setErrorMessage, setIsEncrypted, setPeerCount])

  // ============ Connection Refs Setup ============
  const connectionRefs = useMemo<ConnectionRefs>(() => ({
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
  }), [])

  // ============ Connection Callbacks Setup ============
  const connectionCallbacks = useMemo<ConnectionCallbacks>(() => ({
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
    notifyReceived: (type: string, name?: string) => notifyReceived(type as 'text' | 'image' | 'file', name),
  }), [
    addItem,
    addItemWithId,
    addSystemMessage,
    broadcastToConnections,
    cleanupAll,
    createTrackedBlobUrl,
    handlePong,
    notifyReceived,
    recordBandwidth,
    setConnectionInfo,
    setConnectionStatus,
    setError,
    setErrorMessage,
    setIsEncrypted,
    setPeerCount,
    updateItemProgress,
    updatePeerCount,
  ])

  // ============ Connection Setup ============

  const setupConnection = useCallback(async (conn: any, isOutgoing = false) => {
    const setupFn = createSetupConnection(connectionRefs, connectionCallbacks, roomCode)
    return setupFn(conn, isOutgoing)
  }, [connectionCallbacks, connectionRefs, roomCode])

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

  // Reconnect when app returns to foreground or network comes back
  useEffect(() => {
    if (typeof window === 'undefined')
      return

    const tryReconnect = () => {
      if (Date.now() < suppressReconnectUntilRef.current) {
        return
      }

      const hasOpenConnections = Array.from(connectionsRef.current.values()).some(conn => conn?.open)
      const peerIsDisconnected = !!peerRef.current?.disconnected

      // Avoid forcing reconnection when an existing connection is still healthy.
      if (hasOpenConnections && !peerIsDisconnected) {
        return
      }

      if (peerRef.current && peerRef.current.disconnected) {
        try {
          peerRef.current.reconnect()
        }
        catch {}
      }
      if (attemptReconnectRef.current) {
        attemptReconnectRef.current()
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        tryReconnect()
      }
    }

    const handleOnline = () => {
      tryReconnect()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

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
  }

  const { createRoom, joinRoom, leaveRoom: leaveRoomFn } = createRoomManagement(
    connectionRefs,
    roomCallbacks,
    setupConnection,
    connectionSettings.forceRelay,
  )

  const leaveRoom = useCallback(async () => {
    await leaveRoomFn(isHost)
  }, [isHost, leaveRoomFn])

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
    encryptorsRef,
  )

  const cancelTransfer = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (!item || item.status !== 'transferring')
      return

    if (item.direction === 'sent') {
      cancelledTransfersRef.current.add(itemId)
    }
    else if (item.direction === 'received') {
      for (const [peerId, buffer] of fileBuffersRef.current.entries()) {
        if (buffer.localItemId === itemId) {
          buffer.chunks = []
          fileBuffersRef.current.delete(peerId)

          const conn = connectionsRef.current.get(buffer.peerId)
          if (conn && conn.open) {
            conn.send({
              type: 'file-cancel',
              itemId: buffer.remoteItemId,
            })
          }
          break
        }
      }

      updateItemProgress(itemId, {
        status: 'cancelled',
        speed: undefined,
      })
    }
  }, [items, updateItemProgress])

  // ============ Cleanup ============
  useEffect(() => {
    const activeConnections = connectionsRef.current
    const activeFileBuffers = fileBuffersRef.current

    return () => {
      shouldReconnectRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      cleanupQuality()

      activeConnections.forEach(safeClose)
      activeConnections.clear()
      activeFileBuffers.clear()

      if (peerRef.current) {
        try {
          peerRef.current.destroy()
        }
        catch {}
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
  }, [isEncrypted, getEncryptionPerformance, setEncryptionPerformance])

  // ============ Provider ============
  return (
    <TransferContext
      value={{
        roomCode,
        connectionStatus,
        connectionInfo,
        connectionQuality,
        errorMessage,
        items,
        createRoom,
        joinRoom,
        leaveRoom,
        sendText,
        sendFile,
        cancelTransfer,
        clearHistory,
        addSystemMessage,
        peerCount,
        isHost,
        isCreatingRoom,
        isJoiningRoom,
        sendingCount,
        isEncrypted,
        notificationSettings,
        notificationPermission,
        updateNotificationSettings,
        requestNotificationPermission,
        testNotification,
        connectionSettings,
        updateConnectionSettings,
        encryptionPerformance,
        getEncryptionPerformance,
        suspendAutoReconnect,
      }}
    >
      {children}
    </TransferContext>
  )
}
