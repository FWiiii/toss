'use client'

import type { ConnectionQuality } from '@/lib/types'
import { useCallback, useRef, useState } from 'react'
import {
  createConnectionQualityTracker,
  HEARTBEAT_INTERVAL_MS,
} from '@/lib/connection-quality'

type ConnectionsRef = React.MutableRefObject<Map<string, any>>

/**
 * Hook for monitoring connection quality (latency and bandwidth)
 */
export function useConnectionQuality(connectionsRef: ConnectionsRef) {
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>({
    latency: null,
    bandwidth: null,
    quality: 'unknown',
  })
  const trackerRef = useRef(createConnectionQualityTracker())

  // Quality monitoring refs
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const qualityIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Update connection quality based on collected metrics
  const updateConnectionQuality = useCallback(() => {
    setConnectionQuality(trackerRef.current.getSnapshot())
  }, [])

  // Send ping to all connected peers
  const sendPing = useCallback(() => {
    const peerIds = Array.from(connectionsRef.current.entries())
      .filter(([, conn]) => conn?.open)
      .map(([peerId]) => peerId)

    if (peerIds.length === 0)
      return

    const pingId = trackerRef.current.createPing(peerIds)

    // Send ping to all connections
    peerIds.forEach((peerId) => {
      const conn = connectionsRef.current.get(peerId)
      try {
        conn.send({ type: 'ping', id: pingId })
      }
      catch (err) {
        console.error('Failed to send ping:', err)
      }
    })
  }, [connectionsRef])

  // Handle pong response
  const handlePong = useCallback((peerId: string, pingId: string) => {
    const latency = trackerRef.current.recordPong(peerId, pingId)
    if (latency !== null) {
      updateConnectionQuality()
    }
  }, [updateConnectionQuality])

  // Record bandwidth measurement
  const recordBandwidth = useCallback((peerId: string, speed: number) => {
    trackerRef.current.recordBandwidth(peerId, speed)
  }, [])

  const touchPeer = useCallback((peerId: string) => {
    trackerRef.current.touchPeer(peerId)
  }, [])

  const isPeerHealthy = useCallback((peerId: string) => {
    return trackerRef.current.isPeerHealthy(peerId)
  }, [])

  const hasHealthyConnections = useCallback(() => {
    const peerIds = Array.from(connectionsRef.current.entries())
      .filter(([, conn]) => conn?.open)
      .map(([peerId]) => peerId)

    if (peerIds.length === 0) {
      return false
    }

    return trackerRef.current.hasHealthyPeer(peerIds)
  }, [connectionsRef])

  const removePeerMetrics = useCallback((peerId: string) => {
    trackerRef.current.removePeer(peerId)
    updateConnectionQuality()
  }, [updateConnectionQuality])

  // Start monitoring connection quality
  const startQualityMonitoring = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
    }
    if (qualityIntervalRef.current) {
      clearInterval(qualityIntervalRef.current)
    }

    pingIntervalRef.current = setInterval(sendPing, HEARTBEAT_INTERVAL_MS)
    qualityIntervalRef.current = setInterval(updateConnectionQuality, 5000)

    sendPing()
  }, [sendPing, updateConnectionQuality])

  // Stop monitoring connection quality
  const stopQualityMonitoring = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
    if (qualityIntervalRef.current) {
      clearInterval(qualityIntervalRef.current)
      qualityIntervalRef.current = null
    }

    trackerRef.current.reset()
    updateConnectionQuality()
  }, [updateConnectionQuality])

  // Cleanup function
  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
    if (qualityIntervalRef.current) {
      clearInterval(qualityIntervalRef.current)
      qualityIntervalRef.current = null
    }

    trackerRef.current.reset()
  }, [])

  return {
    connectionQuality,
    hasHealthyConnections,
    isPeerHealthy,
    removePeerMetrics,
    startQualityMonitoring,
    stopQualityMonitoring,
    touchPeer,
    handlePong,
    recordBandwidth,
    cleanup,
  }
}
