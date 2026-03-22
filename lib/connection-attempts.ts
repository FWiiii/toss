export interface ConnectionAttemptRegistry {
  begin: (peerId: string) => boolean
  clear: () => void
  complete: (peerId: string) => void
  has: (peerId: string) => boolean
}

export function createConnectionAttemptRegistry(): ConnectionAttemptRegistry {
  const pendingPeerIds = new Set<string>()

  return {
    begin(peerId: string) {
      if (pendingPeerIds.has(peerId)) {
        return false
      }

      pendingPeerIds.add(peerId)
      return true
    },

    clear() {
      pendingPeerIds.clear()
    },

    complete(peerId: string) {
      pendingPeerIds.delete(peerId)
    },

    has(peerId: string) {
      return pendingPeerIds.has(peerId)
    },
  }
}
