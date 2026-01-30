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
