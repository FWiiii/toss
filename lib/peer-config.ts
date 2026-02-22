/**
 * PeerJS configuration and WebRTC utilities
 */

import type { ConnectionType, ConnectionInfo } from "./types"

// Prefix to avoid collision with other PeerJS apps
export const PEER_PREFIX = "snapdrop-room-"

/**
 * Generate a 6-character room code
 */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * Build ICE servers configuration with optional TURN servers
 */
function buildIceServers(): RTCIceServer[] {
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

/**
 * ICE servers configuration for PeerJS
 */
export const ICE_SERVERS = {
  iceServers: buildIceServers(),
  iceCandidatePoolSize: 10,
}

/**
 * PeerJS connection options
 */
export function getPeerOptions(forceRelay = false) {
  return {
    debug: 0,
    config: {
      ...ICE_SERVERS,
      iceTransportPolicy: forceRelay ? "relay" : "all",
    },
    secure: true,
    host: "0.peerjs.com",
    port: 443,
  }
}

export const PEER_OPTIONS = getPeerOptions(false)

/**
 * Detect connection type from RTCPeerConnection stats
 */
export async function detectConnectionType(pc: RTCPeerConnection): Promise<ConnectionInfo> {
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

/**
 * Chunk size for file transfers (16KB)
 */
export const FILE_CHUNK_SIZE = 16384
export const FILE_CHUNK_MIN_SIZE = 8192
export const FILE_CHUNK_MAX_SIZE = 131072

/**
 * Wait timeout for transfer resume after temporary disconnection.
 */
export const FILE_RESUME_WAIT_TIMEOUT = 30000

/**
 * Maximum reconnection attempts
 */
export const MAX_RECONNECT_ATTEMPTS = 5

/**
 * Connection timeout in milliseconds
 */
export const CONNECTION_TIMEOUT = 20000
