"use client"

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react"

export type TransferItem = {
  id: string
  type: "text" | "file"
  name?: string
  content: string
  size?: number
  timestamp: Date
  direction: "sent" | "received"
}

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

type TransferContextType = {
  roomCode: string | null
  connectionStatus: ConnectionStatus
  errorMessage: string | null
  items: TransferItem[]
  createRoom: () => void
  joinRoom: (code: string) => void
  leaveRoom: () => void
  sendText: (text: string) => void
  sendFile: (file: File) => void
  clearHistory: () => void
  peerCount: number
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
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:standard.relay.metered.ca:80",
      username: "b87f50a8d31a88b30e143099",
      credential: "KiLY8EKRZ+OKhMN1",
    },
    {
      urls: "turn:standard.relay.metered.ca:80?transport=tcp",
      username: "b87f50a8d31a88b30e143099",
      credential: "KiLY8EKRZ+OKhMN1",
    },
    {
      urls: "turn:standard.relay.metered.ca:443",
      username: "b87f50a8d31a88b30e143099",
      credential: "KiLY8EKRZ+OKhMN1",
    },
    {
      urls: "turns:standard.relay.metered.ca:443?transport=tcp",
      username: "b87f50a8d31a88b30e143099",
      credential: "KiLY8EKRZ+OKhMN1",
    },
  ],
  iceCandidatePoolSize: 10,
}

export function TransferProvider({ children }: { children: React.ReactNode }) {
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [items, setItems] = useState<TransferItem[]>([])
  const [peerCount, setPeerCount] = useState(0)
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connectionsRef = useRef<Map<string, any>>(new Map())
  const isHostRef = useRef(false)
  const fileBuffersRef = useRef<Map<string, { name: string; size: number; chunks: Uint8Array[]; received: number }>>(new Map())

  const addItem = useCallback((item: Omit<TransferItem, "id" | "timestamp">) => {
    setItems((prev) => [
      ...prev,
      {
        ...item,
        id: crypto.randomUUID(),
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
    const monitorIceState = () => {
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
        setTimeout(monitorIceState, 200)
      }
    }
    setTimeout(monitorIceState, 100)

    conn.on("open", () => {
      if (connectionTimeout) clearTimeout(connectionTimeout)
      connectionsRef.current.set(conn.peer, conn)
      updatePeerCount()
    })

    conn.on("close", () => {
      if (connectionTimeout) clearTimeout(connectionTimeout)
      connectionsRef.current.delete(conn.peer)
      fileBuffersRef.current.delete(conn.peer)
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
          buffer.chunks.push(new Uint8Array(data.chunk))
          buffer.received += data.chunk.length
        }
      } else if (data.type === "file-end") {
        const buffer = fileBuffersRef.current.get(conn.peer)
        if (buffer) {
          const blob = new Blob(buffer.chunks as unknown as BlobPart[])
          const url = URL.createObjectURL(blob)
          addItem({
            type: "file",
            name: buffer.name,
            content: url,
            size: buffer.size,
            direction: "received",
          })
          fileBuffersRef.current.delete(conn.peer)
        }
      }
    })
  }, [addItem, updatePeerCount])

  const createRoom = useCallback(async () => {
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
    isHostRef.current = true

    const peer = new Peer(peerId, {
      debug: 0,
      config: ICE_SERVERS,
      secure: true,
      host: "0.peerjs.com",
      port: 443,
    })

    peer.on("open", () => {
      setConnectionStatus("connecting")
    })

    peer.on("connection", (conn) => {
      setupConnection(conn, false)
    })

    peer.on("error", (err) => {
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
  }, [setupConnection])

  const joinRoom = useCallback(async (code: string) => {
    const { default: Peer } = await import("peerjs")
    
    const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "")
    if (normalizedCode.length !== 6) {
      setErrorMessage("请输入6位房间代码")
      return
    }
    
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
    isHostRef.current = false

    const peer = new Peer({
      debug: 0,
      config: ICE_SERVERS,
      secure: true,
      host: "0.peerjs.com",
      port: 443,
    })

    peer.on("open", () => {
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
  }, [setupConnection])

  const leaveRoom = useCallback(() => {
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
    isHostRef.current = false
  }, [])

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

  const sendFile = useCallback(async (file: File) => {
    const CHUNK_SIZE = 16384

    const url = URL.createObjectURL(file)
    addItem({
      type: "file",
      name: file.name,
      content: url,
      size: file.size,
      direction: "sent",
    })

    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send({
          type: "file-start",
          name: file.name,
          size: file.size,
        })

        let offset = 0
        while (offset < uint8Array.length) {
          const chunk = uint8Array.slice(offset, offset + CHUNK_SIZE)
          conn.send({
            type: "file-chunk",
            chunk: Array.from(chunk),
          })
          offset += CHUNK_SIZE
        }

        conn.send({ type: "file-end" })
      }
    })
  }, [addItem])

  const clearHistory = useCallback(() => {
    setItems([])
  }, [])

  useEffect(() => {
    return () => {
      if (peerRef.current) {
        peerRef.current.destroy()
      }
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
      }}
    >
      {children}
    </TransferContext.Provider>
  )
}
