"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { generateUUID } from "@/lib/utils"

type DeviceType = "mobile" | "desktop" | "tablet" | "unknown"

export type NearbyDevice = {
  deviceId: string
  name: string
  peerId: string
  roomCode: string
  deviceType: DeviceType
  lastSeen: number
}

type DeviceProfile = {
  deviceId: string
  name: string
  deviceType: DeviceType
}

type DiscoveryOptions = {
  enabled: boolean
  isHost: boolean
  roomCode: string | null
  peerId: string | null
}

const DEVICE_ID_KEY = "toss-device-id"
const DEVICE_NAME_KEY = "toss-device-name"
const DISCOVERY_POLL_MS = 5000
const HEARTBEAT_MS = 8000

function detectDeviceType(): DeviceType {
  if (typeof navigator === "undefined") return "unknown"
  const ua = navigator.userAgent.toLowerCase()
  if (/ipad|tablet/.test(ua)) return "tablet"
  if (/mobile|iphone|android/.test(ua)) return "mobile"
  return "desktop"
}

function getOrCreateDeviceProfile(): DeviceProfile {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = generateUUID()
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }

  let name = localStorage.getItem(DEVICE_NAME_KEY)
  if (!name) {
    name = `设备-${deviceId.slice(0, 4).toUpperCase()}`
    localStorage.setItem(DEVICE_NAME_KEY, name)
  }

  return {
    deviceId,
    name,
    deviceType: detectDeviceType(),
  }
}

export function useDeviceDiscovery({ enabled, isHost, roomCode, peerId }: DiscoveryOptions) {
  const [profile, setProfile] = useState<DeviceProfile | null>(null)
  const [devices, setDevices] = useState<NearbyDevice[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    setProfile(getOrCreateDeviceProfile())
  }, [])

  const unregister = useCallback(async () => {
    if (!profile) return
    try {
      await fetch("/discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: profile.deviceId,
          action: "unregister",
        }),
      })
    } catch {
      // Ignore errors on cleanup
    }
  }, [profile])

  const register = useCallback(async () => {
    if (!profile || !isHost || !roomCode || !peerId) return
    try {
      await fetch("/discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: profile.deviceId,
          name: profile.name,
          peerId,
          roomCode,
          isHost: true,
          deviceType: profile.deviceType,
        }),
      })
    } catch {
      // Ignore discovery failures
    }
  }, [profile, isHost, roomCode, peerId])

  useEffect(() => {
    if (!profile || !isHost || !roomCode || !peerId) {
      return
    }

    register()
    const interval = setInterval(register, HEARTBEAT_MS)

    return () => {
      clearInterval(interval)
      unregister()
    }
  }, [profile, isHost, roomCode, peerId, register, unregister])

  const refresh = useCallback(async () => {
    if (!profile) return
    setIsLoading(true)
    try {
      const response = await fetch(`/discovery?deviceId=${encodeURIComponent(profile.deviceId)}`)
      if (!response.ok) return
      const data = await response.json() as { devices: NearbyDevice[] }
      if (isMountedRef.current) {
        setDevices(Array.isArray(data.devices) ? data.devices : [])
      }
    } catch {
      if (isMountedRef.current) {
        setDevices([])
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [profile])

  useEffect(() => {
    if (!enabled || !profile) {
      setDevices([])
      return
    }

    refresh()
    const interval = setInterval(refresh, DISCOVERY_POLL_MS)
    return () => clearInterval(interval)
  }, [enabled, profile, refresh])

  return {
    devices,
    isLoading,
    profile,
    refresh,
  }
}
