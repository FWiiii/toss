"use client"

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react"
import { generateUUID, uint8ToBase64, base64ToUint8 } from "./utils"
import type { TransferItem, ConnectionStatus } from "./types"

export type { TransferItem, ConnectionStatus }

type TransferContextType = {
  roomCode: string | null
  connectionStatus: ConnectionStatus
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
  isSending: boolean
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

export function TransferProvider({ children }: { children: React.ReactNode }) {
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [items, setItems] = useState<TransferItem[]>([])
  const [peerCount, setPeerCount] = useState(0)
  const [isHost, setIsHost] = useState(false)
  
  // Loading states
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [isJoiningRoom, setIsJoiningRoom] = useState(false)
  const [isSending, setIsSending] = useState(false)
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connectionsRef = useRef<Map<string, any>>(new Map())
  const fileBuffersRef = useRef<Map<string, { name: string; size: number; chunks: Uint8Array[]; received: number }>>(new Map())
  // Track Blob URLs for cleanup to prevent memory leaks
  const blobUrlsRef = useRef<Set<string>>(new Set())
  
  // Revoke all tracked Blob URLs to free memory
  const revokeAllBlobUrls = useCallback(() => {
    blobUrlsRef.current.forEach(url => {
      try {
        URL.revokeObjectURL(url)
      } catch {}
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

  const updatePeerCount = useCallback(() => {
    const count = connectionsRef.current.size
    setPeerCount(count)
    if (count > 0) {
      setConnectionStatus("connected")
      setErrorMessage(null)
    } else if (roomCode) {
      setConnectionStatus("connecting")
    }
  }, [roomCode])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setupConnection = useCallback((conn: any, isOutgoing = false) => {
    let connectionTimeout: NodeJS.Timeout | null = null
    
    if (isOutgoing) {
      connectionTimeout = setTimeout(() => {
        if (!conn.open) {
          conn.close()
          setConnectionStatus("error")
          setErrorMessage("连接超时，请确保两个设备能够互相访问（同一网络或允许 P2P 连接）")
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
                setConnectionStatus("error")
                setErrorMessage("连接失败，请确保两设备在同一网络或允许 P2P 连接")
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
        connectionsRef.current.forEach((c) => {
          if (c.peer !== conn.peer && c.open) {
            try {
              c.send({ type: "peer-joined" })
            } catch {}
          }
        })
      }
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
    })

    conn.on("error", () => {
      if (connectionTimeout) clearTimeout(connectionTimeout)
      connectionsRef.current.delete(conn.peer)
      if (isOutgoing && connectionsRef.current.size === 0) {
        setConnectionStatus("error")
        setErrorMessage("连接失败，请重试")
      }
      updatePeerCount()
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conn.on("data", (data: any) => {
      if (data.type === "text") {
        addItem({
          type: "text",
          content: data.content,
          direction: "received",
        })
      } else if (data.type === "file-start") {
        fileBuffersRef.current.set(conn.peer, {
          name: data.name,
          size: data.size,
          chunks: [],
          received: 0,
        })
      } else if (data.type === "file-chunk") {
        const buffer = fileBuffersRef.current.get(conn.peer)
        if (buffer) {
          const bytes = base64ToUint8(data.data)
          buffer.chunks.push(bytes)
          buffer.received += bytes.length
        }
      } else if (data.type === "file-end") {
        const buffer = fileBuffersRef.current.get(conn.peer)
        if (buffer) {
          const blob = new Blob(buffer.chunks as unknown as BlobPart[])
          const url = createTrackedBlobUrl(blob)
          addItem({
            type: "file",
            name: buffer.name,
            content: url,
            size: buffer.size,
            direction: "received",
          })
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
        connectionsRef.current.forEach((c) => {
          try { c.close() } catch {}
        })
        connectionsRef.current.clear()
        if (peerRef.current) {
          try { peerRef.current.destroy() } catch {}
          peerRef.current = null
        }
        setPeerCount(0)
      } else if (data.type === "peer-joined") {
        addSystemMessage("有新设备加入了房间")
      }
    })
  }, [addItem, addSystemMessage, updatePeerCount, createTrackedBlobUrl])

  const createRoom = useCallback(async () => {
    setIsCreatingRoom(true)
    
    try {
      const { default: Peer } = await import("peerjs")
      
      const code = generateRoomCode()
      const peerId = PEER_PREFIX + code
      
      // Clean up any existing connections and peer
      connectionsRef.current.forEach((conn) => {
        try { conn.close() } catch {}
      })
      connectionsRef.current.clear()
      fileBuffersRef.current.clear()
      
      if (peerRef.current) {
        try { peerRef.current.destroy() } catch {}
        peerRef.current = null
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
          setConnectionStatus("error")
          setErrorMessage("网络错误，请检查网络连接")
        } else {
          setConnectionStatus("error")
          setErrorMessage(`连接错误: ${err.type}`)
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
      setConnectionStatus("error")
      setErrorMessage("创建房间失败，请重试")
    }
  }, [setupConnection])

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
      connectionsRef.current.forEach((conn) => {
        try { conn.close() } catch {}
      })
      connectionsRef.current.clear()
      fileBuffersRef.current.clear()
      
      if (peerRef.current) {
        try { peerRef.current.destroy() } catch {}
        peerRef.current = null
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
          setConnectionStatus("error")
          setErrorMessage("无法创建连接")
        }
      })

      peer.on("connection", (conn) => {
        setupConnection(conn, false)
      })

      peer.on("error", (err) => {
        setIsJoiningRoom(false)
        if (err.type === "peer-unavailable") {
          setConnectionStatus("error")
          setErrorMessage("找不到房间，请检查代码是否正确，或房间可能已关闭")
        } else if (err.type === "network" || err.type === "server-error") {
          setConnectionStatus("error")
          setErrorMessage("无法连接到信令服务器，请检查网络")
        } else {
          setConnectionStatus("error")
          setErrorMessage(`连接错误: ${err.type}`)
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
      setConnectionStatus("error")
      setErrorMessage("加入房间失败，请重试")
    }
  }, [setupConnection])

  const leaveRoom = useCallback(() => {
    // If host, notify all guests that room is being dissolved
    if (isHost) {
      connectionsRef.current.forEach((conn) => {
        try {
          if (conn.open) {
            conn.send({ type: "room-dissolved" })
          }
        } catch {}
      })
    }
    
    // Small delay to ensure messages are sent before closing
    setTimeout(() => {
      // Close all connections gracefully
      connectionsRef.current.forEach((conn) => {
        try { conn.close() } catch {}
      })
      connectionsRef.current.clear()
      fileBuffersRef.current.clear()
      
      // Destroy peer connection
      if (peerRef.current) {
        try { 
          peerRef.current.disconnect()
          peerRef.current.destroy() 
        } catch {}
        peerRef.current = null
      }
      
      setRoomCode(null)
      setConnectionStatus("disconnected")
      setErrorMessage(null)
      setPeerCount(0)
      setIsHost(false)
    }, 100)
  }, [isHost])

  const sendText = useCallback((text: string) => {
    if (!text.trim()) return
    
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send({ type: "text", content: text })
      }
    })
    
    addItem({
      type: "text",
      content: text,
      direction: "sent",
    })
  }, [addItem])

  const sendFile = useCallback(async (file: File): Promise<void> => {
    const CHUNK_SIZE = 16384
    
    setIsSending(true)
    
    try {
      const url = createTrackedBlobUrl(file)
      addItem({
        type: "file",
        name: file.name,
        content: url,
        size: file.size,
        direction: "sent",
      })

      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

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
          
          // Small delay every few chunks to let the buffer drain
          if ((offset / CHUNK_SIZE) % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 5))
          }
        }

        conn.send({ type: "file-end" })
      }
    } finally {
      setIsSending(false)
    }
  }, [addItem, createTrackedBlobUrl])

  const clearHistory = useCallback(() => {
    // Revoke all Blob URLs before clearing items to prevent memory leaks
    revokeAllBlobUrls()
    setItems([])
  }, [revokeAllBlobUrls])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Destroy peer connection
      if (peerRef.current) {
        try {
          peerRef.current.destroy()
        } catch {}
        peerRef.current = null
      }
      
      // Close all connections
      connectionsRef.current.forEach((conn) => {
        try { conn.close() } catch {}
      })
      connectionsRef.current.clear()
      
      // Clear file buffers
      fileBuffersRef.current.clear()
      
      // Revoke all Blob URLs to free memory
      blobUrlsRef.current.forEach(url => {
        try {
          URL.revokeObjectURL(url)
        } catch {}
      })
      blobUrlsRef.current.clear()
    }
  }, [])

  return (
    <TransferContext.Provider
      value={{
        roomCode,
        connectionStatus,
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
        isSending,
      }}
    >
      {children}
    </TransferContext.Provider>
  )
}
