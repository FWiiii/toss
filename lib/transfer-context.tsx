"use client"

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react"
import { uint8ToBase64, base64ToUint8 } from "./utils"
import type { TransferItem, ConnectionStatus, ConnectionType, ConnectionInfo, ConnectionQuality } from "./types"
import { useNotification } from "@/hooks/use-notification"
import { useTransferItems } from "@/hooks/use-transfer-items"
import { useConnectionQuality } from "@/hooks/use-connection-quality"
import { 
  PEER_PREFIX, 
  PEER_OPTIONS, 
  FILE_CHUNK_SIZE,
  MAX_RECONNECT_ATTEMPTS,
  CONNECTION_TIMEOUT,
  generateRoomCode,
  detectConnectionType 
} from "./peer-config"

export type { TransferItem, ConnectionStatus, ConnectionType, ConnectionInfo, ConnectionQuality }

type TransferContextType = {
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
  peerCount: number
  isHost: boolean
  isCreatingRoom: boolean
  isJoiningRoom: boolean
  sendingCount: number
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
    name: string
    size: number
    chunks: Uint8Array[]
    received: number
    itemId: string
    lastTime: number
    lastBytes: number 
    smoothedSpeed: number
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
  }, [])

  const cleanupAll = useCallback(() => {
    cleanupConnections()
    destroyPeer()
  }, [cleanupConnections, destroyPeer])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broadcastToConnections = useCallback((data: any, excludePeer?: string) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open && conn.peer !== excludePeer) {
        try { conn.send(data) } catch {}
      }
    })
  }, [])

  const updatePeerCount = useCallback(() => {
    const count = connectionsRef.current.size
    setPeerCount(count)
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
      if (roomCode && connectionStatus !== "reconnecting") {
        setConnectionStatus("connecting")
      }
      if (stopQualityMonitoringRef.current) {
        stopQualityMonitoringRef.current()
      }
    }
  }, [roomCode, connectionStatus])

  // ============ Reconnection Logic ============
  const attemptReconnect = useCallback(() => {
    if (!roomCode || !shouldReconnectRef.current || connectionStatus === "dissolved") {
      return
    }

    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionStatus("error")
      setErrorMessage("重连失败，请手动重新加入房间")
      addSystemMessage("自动重连失败，连接已断开")
      return
    }

    reconnectAttemptsRef.current += 1
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 10000)
    
    setConnectionStatus("reconnecting")
    setErrorMessage(`正在尝试重新连接... (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`)
    
    reconnectTimeoutRef.current = setTimeout(() => {
      if (!shouldReconnectRef.current) return
      
      addSystemMessage(`正在尝试重新连接 (第 ${reconnectAttemptsRef.current} 次)...`)
      
      if (isHost) {
        setConnectionStatus("connecting")
      } else {
        const hostPeerId = PEER_PREFIX + roomCode
        if (peerRef.current && !peerRef.current.destroyed) {
          try {
            const conn = peerRef.current.connect(hostPeerId, { reliable: true })
            if (conn && setupConnectionRef.current) {
              setupConnectionRef.current(conn, true)
            } else {
              attemptReconnect()
            }
          } catch {
            attemptReconnect()
          }
        } else {
          if (joinRoomRef.current) {
            joinRoomRef.current(roomCode)
          }
        }
      }
    }, delay)
  }, [roomCode, connectionStatus, isHost, addSystemMessage])

  // ============ Connection Setup ============
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setupConnection = useCallback((conn: any, isOutgoing = false) => {
    let connectionTimeout: NodeJS.Timeout | null = null
    
    if (isOutgoing) {
      connectionTimeout = setTimeout(() => {
        if (!conn.open) {
          conn.close()
          setError("连接超时，请确保两个设备能够互相访问（同一网络或允许 P2P 连接）")
        }
      }, CONNECTION_TIMEOUT)
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
          }
        }
      } else {
        monitorAttempts++
        setTimeout(monitorIceState, 200)
      }
    }
    setTimeout(monitorIceState, 100)

    conn.on("open", () => {
      if (connectionTimeout) clearTimeout(connectionTimeout)
      connectionsRef.current.set(conn.peer, conn)
      updatePeerCount()
      
      if (!isOutgoing) {
        addSystemMessage("有新设备加入了房间")
        broadcastToConnections({ type: "peer-joined" }, conn.peer)
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
      const wasConnected = connectionsRef.current.has(conn.peer)
      connectionsRef.current.delete(conn.peer)
      fileBuffersRef.current.delete(conn.peer)
      
      if (wasConnected) {
        addSystemMessage("有设备断开了连接")
      }
      
      updatePeerCount()
      
      if (connectionsRef.current.size === 0 && roomCode && shouldReconnectRef.current && attemptReconnectRef.current) {
        attemptReconnectRef.current()
      }
    })

    conn.on("error", (err: unknown) => {
      console.error("Connection error:", err)
      if (connectionTimeout) clearTimeout(connectionTimeout)
      connectionsRef.current.delete(conn.peer)
      
      updatePeerCount()
      
      if (isOutgoing && connectionsRef.current.size === 0 && shouldReconnectRef.current && attemptReconnectRef.current) {
        attemptReconnectRef.current()
      } else if (connectionsRef.current.size === 0) {
        setError("连接失败，正在尝试重连...")
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conn.on("data", (data: any) => {
      if (data.type === "text") {
        addItem({
          type: "text",
          content: data.content,
          direction: "received",
        })
        notifyReceived("text")
      } else if (data.type === "file-start") {
        const itemId = addItemWithId({
          type: "file",
          name: data.name,
          content: "",
          size: data.size,
          direction: "received",
          status: "transferring",
          progress: 0,
          transferredBytes: 0,
        })
        
        fileBuffersRef.current.set(conn.peer, {
          name: data.name,
          size: data.size,
          chunks: [],
          received: 0,
          itemId,
          lastTime: Date.now(),
          lastBytes: 0,
          smoothedSpeed: 0,
        })
      } else if (data.type === "file-chunk") {
        const buffer = fileBuffersRef.current.get(conn.peer)
        if (buffer) {
          const bytes = base64ToUint8(data.data)
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
            
            updateItemProgress(buffer.itemId, {
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
      } else if (data.type === "file-end") {
        const buffer = fileBuffersRef.current.get(conn.peer)
        if (buffer) {
          const blob = new Blob(buffer.chunks as unknown as BlobPart[])
          const url = createTrackedBlobUrl(blob)
          
          updateItemProgress(buffer.itemId, {
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
          fileBuffersRef.current.delete(conn.peer)
        }
      } else if (data.type === "room-dissolved") {
        addSystemMessage("房主已解散房间")
        setConnectionStatus("dissolved")
        setErrorMessage("房间已解散")
        cleanupAll()
        setPeerCount(0)
      } else if (data.type === "peer-joined") {
        addSystemMessage("有新设备加入了房间")
      } else if (data.type === "ping") {
        try {
          conn.send({ type: "pong", id: data.id })
        } catch (err) {
          console.error("Failed to send pong:", err)
        }
      } else if (data.type === "pong") {
        handlePong(data.id)
      } else if (data.type === "file-cancel") {
        const buffer = fileBuffersRef.current.get(conn.peer)
        if (buffer) {
          updateItemProgress(buffer.itemId, {
            status: "cancelled",
            speed: undefined,
          })
          
          buffer.chunks = []
          fileBuffersRef.current.delete(conn.peer)
        }
        
        if (data.itemId) {
          cancelledTransfersRef.current.add(data.itemId)
        }
      }
    })
  }, [addItem, addItemWithId, updateItemProgress, addSystemMessage, updatePeerCount, createTrackedBlobUrl, broadcastToConnections, cleanupAll, setError, handlePong, recordBandwidth, notifyReceived])

  // Store functions in refs
  useEffect(() => {
    setupConnectionRef.current = setupConnection
    attemptReconnectRef.current = attemptReconnect
  }, [setupConnection, attemptReconnect])

  // ============ Room Management ============
  const createRoom = useCallback(async () => {
    setIsCreatingRoom(true)
    
    try {
      const { default: Peer } = await import("peerjs")
      
      const code = generateRoomCode()
      const peerId = PEER_PREFIX + code
      
      cleanupAll()
      
      shouldReconnectRef.current = true
      reconnectAttemptsRef.current = 0
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      setRoomCode(code)
      setConnectionStatus("connecting")
      setErrorMessage(null)
      setIsHost(true)

      const peer = new Peer(peerId, PEER_OPTIONS)

      peer.on("open", () => {
        setIsCreatingRoom(false)
        setConnectionStatus("connecting")
      })

      peer.on("connection", (conn) => {
        setupConnection(conn, false)
      })

      peer.on("error", (err) => {
        setIsCreatingRoom(false)
        if (err.type === "unavailable-id") {
          setErrorMessage("房间代码已被占用，正在重试...")
          peer.destroy()
          setTimeout(() => createRoom(), 500)
        } else if (err.type === "network" || err.type === "server-error") {
          setError("网络错误，请检查网络连接")
        } else {
          setError(`连接错误: ${err.type}`)
        }
      })

      peer.on("disconnected", () => {
        if (!peer.destroyed) {
          peer.reconnect()
        }
      })

      peerRef.current = peer
    } catch {
      setIsCreatingRoom(false)
      setError("创建房间失败，请重试")
    }
  }, [setupConnection, cleanupAll, setError])

  const joinRoom = useCallback(async (code: string) => {
    const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "")
    if (normalizedCode.length !== 6) {
      setErrorMessage("请输入6位房间代码")
      return
    }
    
    setIsJoiningRoom(true)
    
    try {
      const { default: Peer } = await import("peerjs")
      
      const hostPeerId = PEER_PREFIX + normalizedCode
      
      cleanupAll()
      
      shouldReconnectRef.current = true
      reconnectAttemptsRef.current = 0
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      setRoomCode(normalizedCode)
      setConnectionStatus("connecting")
      setErrorMessage(null)
      setIsHost(false)

      const peer = new Peer(PEER_OPTIONS)

      peer.on("open", () => {
        setIsJoiningRoom(false)
        const conn = peer.connect(hostPeerId, { reliable: true })
        if (conn) {
          setupConnection(conn, true)
        } else {
          setError("无法创建连接")
        }
      })

      peer.on("connection", (conn) => {
        setupConnection(conn, false)
      })

      peer.on("error", (err) => {
        setIsJoiningRoom(false)
        if (err.type === "peer-unavailable") {
          setError("找不到房间，请检查代码是否正确，或房间可能已关闭")
        } else if (err.type === "network" || err.type === "server-error") {
          setError("无法连接到信令服务器，请检查网络")
        } else {
          setError(`连接错误: ${err.type}`)
        }
      })

      peer.on("disconnected", () => {
        if (!peer.destroyed) {
          peer.reconnect()
        }
      })

      peerRef.current = peer
    } catch {
      setIsJoiningRoom(false)
      setError("加入房间失败，请重试")
    }
  }, [setupConnection, cleanupAll, setError])

  useEffect(() => {
    joinRoomRef.current = joinRoom
  }, [joinRoom])

  const leaveRoom = useCallback(() => {
    setIsCreatingRoom(false)
    setIsJoiningRoom(false)
    
    shouldReconnectRef.current = false
    reconnectAttemptsRef.current = 0
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    if (stopQualityMonitoringRef.current) {
      stopQualityMonitoringRef.current()
    }
    
    if (isHost) {
      broadcastToConnections({ type: "room-dissolved" })
    }
    
    setTimeout(() => {
      cleanupAll()
      
      setRoomCode(null)
      setConnectionStatus("disconnected")
      setConnectionInfo({ type: "unknown" })
      setErrorMessage(null)
      setPeerCount(0)
      setIsHost(false)
      
      shouldReconnectRef.current = true
    }, 100)
  }, [isHost, broadcastToConnections, cleanupAll])

  // ============ Data Transfer ============
  const sendText = useCallback((text: string) => {
    if (!text.trim()) return
    
    broadcastToConnections({ type: "text", content: text })
    
    addItem({
      type: "text",
      content: text,
      direction: "sent",
    })
  }, [addItem, broadcastToConnections])

  const sendFile = useCallback(async (file: File): Promise<void> => {
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

      for (const conn of connectionsRef.current.values()) {
        if (!conn.open) continue

        conn.send({
          type: "file-start",
          name: file.name,
          size: file.size,
          itemId,
        })

        let offset = 0
        while (offset < uint8Array.length) {
          if (cancelledTransfersRef.current.has(itemId)) {
            cancelled = true
            conn.send({
              type: "file-cancel",
              itemId,
            })
            break
          }
          
          const end = Math.min(offset + FILE_CHUNK_SIZE, uint8Array.length)
          const chunk = uint8Array.subarray(offset, end)
          
          conn.send({
            type: "file-chunk",
            data: uint8ToBase64(chunk),
          })
          
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
          
          // Small delay to prevent UI freezing
          if ((offset / FILE_CHUNK_SIZE) % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1))
          }
        }

        if (!cancelled) {
          conn.send({ type: "file-end" })
        }
      }
      
      if (cancelled) {
        updateItemProgress(itemId, {
          status: "cancelled",
          speed: undefined,
        })
        cancelledTransfersRef.current.delete(itemId)
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
        cancelledTransfersRef.current.delete(itemId)
      }
    }
  }, [addItemWithId, updateItemProgress, createTrackedBlobUrl])

  const cancelTransfer = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (!item || item.status !== "transferring") return

    if (item.direction === "sent") {
      cancelledTransfersRef.current.add(itemId)
    } else if (item.direction === "received") {
      for (const [peerId, buffer] of fileBuffersRef.current.entries()) {
        if (buffer.itemId === itemId) {
          buffer.chunks = []
          fileBuffersRef.current.delete(peerId)
          
          const conn = connectionsRef.current.get(peerId)
          if (conn && conn.open) {
            conn.send({
              type: "file-cancel",
              itemId: buffer.itemId,
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
        notificationSettings,
        notificationPermission,
        updateNotificationSettings,
        requestNotificationPermission,
        testNotification,
      }}
    >
      {children}
    </TransferContext.Provider>
  )
}
