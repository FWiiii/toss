"use client"

import { useCallback, useEffect, useState } from "react"

interface ConnectionSettings {
  forceRelay: boolean
}

const DEFAULT_SETTINGS: ConnectionSettings = {
  forceRelay: false,
}

const STORAGE_KEY = "toss-connection-settings"

export function useConnectionSettings() {
  const [settings, setSettings] = useState<ConnectionSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
      } catch {
        return DEFAULT_SETTINGS
      }
    }
    return DEFAULT_SETTINGS
  })

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    }
  }, [settings])

  const updateSettings = useCallback((newSettings: Partial<ConnectionSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }))
  }, [])

  return {
    settings,
    updateSettings,
  }
}
