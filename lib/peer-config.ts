/**
 * PeerJS configuration and WebRTC utilities
 */

import type { AppRuntime } from './app-runtime'
import type { ConnectionInfo, ConnectionType } from './types'

// Prefix to avoid collision with other PeerJS apps
export const PEER_PREFIX = 'snapdrop-room-'

/**
 * Generate a 6-character room code
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const cryptoRef = globalThis.crypto
  if (cryptoRef?.getRandomValues) {
    const randomValues = cryptoRef.getRandomValues(new Uint8Array(6))
    return Array.from(randomValues, value => chars[value % chars.length]).join('')
  }

  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * PeerJS connection options supplied by the platform runtime
 */
export function getPeerOptions(forceRelay: boolean, peerConfig: AppRuntime['peer']) {
  return {
    debug: 0,
    config: {
      iceServers: peerConfig.iceServers,
      iceCandidatePoolSize: 20,
      bundlePolicy: 'max-bundle' as const,
      rtcpMuxPolicy: 'require' as const,
      iceTransportPolicy: forceRelay ? 'relay' as const : 'all' as const,
    },
    secure: peerConfig.secure,
    host: peerConfig.host,
    port: peerConfig.port,
    path: peerConfig.path,
  }
}

/**
 * Detect connection type from RTCPeerConnection stats
 */
export async function detectConnectionType(pc: RTCPeerConnection): Promise<ConnectionInfo> {
  try {
    const stats = await pc.getStats()
    let selectedCandidatePairId: string | null = null

    // Find the selected candidate pair
    stats.forEach((report) => {
      if (report.type === 'transport' && report.selectedCandidatePairId) {
        selectedCandidatePairId = report.selectedCandidatePairId
      }
    })

    if (!selectedCandidatePairId) {
      // Fallback: look for nominated candidate pair
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
          selectedCandidatePairId = report.id
        }
      })
    }

    if (!selectedCandidatePairId) {
      return { type: 'unknown' }
    }

    // Get the candidate pair
    const candidatePair = stats.get(selectedCandidatePairId)
    if (!candidatePair) {
      return { type: 'unknown' }
    }

    // Get local and remote candidates
    const localCandidate = stats.get(candidatePair.localCandidateId)
    const remoteCandidate = stats.get(candidatePair.remoteCandidateId)

    if (!localCandidate || !remoteCandidate) {
      return { type: 'unknown' }
    }

    // Determine connection type based on candidate types
    const localType = localCandidate.candidateType
    const remoteType = remoteCandidate.candidateType

    let connectionType: ConnectionType = 'unknown'

    if (localType === 'relay' || remoteType === 'relay') {
      connectionType = 'relay'
    }
    else if (localType === 'host' && remoteType === 'host') {
      connectionType = 'direct'
    }
    else if (localType === 'srflx' || localType === 'prflx'
      || remoteType === 'srflx' || remoteType === 'prflx') {
      connectionType = 'stun'
    }
    else if (localType === 'host' || remoteType === 'host') {
      connectionType = 'direct'
    }

    return {
      type: connectionType,
      localAddress: localCandidate.address || localCandidate.ip,
      remoteAddress: remoteCandidate.address || remoteCandidate.ip,
      protocol: localCandidate.protocol as 'udp' | 'tcp' | undefined,
    }
  }
  catch (error) {
    console.error('Failed to detect connection type:', error)
    return { type: 'unknown' }
  }
}

/**
 * Chunk size for file transfers (16KB)
 */
export const FILE_CHUNK_SIZE = 16384
export const FILE_CHUNK_MIN_SIZE = 8192
export const FILE_CHUNK_MAX_SIZE = 131072

/**
 * 单个文件接收上限（4GB）。超过此大小的 file-offer / file-start 直接拒绝，
 * 防止恶意对端声明超大 size 把本地存储写爆。
 */
export const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024 * 1024

/**
 * Wait timeout for transfer resume after temporary disconnection.
 */
export const FILE_RESUME_WAIT_TIMEOUT = 30000

/**
 * Maximum reconnection attempts
 */
export const MAX_RECONNECT_ATTEMPTS = 10

/**
 * Connection timeout in milliseconds
 */
export const CONNECTION_TIMEOUT = 40000

/**
 * Connection timeout for reconnection attempts in milliseconds.
 * 對方可能還在背景/尚未回到前景,較短的逾時讓失敗的嘗試盡快重排,
 * 不必等完整逾時才再試一次。
 */
export const RECONNECT_CONNECTION_TIMEOUT = 20000

/**
 * ICE disconnected grace period - allow brief disconnects to recover
 */
export const ICE_DISCONNECTED_GRACE_PERIOD_MS = 8000
