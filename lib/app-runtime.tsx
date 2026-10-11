import type { ReactNode } from 'react'
import { createContext, use } from 'react'

export interface AppRuntime {
  native: boolean
  development: boolean
  publicRoomOrigin: string
  peer: {
    host: string
    port: number
    path: string
    secure: boolean
    iceServers: RTCIceServer[]
  }
}

export const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  { urls: 'stun:stun.voipgate.com:3478' },
]

const RuntimeContext = createContext<AppRuntime | null>(null)

export function AppRuntimeProvider({ value, children }: { value: AppRuntime, children: ReactNode }) {
  return <RuntimeContext value={value}>{children}</RuntimeContext>
}

export function useAppRuntime(): AppRuntime {
  const runtime = use(RuntimeContext)
  if (!runtime)
    throw new Error('AppRuntimeProvider is required')
  return runtime
}
