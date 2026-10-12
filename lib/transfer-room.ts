/**
 * 房间管理模块
 * 处理房间创建、加入、离开等逻辑
 */

import type { AppRuntime } from './app-runtime'
import type { ConnectionRefs } from './transfer-connection'
import { generateRoomCode, getPeerOptions, PEER_PREFIX } from './peer-config'
import { ROOM_CODE_LENGTH, sanitizeRoomCode } from './room-code'
import { bindIncomingScreenShareCall } from './screen-share'

export interface RoomCallbacks {
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
  onIncomingScreenShare?: (remoteStream: MediaStream, call: any) => void
}

export function createRoomManagement(
  refs: ConnectionRefs,
  callbacks: RoomCallbacks,
  setupConnection: (conn: any, isOutgoing?: boolean) => void,
  forceRelay: boolean,
  peerConfig: AppRuntime['peer'],
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
  } = callbacks

  // 房间代码冲突时的最大重试次数：无上限重试会在极端情况下空转，
  // 且组件卸载后仍可能继续创建 Peer
  const MAX_CREATE_ROOM_ATTEMPTS = 5

  // leaveRoom 用延迟重置收尾；立刻重新建房或加入房间时必须先取消它，
  // 否则那次清理会抹掉刚建立的新会话。
  let pendingLeaveReset: NodeJS.Timeout | null = null
  const cancelPendingLeaveReset = () => {
    clearTimeout(pendingLeaveReset ?? undefined)
    pendingLeaveReset = null
  }

  const attemptCreateRoom = async (attemptsLeft: number) => {
    cancelPendingLeaveReset()
    setIsCreatingRoom(true)

    try {
      const { default: Peer } = await import('peerjs')

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
      setConnectionStatus('connecting')
      setErrorMessage(null)
      setIsHost(true)

      const peer = new Peer(peerId, getPeerOptions(forceRelay, peerConfig))

      peer.on('open', () => {
        setIsCreatingRoom(false)
        setConnectionStatus('connecting')
      })

      peer.on('connection', (conn) => {
        setupConnection(conn, false)
      })

      peer.on('call', (call) => {
        bindIncomingScreenShareCall(call, callbacks.onIncomingScreenShare)
      })

      peer.on('error', (err) => {
        setIsCreatingRoom(false)
        if (err.type === 'unavailable-id') {
          if (attemptsLeft > 1) {
            setErrorMessage('房间代码已被占用，正在重试...')
            peer.destroy()
            setTimeout(attemptCreateRoom, 500, attemptsLeft - 1)
          }
          else {
            setError('房间代码冲突多次，请稍后重试')
            peer.destroy()
          }
        }
        else if (err.type === 'network' || err.type === 'server-error') {
          setError('网络错误，请检查网络连接')
        }
        else {
          setError(`连接错误: ${err.type}`)
        }
      })

      peer.on('disconnected', () => {
        if (!peer.destroyed) {
          peer.reconnect()
        }
      })

      refs.peerRef.current = peer
    }
    catch {
      setIsCreatingRoom(false)
      setError('创建房间失败，请重试')
    }
  }

  const createRoom = async () => {
    await attemptCreateRoom(MAX_CREATE_ROOM_ATTEMPTS)
  }

  const joinRoom = async (code: string) => {
    cancelPendingLeaveReset()
    const normalizedCode = sanitizeRoomCode(code)
    if (normalizedCode.length !== ROOM_CODE_LENGTH) {
      setErrorMessage('请输入6位房间代码')
      return
    }

    setIsJoiningRoom(true)

    try {
      const { default: Peer } = await import('peerjs')

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
      setConnectionStatus('connecting')
      setErrorMessage(null)
      setIsHost(false)

      const peer = new Peer(getPeerOptions(forceRelay, peerConfig))

      peer.on('open', () => {
        setIsJoiningRoom(false)
        if (refs.connectionsRef.current.has(hostPeerId) || refs.connectingPeersRef.current.has(hostPeerId)) {
          return
        }
        if (!refs.connectingPeersRef.current.begin(hostPeerId)) {
          return
        }
        const conn = peer.connect(hostPeerId, { reliable: true })
        if (conn) {
          setupConnection(conn, true)
        }
        else {
          refs.connectingPeersRef.current.complete(hostPeerId)
          setError('无法创建连接')
        }
      })

      peer.on('connection', (conn) => {
        setupConnection(conn, false)
      })

      peer.on('call', (call) => {
        bindIncomingScreenShareCall(call, callbacks.onIncomingScreenShare)
      })

      peer.on('error', (err) => {
        setIsJoiningRoom(false)
        refs.connectingPeersRef.current.complete(hostPeerId)
        if (err.type === 'peer-unavailable') {
          setError('找不到房间，请检查代码是否正确，或房间可能已关闭')
        }
        else if (err.type === 'network' || err.type === 'server-error') {
          setError('无法连接到信令服务器，请检查网络')
        }
        else {
          setError(`连接错误: ${err.type}`)
        }
      })

      peer.on('disconnected', () => {
        if (!peer.destroyed) {
          peer.reconnect()
        }
      })

      refs.peerRef.current = peer
    }
    catch {
      setIsJoiningRoom(false)
      setError('加入房间失败，请重试')
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
    refs.connectingPeersRef.current.clear()

    if (isHost) {
      await broadcastToConnections({ type: 'room-dissolved' })
    }

    pendingLeaveReset = setTimeout(() => {
      pendingLeaveReset = null
      cleanupAll()

      setRoomCode(null)
      setConnectionStatus('disconnected')
      setConnectionInfo({ type: 'unknown' })
      setErrorMessage(null)
      setPeerCount(0)
      setIsHost(false)

      // 注意：不要在这里把 shouldReconnect 设回 true——用户是主动离开，
      // 下次 createRoom/joinRoom 开始时自然会重新置 true
    }, 100)
  }

  return { createRoom, joinRoom, leaveRoom }
}
