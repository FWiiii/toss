// Shared type definitions

export type TransferStatus = "pending" | "transferring" | "completed" | "error"

export type TransferItem = {
  id: string
  type: "text" | "file" | "system"
  name?: string
  content: string
  size?: number
  timestamp: Date
  direction: "sent" | "received" | "system"
  // Progress tracking for file transfers
  status?: TransferStatus
  progress?: number // 0-100
  transferredBytes?: number
  speed?: number // bytes per second
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error" | "dissolved" | "reconnecting"

// Connection type based on ICE candidate type
export type ConnectionType = 
  | "direct"     // host candidate - direct local network connection
  | "stun"       // srflx/prflx candidate - NAT traversal via STUN (still P2P)
  | "relay"      // relay candidate - traffic relayed through TURN server
  | "unknown"    // not yet determined

export type ConnectionInfo = {
  type: ConnectionType
  localAddress?: string
  remoteAddress?: string
  protocol?: "udp" | "tcp"
}

export type ConnectionQuality = {
  latency: number | null // ms (ping time)
  bandwidth: number | null // bytes per second (estimated from recent transfers)
  quality: "excellent" | "good" | "fair" | "poor" | "unknown"
  packetLoss?: number // percentage (0-100)
}

export type SharedDataFile = {
  name: string
  type: string
  size: number
  data: string // base64
}

export type SharedData = {
  title: string
  text: string
  url: string
  files: SharedDataFile[]
  timestamp: number
}
