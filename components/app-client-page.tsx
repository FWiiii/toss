'use client'

import { AppShell } from '@/components/app-shell'
import { PWARegister } from '@/components/pwa-register'
import { useShareTarget } from '@/hooks/use-share-target'
import { AppRuntimeProvider, DEFAULT_STUN_SERVERS } from '@/lib/app-runtime'
import { TransferProvider } from '@/lib/transfer-context'

const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME
const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL
const turnUrls = [
  process.env.NEXT_PUBLIC_TURN_URL,
  process.env.NEXT_PUBLIC_TURN_URL_TCP,
  process.env.NEXT_PUBLIC_TURN_URL_443,
  process.env.NEXT_PUBLIC_TURNS_URL,
].filter((url): url is string => Boolean(url))

const runtime = {
  native: false,
  development: process.env.NODE_ENV === 'development',
  publicRoomOrigin: process.env.NEXT_PUBLIC_ROOM_ORIGIN || '',
  peer: {
    host: process.env.NEXT_PUBLIC_PEER_HOST || '0.peerjs.com',
    port: Number(process.env.NEXT_PUBLIC_PEER_PORT || 443),
    path: process.env.NEXT_PUBLIC_PEER_PATH || '/',
    secure: process.env.NEXT_PUBLIC_PEER_SECURE !== 'false',
    iceServers: turnUsername && turnCredential && turnUrls.length > 0
      ? [...DEFAULT_STUN_SERVERS, { urls: turnUrls, username: turnUsername, credential: turnCredential }]
      : DEFAULT_STUN_SERVERS,
  },
}

function WebAppShell() {
  const shareTarget = useShareTarget()
  return <AppShell shareTarget={shareTarget}><PWARegister /></AppShell>
}

export function AppClientPage() {
  return (
    <AppRuntimeProvider value={runtime}>
      <TransferProvider>
        <WebAppShell />
      </TransferProvider>
    </AppRuntimeProvider>
  )
}
