import type { ConnectionQuality } from './types'

const MAX_SAMPLES = 10
const PING_TTL_MS = 5000

type MetricSamples = Map<string, number[]>
type PendingPings = Map<string, Map<string, number>>

function pushSample(store: MetricSamples, peerId: string, value: number) {
  const samples = store.get(peerId) ?? []
  samples.push(value)

  if (samples.length > MAX_SAMPLES) {
    samples.shift()
  }

  store.set(peerId, samples)
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function averagePeerSamples(store: MetricSamples): number | null {
  const peerAverages = Array.from(store.values())
    .map(samples => average(samples))
    .filter((value): value is number => value !== null)

  return average(peerAverages)
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `ping-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function classifyConnectionQuality(latency: number | null): ConnectionQuality['quality'] {
  if (latency === null) {
    return 'unknown'
  }

  if (latency < 50) {
    return 'excellent'
  }
  if (latency < 100) {
    return 'good'
  }
  if (latency < 200) {
    return 'fair'
  }
  return 'poor'
}

export function createConnectionQualityTracker() {
  const pendingPings: PendingPings = new Map()
  const latencyHistoryByPeer: MetricSamples = new Map()
  const bandwidthHistoryByPeer: MetricSamples = new Map()

  const cleanupExpiredPings = (now: number) => {
    for (const [pingId, peerMap] of pendingPings.entries()) {
      const activePeers = Array.from(peerMap.entries()).filter(([, sentAt]) => now - sentAt <= PING_TTL_MS)

      if (activePeers.length === 0) {
        pendingPings.delete(pingId)
        continue
      }

      pendingPings.set(pingId, new Map(activePeers))
    }
  }

  const getSnapshot = (): ConnectionQuality => {
    const latency = averagePeerSamples(latencyHistoryByPeer)
    const bandwidth = averagePeerSamples(bandwidthHistoryByPeer)

    return {
      bandwidth: bandwidth !== null ? Math.round(bandwidth) : null,
      latency: latency !== null ? Math.round(latency) : null,
      quality: classifyConnectionQuality(latency),
    }
  }

  return {
    createPing(peerIds: string[], now = Date.now()) {
      cleanupExpiredPings(now)

      const pingId = generateId()
      pendingPings.set(
        pingId,
        new Map(peerIds.map(peerId => [peerId, now])),
      )
      return pingId
    },

    getSnapshot,

    recordBandwidth(peerId: string, speed: number) {
      if (speed > 0) {
        pushSample(bandwidthHistoryByPeer, peerId, speed)
      }
    },

    recordPong(peerId: string, pingId: string, now = Date.now()) {
      const pendingPeers = pendingPings.get(pingId)
      if (!pendingPeers) {
        return null
      }

      const sentAt = pendingPeers.get(peerId)
      if (sentAt === undefined) {
        return null
      }

      pendingPeers.delete(peerId)
      if (pendingPeers.size === 0) {
        pendingPings.delete(pingId)
      }

      const latency = now - sentAt
      pushSample(latencyHistoryByPeer, peerId, latency)
      return latency
    },

    removePeer(peerId: string) {
      latencyHistoryByPeer.delete(peerId)
      bandwidthHistoryByPeer.delete(peerId)

      for (const [pingId, pendingPeers] of pendingPings.entries()) {
        pendingPeers.delete(peerId)
        if (pendingPeers.size === 0) {
          pendingPings.delete(pingId)
        }
      }
    },

    reset() {
      pendingPings.clear()
      latencyHistoryByPeer.clear()
      bandwidthHistoryByPeer.clear()
    },
  }
}
