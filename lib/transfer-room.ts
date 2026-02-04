/**
 * 房间管理模块
 * 处理房间创建、加入、离开等逻辑
 */

import { PEER_PREFIX, PEER_OPTIONS, generateRoomCode } from "./peer-config"
import type { ConnectionRefs } from "./transfer-connection"

export type RoomCallbacks = {
  setIsCreatingRoom: (creating: boolean) => void
  setIsJoiningRoom: (joining: boolean) => void
  setRoomCode: (code: string | null) => void
  setConnectionStatus: (status: any) => void
  setErrorMessage: (message: string | null) => void
  setIsHost: (isHost: boolean) => void
  setError: (message: string) => void
  cleanupAll: () => void
  broadcastToConnections: (data: any) => Promise<void>
  setConnectionInfo: (info: any) => void
  setPeerCount: (count: number) => void
  setSelfPeerId: (peerId: string | null) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createRoomManagement(
  refs: ConnectionRefs,
  callbacks: RoomCallbacks,
  setupConnection: (conn: any, isOutgoing?: boolean) => void
) {
  const {
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
  } = callbacks

  const createRoom = async () => {
    setIsCreatingRoom(true)
    
    try {
      const { default: Peer } = await import("peerjs")
      
      const code = generateRoomCode()
      const peerId = PEER_PREFIX + code
      
      cleanupAll()
      
      refs.shouldReconnectRef.current = true
      refs.reconnectAttemptsRef.current = 0
      if (refs.reconnectTimeoutRef.current) {
        clearTimeout(refs.reconnectTimeoutRef.current)
        refs.reconnectTimeoutRef.current = null
      }
      
      setRoomCode(code)
      setConnectionStatus("connecting")
      setErrorMessage(null)
      setIsHost(true)

      const peer = new Peer(peerId, PEER_OPTIONS)

      peer.on("open", (id) => {
        setIsCreatingRoom(false)
        setConnectionStatus("connecting")
        setSelfPeerId(id)
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

      refs.peerRef.current = peer
    } catch {
      setIsCreatingRoom(false)
      setError("创建房间失败，请重试")
    }
  }

  const joinRoom = async (code: string) => {
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
      
      refs.shouldReconnectRef.current = true
      refs.reconnectAttemptsRef.current = 0
      if (refs.reconnectTimeoutRef.current) {
        clearTimeout(refs.reconnectTimeoutRef.current)
        refs.reconnectTimeoutRef.current = null
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      setRoomCode(normalizedCode)
      setConnectionStatus("connecting")
      setErrorMessage(null)
      setIsHost(false)

      const peer = new Peer(PEER_OPTIONS)

      peer.on("open", (id) => {
        setIsJoiningRoom(false)
        setSelfPeerId(id)
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

      refs.peerRef.current = peer
    } catch {
      setIsJoiningRoom(false)
      setError("加入房间失败，请重试")
    }
  }

  const leaveRoom = async (isHost: boolean) => {
    setIsCreatingRoom(false)
    setIsJoiningRoom(false)
    
    refs.shouldReconnectRef.current = false
    refs.reconnectAttemptsRef.current = 0
    if (refs.reconnectTimeoutRef.current) {
      clearTimeout(refs.reconnectTimeoutRef.current)
      refs.reconnectTimeoutRef.current = null
    }
    
    if (isHost) {
      await broadcastToConnections({ type: "room-dissolved" })
    }
    
    setTimeout(() => {
      cleanupAll()
      
      setRoomCode(null)
      setConnectionStatus("disconnected")
      setConnectionInfo({ type: "unknown" })
      setErrorMessage(null)
      setPeerCount(0)
      setIsHost(false)
      setSelfPeerId(null)
      
      refs.shouldReconnectRef.current = true
    }, 100)
  }

  return { createRoom, joinRoom, leaveRoom }
}
