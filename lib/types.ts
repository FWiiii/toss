// Shared type definitions

export type TransferItem = {
  id: string
  type: "text" | "file" | "system"
  name?: string
  content: string
  size?: number
  timestamp: Date
  direction: "sent" | "received" | "system"
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error" | "dissolved"

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
