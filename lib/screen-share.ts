import type { TransferItem } from './types'

export type ScreenShareType = 'screen' | 'window' | 'tab'

interface StreamLike {
  getTracks?: () => Array<{
    stop?: () => void
  }>
}

interface MediaConnectionLike {
  peer?: string
  remoteStream?: unknown
  answer: () => void
  on: (...args: any[]) => unknown
  close?: () => void
}

interface PeerLike {
  call: (peerId: string, stream: MediaStream) => MediaConnectionLike | null | undefined
}

export function normalizeScreenShareType(displaySurface?: string): ScreenShareType {
  if (displaySurface === 'browser') {
    return 'tab'
  }

  if (displaySurface === 'window') {
    return 'window'
  }

  return 'screen'
}

export function bindIncomingScreenShareCall(
  call: MediaConnectionLike,
  onRemoteStream?: (remoteStream: MediaStream, call: MediaConnectionLike) => void,
) {
  let delivered = false

  const deliverStream = (remoteStream: unknown) => {
    if (!remoteStream || delivered) {
      return
    }

    delivered = true
    onRemoteStream?.(remoteStream as MediaStream, call)
  }

  call.on('stream', deliverStream)
  call.answer()
  deliverStream(call.remoteStream)
}

export function stopOutgoingScreenShare({
  stream,
  calls,
  itemId,
  removeItem,
}: {
  stream: StreamLike | null
  calls: Array<{ close?: () => void }>
  itemId: string | null
  removeItem: (itemId: string) => void
}) {
  let changed = false

  if (stream) {
    stream.getTracks?.().forEach((track) => {
      try {
        track.stop?.()
      }
      catch {}
    })
    changed = true
  }

  for (const call of calls) {
    try {
      call.close?.()
      changed = true
    }
    catch {}
  }

  if (itemId) {
    removeItem(itemId)
    changed = true
  }

  return changed
}

export function stopIncomingScreenShare({
  call,
  itemId,
  removeItem,
}: {
  call: { close?: () => void } | null
  itemId: string | null
  removeItem: (itemId: string) => void
}) {
  let changed = false

  if (call) {
    try {
      call.close?.()
      changed = true
    }
    catch {}
  }

  if (itemId) {
    removeItem(itemId)
    changed = true
  }

  return changed
}

export function ensureScreenShareCallForPeer({
  peer,
  peerId,
  stream,
  calls,
  onError,
  onClose,
}: {
  peer: PeerLike
  peerId: string
  stream: MediaStream
  calls: MediaConnectionLike[]
  onError?: (peerId: string, error: unknown) => void
  onClose?: (peerId: string) => void
}) {
  if (calls.some(call => call.peer === peerId)) {
    return calls
  }

  const call = peer.call(peerId, stream)
  if (!call) {
    return calls
  }

  call.on('error', (error: unknown) => {
    onError?.(peerId, error)
  })
  call.on('close', () => {
    onClose?.(peerId)
  })

  return [...calls, call]
}

export function isSentScreenShareItem(item: Pick<TransferItem, 'type' | 'direction'>) {
  return item.type === 'stream' && item.direction === 'sent'
}
