"use client"

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react"
import { generateUUID, uint8ToBase64, base64ToUint8 } from "./utils"
import type { TransferItem, ConnectionStatus, ConnectionType, ConnectionInfo } from "./types"
import { useNotification } from "@/hooks/use-notification"

export type { TransferItem, ConnectionStatus, ConnectionType, ConnectionInfo }

type TransferContextType = {
  roomCode: string | null
  connectionStatus: ConnectionStatus
  connectionInfo: ConnectionInfo
  errorMessage: string | null
  items: TransferItem[]
  createRoom: () => void
  joinRoom: (code: string) => void
  leaveRoom: () => void
  sendText: (text: string) => void
  sendFile: (file: File) => Promise<void>
  clearHistory: () => void
  peerCount: number
  isHost: boolean
  // Loading states
  isCreatingRoom: boolean
  isJoiningRoom: boolean
  sendingCount: number // Number of files currently being sent
  // Notification
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

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// Prefix to avoid collision with other PeerJS apps
const PEER_PREFIX = "snapdrop-room-"

// ICE servers configuration with TURN servers for VPN/NAT compatibility
// TURN credentials are loaded from environment variables for security
const buildIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ]
  
  // Add TURN servers if credentials are configured
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL
  
  if (turnUsername && turnCredential) {
    const turnUrls = [
      process.env.NEXT_PUBLIC_TURN_URL,
      process.env.NEXT_PUBLIC_TURN_URL_TCP,
      process.env.NEXT_PUBLIC_TURN_URL_443,
      process.env.NEXT_PUBLIC_TURNS_URL,
    ].filter(Boolean) as string[]
    
    turnUrls.forEach(url => {
      servers.push({
        urls: url,
        username: turnUsername,
        credential: turnCredential,
      })
    })
  }
  
  return servers
}

const ICE_SERVERS = {
  iceServers: buildIceServers(),
  iceCandidatePoolSize: 10,
}

// Detect connection type from RTCPeerConnection stats
async function detectConnectionType(pc: RTCPeerConnection): Promise<ConnectionInfo> {
  try {
    const stats = await pc.getStats()
    let selectedCandidatePairId: string | null = null
    
    // Find the selected candidate pair
    stats.forEach((report) => {
      if (report.type === "transport" && report.selectedCandidatePairId) {
        selectedCandidatePairId = report.selectedCandidatePairId
      }
    })
    
    if (!selectedCandidatePairId) {
      // Fallback: look for nominated candidate pair
      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.nominated && report.state === "succeeded") {
          selectedCandidatePairId = report.id
        }
      })
    }
    
    if (!selectedCandidatePairId) {
      return { type: "unknown" }
    }
    
    // Get the candidate pair
    const candidatePair = stats.get(selectedCandidatePairId)
    if (!candidatePair) {
      return { type: "unknown" }
    }
    
    // Get local and remote candidates
    const localCandidate = stats.get(candidatePair.localCandidateId)
    const remoteCandidate = stats.get(candidatePair.remoteCandidateId)
    
    if (!localCandidate || !remoteCandidate) {
      return { type: "unknown" }
    }
    
    // Determine connection type based on candidate types
    // Priority: if either is relay, it's relay; otherwise check for direct
    const localType = localCandidate.candidateType
    const remoteType = remoteCandidate.candidateType
    
    let connectionType: ConnectionType = "unknown"
    
    if (localType === "relay" || remoteType === "relay") {
      connectionType = "relay"
    } else if (localType === "host" && remoteType === "host") {
      connectionType = "direct"
    } else if (localType === "srflx" || localType === "prflx" || 
               remoteType === "srflx" || remoteType === "prflx") {
      connectionType = "stun"
    } else if (localType === "host" || remoteType === "host") {
      connectionType = "direct"
    }
    
    return {
      type: connectionType,
      localAddress: localCandidate.address || localCandidate.ip,
      remoteAddress: remoteCandidate.address || remoteCandidate.ip,
      protocol: localCandidate.protocol as "udp" | "tcp" | undefined,
    }
  } catch (error) {
    console.error("Failed to detect connection type:", error)
    return { type: "unknown" }
  }
}

export function TransferProvider({ children }: { children: React.ReactNode }) {
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({ type: "unknown" })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [items, setItems] = useState<TransferItem[]>([])
  const [peerCount, setPeerCount] = useState(0)
  const [isHost, setIsHost] = useState(false)
  
  // Loading states
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [isJoiningRoom, setIsJoiningRoom] = useState(false)
  const [sendingCount, setSendingCount] = useState(0)
  
  // Notification hook
  const {
    settings: notificationSettings,
    updateSettings: updateNotificationSettings,
    notificationPermission,
    requestNotificationPermission,
    notifyReceived,
    playSound,
    vibrate,
  } = useNotification()
  
  // Reconnection state
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const maxReconnectAttempts = 5
  const shouldReconnectRef = useRef(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setupConnectionRef = useRef<((conn: any, isOutgoing?: boolean) => void) | null>(null)
  const attemptReconnectRef = useRef<(() => void) | null>(null)
  const joinRoomRef = useRef<((code: string) => Promise<void>) | null>(null)
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connectionsRef = useRef<Map<string, any>>(new Map())
  const fileBuffersRef = useRef<Map<string, { 
    name: string
    size: number
    chunks: Uint8Array[]
    received: number
    itemId: string
    lastTime: number
    lastBytes: number 
  }>>(new Map())
  // Track Blob URLs for cleanup to prevent memory leaks
  const blobUrlsRef = useRef<Set<string>>(new Set())

  // ============ Utility functions to reduce code duplication ============
  
  // Set error state with message
  const setError = useCallback((message: string) => {
    setConnectionStatus("error")
    setErrorMessage(message)
  }, [])

  // Safely close a connection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeClose = (conn: any) => {
    try { conn.close() } catch {}
  }

  // Safely destroy peer
  const destroyPeer = useCallback(() => {
    if (peerRef.current) {
      try {
        peerRef.current.disconnect()
        peerRef.current.destroy()
      } catch {}
      peerRef.current = null
    }
  }, [])

  // Close all connections and clear buffers
  const cleanupConnections = useCallback(() => {
    connectionsRef.current.forEach(safeClose)
    connectionsRef.current.clear()
    fileBuffersRef.current.clear()
  }, [])

  // Full cleanup: connections + peer
  const cleanupAll = useCallback(() => {
    cleanupConnections()
    destroyPeer()
  }, [cleanupConnections, destroyPeer])

  // Broadcast data to all open connections
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broadcastToConnections = useCallback((data: any, excludePeer?: string) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open && conn.peer !== excludePeer) {
        try { conn.send(data) } catch {}
      }
    })
  }, [])
  
  // Revoke all tracked Blob URLs to free memory
  const revokeAllBlobUrls = useCallback(() => {
    blobUrlsRef.current.forEach(url => {
      try { URL.revokeObjectURL(url) } catch {}
    })
    blobUrlsRef.current.clear()
  }, [])

  // Create and track a Blob URL
  const createTrackedBlobUrl = useCallback((blob: Blob | File): string => {
    const url = URL.createObjectURL(blob)
    blobUrlsRef.current.add(url)
    return url
  }, [])

  // Add system message
  const addSystemMessage = useCallback((content: string) => {
    setItems((prev) => [
      ...prev,
      {
        id: generateUUID(),
        type: "system",
        content,
        timestamp: new Date(),
        direction: "system",
      },
    ])
  }, [])

  const addItem = useCallback((item: Omit<TransferItem, "id" | "timestamp">) => {
    setItems((prev) => [
      ...prev,
      {
        ...item,
        id: generateUUID(),
        timestamp: new Date(),
      },
    ])
  }, [])

  // Add item and return the ID for progress updates
  const addItemWithId = useCallback((item: Omit<TransferItem, "id" | "timestamp">): string => {
    const id = generateUUID()
    setItems((prev) => [
      ...prev,
      {
        ...item,
        id,
        timestamp: new Date(),
      },
    ])
    return id
  }, [])

  // Update item progress by ID
  const updateItemProgress = useCallback((id: string, updates: Partial<Pick<TransferItem, "status" | "progress" | "transferredBytes" | "speed" | "content">>) => {
    setItems((prev) => 
      prev.map((item) => 
        item.id === id ? { ...item, ...updates } : item
      )
    )
  }, [])

  const updatePeerCount = useCallback(() => {
    const count = connectionsRef.current.size
    setPeerCount(count)
    if (count > 0) {
      setConnectionStatus("connected")
      setErrorMessage(null)
      // Reset reconnect attempts on successful connection
      reconnectAttemptsRef.current = 0
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    } else if (roomCode && connectionStatus !== "reconnecting") {
      setConnectionStatus("connecting")
    }
  }, [roomCode, connectionStatus])

  // Reconnection logic
  const attemptReconnect = useCallback(() => {
    if (!roomCode || !shouldReconnectRef.current || connectionStatus === "dissolved") {
      return
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setConnectionStatus("error")
      setErrorMessage("重连失败，请手动重新加入房间")
      addSystemMessage("自动重连失败，连接已断开")
      return
    }

    reconnectAttemptsRef.current += 1
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 10000) // Exponential backoff, max 10s
    
    setConnectionStatus("reconnecting")
    setErrorMessage(`正在尝试重新连接... (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`)
    
    reconnectTimeoutRef.current = setTimeout(() => {
      if (!shouldReconnectRef.current) return
      
      addSystemMessage(`正在尝试重新连接 (第 ${reconnectAttemptsRef.current} 次)...`)
      
      // Try to reconnect to the host
      if (isHost) {
        // Host: wait for peers to reconnect
        setConnectionStatus("connecting")
      } else {
        // Guest: try to reconnect to host
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
          // Peer is destroyed, need to rejoin
          if (joinRoomRef.current) {
            joinRoomRef.current(roomCode)
          }
        }
      }
    }, delay)
  }, [roomCode, connectionStatus, isHost, addSystemMessage])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setupConnection = useCallback((conn: any, isOutgoing = false) => {
    let connectionTimeout: NodeJS.Timeout | null = null
    
    if (isOutgoing) {
      connectionTimeout = setTimeout(() => {
        if (!conn.open) {
          conn.close()
          setError("连接超时，请确保两个设备能够互相访问（同一网络或允许 P2P 连接）")
        }
      }, 20000)
    }

    // Monitor ICE state for connection recovery
    let monitorAttempts = 0
    const maxMonitorAttempts = 25 // 5 seconds max (25 * 200ms)
    
    const monitorIceState = () => {
      // Stop monitoring if connection is already closed or max attempts reached
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
      
      // Send join notification to all other peers (host does this)
      if (!isOutgoing) {
        // This is an incoming connection (we are host)
        addSystemMessage("有新设备加入了房间")
        // Notify all existing connections about the new peer
        broadcastToConnections({ type: "peer-joined" }, conn.peer)
      }
      
      // Detect connection type after ICE stabilizes
      const detectType = async () => {
        const pc = conn.peerConnection as RTCPeerConnection | undefined
        if (pc && pc.connectionState === "connected") {
          const info = await detectConnectionType(pc)
          setConnectionInfo(info)
        } else if (pc) {
          // Wait for connection to stabilize
          setTimeout(detectType, 1000)
        }
      }
      // Start detection after a short delay
      setTimeout(detectType, 500)
    })

    conn.on("close", () => {
      if (connectionTimeout) clearTimeout(connectionTimeout)
      const wasConnected = connectionsRef.current.has(conn.peer)
      connectionsRef.current.delete(conn.peer)
      fileBuffersRef.current.delete(conn.peer)
      
      // Show message when peer disconnects
      if (wasConnected) {
        addSystemMessage("有设备断开了连接")
      }
      
      updatePeerCount()
      
      // Attempt to reconnect if no peers left and room is still active
      if (connectionsRef.current.size === 0 && roomCode && shouldReconnectRef.current && attemptReconnectRef.current) {
        attemptReconnectRef.current()
      }
    })

    conn.on("error", (err) => {
      console.error("Connection error:", err)
      if (connectionTimeout) clearTimeout(connectionTimeout)
      connectionsRef.current.delete(conn.peer)
      
      updatePeerCount()
      
      // Attempt to reconnect if this was our only connection
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
        // Notify user of received text
        notifyReceived("text")
      } else if (data.type === "file-start") {
        // Create item with progress tracking
        const itemId = addItemWithId({
          type: "file",
          name: data.name,
          content: "", // Will be set when complete
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
          itemId, // Track the item ID for progress updates
          lastTime: Date.now(),
          lastBytes: 0,
        })
      } else if (data.type === "file-chunk") {
        const buffer = fileBuffersRef.current.get(conn.peer)
        if (buffer) {
          const bytes = base64ToUint8(data.data)
          buffer.chunks.push(bytes)
          buffer.received += bytes.length
          
          // Update progress periodically
          const chunkCount = buffer.chunks.length
          if (chunkCount % 10 === 0 || buffer.received >= buffer.size) {
            const now = Date.now()
            const timeDiff = (now - (buffer.lastTime || now)) / 1000
            const bytesDiff = buffer.received - (buffer.lastBytes || 0)
            const speed = timeDiff > 0 ? Math.round(bytesDiff / timeDiff) : 0
            
            updateItemProgress(buffer.itemId, {
              progress: Math.round((buffer.received / buffer.size) * 100),
              transferredBytes: buffer.received,
              speed,
            })
            
            buffer.lastTime = now
            buffer.lastBytes = buffer.received
          }
        }
      } else if (data.type === "file-end") {
        const buffer = fileBuffersRef.current.get(conn.peer)
        if (buffer) {
          const blob = new Blob(buffer.chunks as unknown as BlobPart[])
          const url = createTrackedBlobUrl(blob)
          
          // Update item with final content and completed status
          updateItemProgress(buffer.itemId, {
            content: url,
            status: "completed",
            progress: 100,
            transferredBytes: buffer.size,
            speed: undefined,
          })
          
          // Notify user of received file
          const fileType = buffer.name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ? "image" : "file"
          notifyReceived(fileType, buffer.name)
          
          // Clear chunks to free memory immediately
          buffer.chunks = []
          fileBuffersRef.current.delete(conn.peer)
        }
      } else if (data.type === "room-dissolved") {
        // Host has closed the room
        addSystemMessage("房主已解散房间")
        setConnectionStatus("dissolved")
        setErrorMessage("房间已解散")
        // Clean up
        cleanupAll()
        setPeerCount(0)
      } else if (data.type === "peer-joined") {
        addSystemMessage("有新设备加入了房间")
      }
    })
  }, [addItem, addItemWithId, updateItemProgress, addSystemMessage, updatePeerCount, createTrackedBlobUrl, broadcastToConnections, cleanupAll, setError])

  // Store functions in refs to avoid circular dependencies
  useEffect(() => {
    setupConnectionRef.current = setupConnection
    attemptReconnectRef.current = attemptReconnect
  }, [setupConnection, attemptReconnect])

  const createRoom = useCallback(async () => {
    setIsCreatingRoom(true)
    
    try {
      const { default: Peer } = await import("peerjs")
      
      const code = generateRoomCode()
      const peerId = PEER_PREFIX + code
      
      // Clean up any existing connections and peer
      cleanupAll()
      
      // Reset reconnection state
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

      const peer = new Peer(peerId, {
        debug: 0,
        config: ICE_SERVERS,
        secure: true,
        host: "0.peerjs.com",
        port: 443,
      })

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
      
      // Clean up any existing connections and peer before joining
      cleanupAll()
      
      // Reset reconnection state
      shouldReconnectRef.current = true
      reconnectAttemptsRef.current = 0
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      // Small delay to ensure cleanup is complete
      await new Promise(resolve => setTimeout(resolve, 100))
      
      setRoomCode(normalizedCode)
      setConnectionStatus("connecting")
      setErrorMessage(null)
      setIsHost(false)

      const peer = new Peer({
        debug: 0,
        config: ICE_SERVERS,
        secure: true,
        host: "0.peerjs.com",
        port: 443,
      })

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

  // Store joinRoom in ref after it's defined
  useEffect(() => {
    joinRoomRef.current = joinRoom
  }, [joinRoom])

  const leaveRoom = useCallback(() => {
    // Stop any reconnection attempts
    shouldReconnectRef.current = false
    reconnectAttemptsRef.current = 0
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    // If host, notify all guests that room is being dissolved
    if (isHost) {
      broadcastToConnections({ type: "room-dissolved" })
    }
    
    // Small delay to ensure messages are sent before closing
    setTimeout(() => {
      cleanupAll()
      
      setRoomCode(null)
      setConnectionStatus("disconnected")
      setConnectionInfo({ type: "unknown" })
      setErrorMessage(null)
      setPeerCount(0)
      setIsHost(false)
      
      // Allow reconnection for future rooms
      shouldReconnectRef.current = true
    }, 100)
  }, [isHost, broadcastToConnections, cleanupAll])

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
    const CHUNK_SIZE = 16384
    
    // Increment sending count (for UI feedback, but don't block)
    setSendingCount(prev => prev + 1)
    
    try {
      const url = createTrackedBlobUrl(file)
      
      // Add item with initial progress state
      const itemId = addItemWithId({
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
      
      // Track speed calculation
      let lastTime = Date.now()
      let lastBytes = 0

      // Send file to each connection
      for (const conn of connectionsRef.current.values()) {
        if (!conn.open) continue

        conn.send({
          type: "file-start",
          name: file.name,
          size: file.size,
        })

        // Send chunks with small delays to avoid buffer overflow
        let offset = 0
        while (offset < uint8Array.length) {
          const end = Math.min(offset + CHUNK_SIZE, uint8Array.length)
          const chunk = uint8Array.subarray(offset, end)
          
          // Send chunk as base64 string
          conn.send({
            type: "file-chunk",
            data: uint8ToBase64(chunk),
          })
          
          offset = end
          
          // Update progress every 10 chunks
          if ((offset / CHUNK_SIZE) % 10 === 0 || offset >= totalSize) {
            const now = Date.now()
            const timeDiff = (now - lastTime) / 1000 // seconds
            const bytesDiff = offset - lastBytes
            const speed = timeDiff > 0 ? Math.round(bytesDiff / timeDiff) : 0
            
            updateItemProgress(itemId, {
              progress: Math.round((offset / totalSize) * 100),
              transferredBytes: offset,
              speed,
            })
            
            lastTime = now
            lastBytes = offset
            
            // Small delay to let the buffer drain
            await new Promise(resolve => setTimeout(resolve, 5))
          }
        }

        conn.send({ type: "file-end" })
      }
      
      // Mark as completed
      updateItemProgress(itemId, {
        status: "completed",
        progress: 100,
        transferredBytes: totalSize,
        speed: undefined,
      })
    } catch (error) {
      console.error("File send error:", error)
      // You might want to update the item status to "error" here
    } finally {
      // Always decrement sending count
      setSendingCount(prev => Math.max(0, prev - 1))
    }
  }, [addItemWithId, updateItemProgress, createTrackedBlobUrl])

  const clearHistory = useCallback(() => {
    // Revoke all Blob URLs before clearing items to prevent memory leaks
    revokeAllBlobUrls()
    setItems([])
  }, [revokeAllBlobUrls])

  // Test notification
  const testNotification = useCallback(() => {
    playSound()
    vibrate([100, 50, 100, 50, 100])
    notifyReceived("text")
  }, [playSound, vibrate, notifyReceived])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop reconnection attempts
      shouldReconnectRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      // Close all connections and destroy peer
      connectionsRef.current.forEach(safeClose)
      connectionsRef.current.clear()
      fileBuffersRef.current.clear()
      
      if (peerRef.current) {
        try { peerRef.current.destroy() } catch {}
        peerRef.current = null
      }
      
      // Revoke all Blob URLs to free memory
      blobUrlsRef.current.forEach(url => {
        try { URL.revokeObjectURL(url) } catch {}
      })
      blobUrlsRef.current.clear()
    }
  }, [])

  return (
    <TransferContext.Provider
      value={{
        roomCode,
        connectionStatus,
        connectionInfo,
        errorMessage,
        items,
        createRoom,
        joinRoom,
        leaveRoom,
        sendText,
        sendFile,
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
