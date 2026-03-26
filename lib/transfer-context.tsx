'use client'

import type { generateKeyPair, SessionEncryptor } from './crypto'
import type { ReceiveStorageHandle } from './receive-storage'
import type { ConnectionCallbacks, ConnectionRefs } from './transfer-connection'
import type { DataTransferCallbacks } from './transfer-data'
import type { RoomCallbacks } from './transfer-room'
import type { ConnectionInfo, ConnectionQuality, ConnectionStatus, ConnectionType, EncryptionPerformance, TransferItem } from './types'
import * as React from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useConnectionQuality } from '@/hooks/use-connection-quality'
import { useConnectionSettings } from '@/hooks/use-connection-settings'
import { useNotification } from '@/hooks/use-notification'
import { useTransferItems as useTransferItemsState } from '@/hooks/use-transfer-items'
import { createConnectionAttemptRegistry } from './connection-attempts'
import { encryptJSON } from './crypto'
import { PEER_PREFIX } from './peer-config'
import { normalizeScreenShareType, stopIncomingScreenShare, stopOutgoingScreenShare } from './screen-share'
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
  createRoom: () => void
  joinRoom: (code: string) => void
  leaveRoom: () => void
  peerCount: number
  isHost: boolean
  isCreatingRoom: boolean
  isJoiningRoom: boolean
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
  startScreenShare: (streamType?: 'screen' | 'window' | 'tab') => Promise<string | null>
  stopScreenShare: () => void
}

interface TransferItemsContextType {
  items: TransferItem[]
  sendText: (text: string) => void
  sendFile: (file: File) => Promise<void>
  cancelTransfer: (itemId: string) => void
  clearHistory: () => void
  addSystemMessage: (message: string, force?: boolean) => void
  removeItem: (itemId: string) => void
  sendingCount: number
}

const TransferContext = createContext<TransferContextType | null>(null)
const TransferItemsContext = createContext<TransferItemsContextType | null>(null)
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

export function useTransferItems() {
  const context = use(TransferItemsContext)
  if (!context) {
    throw new Error('useTransferItems must be used within TransferProvider')
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
    addSystemMessage: pushSystemMessage,
    updateItemProgress,
    removeItem,
    clearHistory,
    createTrackedBlobUrl,
    cleanup: cleanupItems,
  } = useTransferItemsState()
  const enqueueSystemMessage = useCallback((message: string, force = false) => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    pushSystemMessage(message, force)
  }, [pushSystemMessage])

  const connectionsRef = useRef<Map<string, any>>(new Map())

  const {
    connectionQuality,
    hasHealthyConnections,
    isPeerHealthy,
    removePeerMetrics,
    startQualityMonitoring,
    stopQualityMonitoring,
    touchPeer,
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
    type: string
    received: number
    localItemId: string
    remoteItemId: string
    lastTime: number
    lastBytes: number
    smoothedSpeed: number
    storage: ReceiveStorageHandle
  }>>(new Map())

  // 加密相关 refs

  const encryptorsRef = useRef<Map<string, SessionEncryptor>>(new Map())

  const keyExchangePendingRef = useRef<Map<string, {
    keyPair: Awaited<ReturnType<typeof generateKeyPair>>
    isOutgoing: boolean
  }>>(new Map())

  // Screen share state
  const screenShareStreamRef = useRef<MediaStream | null>(null)
  const screenShareCallsRef = useRef<any[]>([])
  const screenShareItemIdRef = useRef<string | null>(null)
  const incomingScreenShareCallRef = useRef<any>(null)
  const incomingScreenShareItemIdRef = useRef<string | null>(null)
  const stopScreenShareRef = useRef<(() => void) | null>(null)

  // Reconnection state
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const shouldReconnectRef = useRef(true)
  const pendingReconnectRef = useRef(false)
  const connectingPeersRef = useRef(createConnectionAttemptRegistry())

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
    fileBuffersRef.current.forEach((buffer) => {
      void buffer.storage.abort()
    })
    fileBuffersRef.current.clear()
    connectingPeersRef.current.clear()
    encryptorsRef.current.clear()
    keyExchangePendingRef.current.clear()
    pendingReconnectRef.current = false
  }, [])

  const cleanupScreenShare = useCallback((notify = false) => {
    const outgoingStream = screenShareStreamRef.current
    const outgoingCalls = screenShareCallsRef.current
    const outgoingItemId = screenShareItemIdRef.current
    const incomingCall = incomingScreenShareCallRef.current
    const incomingItemId = incomingScreenShareItemIdRef.current

    screenShareStreamRef.current = null
    screenShareCallsRef.current = []
    screenShareItemIdRef.current = null
    incomingScreenShareCallRef.current = null
    incomingScreenShareItemIdRef.current = null

    const stoppedOutgoing = stopOutgoingScreenShare({
      stream: outgoingStream,
      calls: outgoingCalls,
      itemId: outgoingItemId,
      removeItem,
    })
    const stoppedIncoming = stopIncomingScreenShare({
      call: incomingCall,
      itemId: incomingItemId,
      removeItem,
    })

    if (notify && stoppedOutgoing) {
      enqueueSystemMessage('已停止屏幕共享', true)
    }

    return stoppedOutgoing || stoppedIncoming
  }, [enqueueSystemMessage, removeItem])

  const cleanupAll = useCallback(() => {
    cleanupScreenShare(false)
    cleanupConnections()
    destroyPeer()
  }, [cleanupConnections, cleanupScreenShare, destroyPeer])

  const suspendAutoReconnect = useCallback((durationMs = 15000) => {
    const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
    suppressReconnectUntilRef.current = Date.now() + safeDuration
  }, [])

  const startScreenShare = useCallback(async (streamType: 'screen' | 'window' | 'tab' = 'screen') => {
    try {
      const displayMediaOptions: DisplayMediaStreamOptions = {
        video: {
          displaySurface: 'browser',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      }

      const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions)
      screenShareStreamRef.current = stream

      const videoTrack = stream.getVideoTracks()[0]
      const detectedType = normalizeScreenShareType(videoTrack?.getSettings().displaySurface) ?? streamType

      const itemId = addItemWithId({
        type: 'stream',
        streamType: detectedType,
        content: stream as unknown as string,
        direction: 'sent',
        status: 'transferring',
      })

      screenShareItemIdRef.current = itemId

      stream.addEventListener('inactive', () => {
        stopScreenShareRef.current?.()
      })

      const typeName = detectedType === 'tab' ? '标签页' : detectedType === 'window' ? '窗口' : '屏幕'

      if (!peerRef.current || peerRef.current.destroyed) {
        enqueueSystemMessage('屏幕共享启动失败：未连接到对端', true)
        stopScreenShareRef.current?.()
        return null
      }

      const hostPeerId = PEER_PREFIX + roomCode

      if (isHost) {
        const calls: any[] = []
        for (const [peerId] of connectionsRef.current.entries()) {
          try {
            const call = peerRef.current.call(peerId, stream)
            if (call) {
              calls.push(call)
              call.on('error', (err: unknown) => {
                console.error('Screen share call error:', err)
                enqueueSystemMessage(`${typeName}共享连接失败`, true)
              })
            }
          }
          catch (err) {
            console.error('Failed to call peer:', peerId, err)
          }
        }
        if (calls.length > 0) {
          screenShareCallsRef.current = calls
          enqueueSystemMessage(`开始共享${typeName}`, true)
        }
        else {
          enqueueSystemMessage('没有已连接的设备', true)
          stopScreenShareRef.current?.()
          return null
        }
      }
      else {
        if (hostPeerId) {
          const call = peerRef.current.call(hostPeerId, stream)
          if (call) {
            screenShareCallsRef.current = [call]
            call.on('error', (err: unknown) => {
              console.error('Screen share call error:', err)
              enqueueSystemMessage(`${typeName}共享连接失败`, true)
            })
            enqueueSystemMessage(`开始共享${typeName}`, true)
          }
          else {
            enqueueSystemMessage('无法创建通话', true)
            stopScreenShareRef.current?.()
            return null
          }
        }
      }

      return itemId
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '屏幕共享启动失败'
      enqueueSystemMessage(message, true)
      return null
    }
  }, [addItemWithId, enqueueSystemMessage, roomCode, isHost])

  const stopScreenShare = useCallback(() => {
    const outgoingStream = screenShareStreamRef.current
    const outgoingCalls = screenShareCallsRef.current
    const outgoingItemId = screenShareItemIdRef.current

    screenShareStreamRef.current = null
    screenShareCallsRef.current = []
    screenShareItemIdRef.current = null

    const stoppedOutgoing = stopOutgoingScreenShare({
      stream: outgoingStream,
      calls: outgoingCalls,
      itemId: outgoingItemId,
      removeItem,
    })

    if (stoppedOutgoing) {
      enqueueSystemMessage('已停止屏幕共享', true)
    }
  }, [enqueueSystemMessage, removeItem])

  stopScreenShareRef.current = stopScreenShare

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

    enqueueSystemMessage('已切换连接模式，请重新连接', true)
    shouldReconnectRef.current = true
  }, [
    cleanupAll,
    connectionSettings.forceRelay,
    enqueueSystemMessage,
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
      pendingReconnectRef.current = false
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
    suppressReconnectUntilRef,
    pendingReconnectRef,
    peerRef,
    connectingPeersRef,
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
    addSystemMessage: enqueueSystemMessage,
    addItem,
    addItemWithId,
    updateItemProgress,
    createTrackedBlobUrl,
    broadcastToConnections,
    cleanupAll,
    handlePong,
    touchPeer,
    isPeerHealthy,
    recordBandwidth,
    removePeerQuality: removePeerMetrics,
    notifyReceived: (type: string, name?: string) => notifyReceived(type as 'text' | 'image' | 'file', name),
  }), [
    addItem,
    addItemWithId,
    enqueueSystemMessage,
    broadcastToConnections,
    cleanupAll,
    createTrackedBlobUrl,
    handlePong,
    isPeerHealthy,
    notifyReceived,
    recordBandwidth,
    removePeerMetrics,
    setConnectionInfo,
    setConnectionStatus,
    setError,
    setErrorMessage,
    setIsEncrypted,
    setPeerCount,
    touchPeer,
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
      const hasPendingReconnect = pendingReconnectRef.current
      if (!hasPendingReconnect && Date.now() < suppressReconnectUntilRef.current) {
        return
      }

      const hasOpenConnections = Array.from(connectionsRef.current.values()).some(conn => conn?.open)

      // Avoid forcing reconnection while an active connection still has recent heartbeats.
      if (hasOpenConnections && hasHealthyConnections()) {
        pendingReconnectRef.current = false
        return
      }

      if (hasPendingReconnect) {
        pendingReconnectRef.current = false
        suppressReconnectUntilRef.current = 0
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
      else {
        // Page entering background - trigger ICE restart to keep NAT mappings alive
        for (const conn of connectionsRef.current.values()) {
          if (conn?.open) {
            const pc = conn.peerConnection as RTCPeerConnection | undefined
            if (pc) {
              try {
                pc.restartIce()
              }
              catch {}
            }
          }
        }
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
  }, [hasHealthyConnections])

  // ============ Room Management ============
  const handleIncomingScreenShare = useCallback((remoteStream: MediaStream, call: any) => {
    if (incomingScreenShareCallRef.current && incomingScreenShareCallRef.current !== call) {
      const previousCall = incomingScreenShareCallRef.current
      const previousItemId = incomingScreenShareItemIdRef.current
      incomingScreenShareCallRef.current = null
      incomingScreenShareItemIdRef.current = null
      stopIncomingScreenShare({
        call: previousCall,
        itemId: previousItemId,
        removeItem,
      })
    }

    const existingItemId = incomingScreenShareItemIdRef.current
    if (incomingScreenShareCallRef.current === call && existingItemId) {
      return
    }

    const remoteVideoTrack = remoteStream.getVideoTracks()[0]
    const itemId = addItemWithId({
      type: 'stream',
      streamType: normalizeScreenShareType(remoteVideoTrack?.getSettings().displaySurface),
      content: remoteStream as unknown as string,
      direction: 'received',
      status: 'transferring',
    })

    incomingScreenShareCallRef.current = call
    incomingScreenShareItemIdRef.current = itemId
    enqueueSystemMessage('收到屏幕共享', true)

    call.on('close', () => {
      if (incomingScreenShareCallRef.current === call) {
        incomingScreenShareCallRef.current = null
        if (incomingScreenShareItemIdRef.current) {
          removeItem(incomingScreenShareItemIdRef.current)
          incomingScreenShareItemIdRef.current = null
        }
        enqueueSystemMessage('屏幕共享已结束', true)
      }
    })
  }, [addItemWithId, enqueueSystemMessage, removeItem])

  const roomCallbacks = useMemo<RoomCallbacks>(() => ({
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
    onIncomingScreenShare: handleIncomingScreenShare,
  }), [
    broadcastToConnections,
    cleanupAll,
    setConnectionInfo,
    setConnectionStatus,
    setError,
    setErrorMessage,
    setIsHost,
    setPeerCount,
    setRoomCode,
    handleIncomingScreenShare,
  ])

  const {
    createRoom,
    joinRoom,
    leaveRoom: leaveRoomFn,
  } = useMemo(
    () => createRoomManagement(
      connectionRefs,
      roomCallbacks,
      setupConnection,
      connectionSettings.forceRelay,
    ),
    [connectionRefs, connectionSettings.forceRelay, roomCallbacks, setupConnection],
  )

  const leaveRoom = useCallback(async () => {
    await leaveRoomFn(isHost)
  }, [isHost, leaveRoomFn])

  useEffect(() => {
    joinRoomRef.current = joinRoom
  }, [joinRoom])

  // ============ Data Transfer ============
  const dataTransferCallbacks = useMemo<DataTransferCallbacks>(() => ({
    setSendingCount,
    addItem,
    addItemWithId,
    updateItemProgress,
    createTrackedBlobUrl,
  }), [
    addItem,
    addItemWithId,
    createTrackedBlobUrl,
    updateItemProgress,
  ])

  const { sendText, sendFile } = useMemo(
    () => createDataTransfer(
      connectionRefs,
      dataTransferCallbacks,
      encryptorsRef,
    ),
    [connectionRefs, dataTransferCallbacks],
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
          void buffer.storage.abort()
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
    const activeConnectionAttempts = connectingPeersRef.current

    return () => {
      shouldReconnectRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      cleanupScreenShare(false)
      cleanupQuality()

      activeConnections.forEach(safeClose)
      activeConnections.clear()
      activeFileBuffers.forEach((buffer) => {
        void buffer.storage.abort()
      })
      activeFileBuffers.clear()
      activeConnectionAttempts.clear()
      pendingReconnectRef.current = false

      if (peerRef.current) {
        try {
          peerRef.current.destroy()
        }
        catch {}
        peerRef.current = null
      }

      cleanupItems()
    }
  }, [cleanupQuality, cleanupItems, cleanupScreenShare])

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
  const transferSessionValue = useMemo<TransferContextType>(() => ({
    roomCode,
    connectionStatus,
    connectionInfo,
    connectionQuality,
    errorMessage,
    createRoom,
    joinRoom,
    leaveRoom,
    peerCount,
    isHost,
    isCreatingRoom,
    isJoiningRoom,
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
    startScreenShare,
    stopScreenShare,
  }), [
    roomCode,
    connectionStatus,
    connectionInfo,
    connectionQuality,
    errorMessage,
    createRoom,
    joinRoom,
    leaveRoom,
    peerCount,
    isHost,
    isCreatingRoom,
    isJoiningRoom,
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
    startScreenShare,
    stopScreenShare,
  ])

  const transferItemsValue = useMemo<TransferItemsContextType>(() => ({
    items,
    sendText,
    sendFile,
    cancelTransfer,
    clearHistory,
    addSystemMessage: enqueueSystemMessage,
    removeItem,
    sendingCount,
  }), [
    items,
    sendText,
    sendFile,
    cancelTransfer,
    clearHistory,
    enqueueSystemMessage,
    removeItem,
    sendingCount,
  ])

  return (
    <TransferContext value={transferSessionValue}>
      <TransferItemsContext value={transferItemsValue}>
        {children}
      </TransferItemsContext>
    </TransferContext>
  )
}
