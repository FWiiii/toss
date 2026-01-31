"use client"

import { useState, useCallback, useRef } from "react"
import { generateUUID } from "@/lib/utils"
import type { ConnectionQuality } from "@/lib/types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConnectionsRef = React.MutableRefObject<Map<string, any>>

/**
 * Hook for monitoring connection quality (latency and bandwidth)
 */
export function useConnectionQuality(connectionsRef: ConnectionsRef) {
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>({
    latency: null,
    bandwidth: null,
    quality: "unknown",
  })

  // Quality monitoring refs
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pendingPingsRef = useRef<Map<string, number>>(new Map())
  const latencyHistoryRef = useRef<number[]>([])
  const bandwidthHistoryRef = useRef<number[]>([])
  const qualityIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Update connection quality based on collected metrics
  const updateConnectionQuality = useCallback(() => {
    const latency = latencyHistoryRef.current.length > 0
      ? latencyHistoryRef.current.reduce((a, b) => a + b, 0) / latencyHistoryRef.current.length
      : null

    const bandwidth = bandwidthHistoryRef.current.length > 0
      ? bandwidthHistoryRef.current.reduce((a, b) => a + b, 0) / bandwidthHistoryRef.current.length
      : null

    let quality: "excellent" | "good" | "fair" | "poor" | "unknown" = "unknown"
    if (latency !== null) {
      if (latency < 50) quality = "excellent"
      else if (latency < 100) quality = "good"
      else if (latency < 200) quality = "fair"
      else quality = "poor"
    }

    setConnectionQuality({
      latency: latency !== null ? Math.round(latency) : null,
      bandwidth: bandwidth !== null ? Math.round(bandwidth) : null,
      quality,
    })
  }, [])

  // Send ping to all connected peers
  const sendPing = useCallback(() => {
    if (connectionsRef.current.size === 0) return

    const pingId = generateUUID()
    const timestamp = Date.now()
    pendingPingsRef.current.set(pingId, timestamp)

    // Clean up old pending pings (older than 5 seconds)
    for (const [id, time] of pendingPingsRef.current.entries()) {
      if (timestamp - time > 5000) {
        pendingPingsRef.current.delete(id)
      }
    }

    // Send ping to all connections
    connectionsRef.current.forEach((conn) => {
      try {
        conn.send({ type: "ping", id: pingId })
      } catch (err) {
        console.error("Failed to send ping:", err)
      }
    })
  }, [connectionsRef])

  // Handle pong response
  const handlePong = useCallback((pingId: string) => {
    const sendTime = pendingPingsRef.current.get(pingId)
    if (sendTime) {
      const latency = Date.now() - sendTime
      pendingPingsRef.current.delete(pingId)
      
      latencyHistoryRef.current.push(latency)
      if (latencyHistoryRef.current.length > 10) {
        latencyHistoryRef.current.shift()
      }
      
      updateConnectionQuality()
    }
  }, [updateConnectionQuality])

  // Record bandwidth measurement
  const recordBandwidth = useCallback((speed: number) => {
    if (speed > 0) {
      bandwidthHistoryRef.current.push(speed)
      if (bandwidthHistoryRef.current.length > 10) {
        bandwidthHistoryRef.current.shift()
      }
    }
  }, [])

  // Start monitoring connection quality
  const startQualityMonitoring = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
    }
    if (qualityIntervalRef.current) {
      clearInterval(qualityIntervalRef.current)
    }

    pingIntervalRef.current = setInterval(sendPing, 3000)
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
    
    pendingPingsRef.current.clear()
    latencyHistoryRef.current = []
    bandwidthHistoryRef.current = []
    setConnectionQuality({
      latency: null,
      bandwidth: null,
      quality: "unknown",
    })
  }, [])

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
  }, [])

  return {
    connectionQuality,
    startQualityMonitoring,
    stopQualityMonitoring,
    handlePong,
    recordBandwidth,
    cleanup,
  }
}
