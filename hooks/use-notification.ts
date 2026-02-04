import { useCallback, useEffect, useRef, useState } from "react"

interface NotificationSettings {
  soundEnabled: boolean
  browserNotificationEnabled: boolean
  vibrationEnabled: boolean
}

const DEFAULT_SETTINGS: NotificationSettings = {
  soundEnabled: true,
  browserNotificationEnabled: true,
  vibrationEnabled: true,
}

const STORAGE_KEY = "toss-notification-settings"
const DEBUG_LOGS = process.env.NODE_ENV !== "production"

export function useNotification() {
  const [settings, setSettings] = useState<NotificationSettings>(() => {
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

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default")
  const audioContextRef = useRef<AudioContext | null>(null)

  // Check notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission)
    }
  }, [])

  // Save settings to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    }
  }, [settings])

  // Initialize AudioContext lazily
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return audioContextRef.current
  }, [])

  // Play notification sound using Web Audio API
  const playSound = useCallback(() => {
    if (!settings.soundEnabled) return

    try {
      const audioContext = getAudioContext()
      
      // Create a pleasant notification sound
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      // Two-tone notification sound
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1)
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)
      
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    } catch (error) {
      console.error("Failed to play sound:", error)
    }
  }, [settings.soundEnabled, getAudioContext])

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "denied" as NotificationPermission
    }

    if (Notification.permission === "granted") {
      setNotificationPermission("granted")
      return "granted" as NotificationPermission
    }

    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
      return permission
    }

    return Notification.permission
  }, [])

  // Show browser notification
  const showNotification = useCallback(async (title: string, options?: NotificationOptions, force = false) => {
    // Only check settings if not forced (allow test notification to bypass settings)
    if (!force && !settings.browserNotificationEnabled) return

    // Don't show notification if page is focused (unless forced for testing)
    if (!force && typeof document !== "undefined" && !document.hidden) return

    if (typeof window === "undefined" || !("Notification" in window)) {
      console.log("Notification API not supported")
      return
    }

    let permission = Notification.permission
    if (DEBUG_LOGS) {
      console.log("Current notification permission:", permission)
    }

    if (permission === "default") {
      if (DEBUG_LOGS) {
        console.log("Requesting notification permission...")
      }
      permission = await requestNotificationPermission()
      if (DEBUG_LOGS) {
        console.log("Permission after request:", permission)
      }
    }

    if (permission === "granted") {
      try {
        if (DEBUG_LOGS) {
          console.log("Creating notification:", title)
        }
        const notification = new Notification(title, {
          icon: "/logo-rounded.svg",
          badge: "/logo-rounded.svg",
          ...options,
        })

        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000)

        // Focus window when notification is clicked
        notification.onclick = () => {
          window.focus()
          notification.close()
        }
        if (DEBUG_LOGS) {
          console.log("Notification created successfully")
        }
      } catch (error) {
        console.error("Failed to show notification:", error)
      }
    } else {
      if (DEBUG_LOGS) {
        console.log("Notification permission denied or not granted:", permission)
      }
    }
  }, [settings.browserNotificationEnabled, requestNotificationPermission])

  // Trigger vibration on mobile devices
  const vibrate = useCallback((pattern: number | number[] = 200) => {
    if (!settings.vibrationEnabled) return

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern)
      } catch (error) {
        console.error("Failed to vibrate:", error)
      }
    }
  }, [settings.vibrationEnabled])

  // Notify on received content
  const notifyReceived = useCallback((type: "text" | "image" | "file", filename?: string) => {
    // Play sound
    playSound()

    // Vibrate on mobile
    vibrate([100, 50, 100])

    // Show browser notification
    const messages = {
      text: "收到文本消息",
      image: "收到图片",
      file: filename ? `收到文件: ${filename}` : "收到文件",
    }

    showNotification("Toss - 新内容", {
      body: messages[type],
      tag: "toss-received",
      renotify: false,
    })
  }, [playSound, vibrate, showNotification])

  // Test notification (force show even if page is visible)
  const testNotification = useCallback(() => {
    // Play sound
    playSound()

    // Vibrate on mobile
    vibrate([100, 50, 100, 50, 100])

    // Force show browser notification even if page is focused
    showNotification("Toss - 测试通知", {
      body: "通知功能正常工作 ✓",
      tag: "toss-test",
      renotify: true,
    }, true) // force = true
  }, [playSound, vibrate, showNotification])

  // Update settings
  const updateSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }))
  }, [])

  return {
    settings,
    updateSettings,
    notificationPermission,
    requestNotificationPermission,
    playSound,
    showNotification,
    vibrate,
    notifyReceived,
    testNotification,
  }
}
