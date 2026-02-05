"use client"

import { Bell, Volume2, Smartphone, Settings, Check, Server } from "lucide-react"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"

interface NotificationSettingsProps {
  settings: {
    soundEnabled: boolean
    browserNotificationEnabled: boolean
    vibrationEnabled: boolean
  }
  connectionSettings: {
    forceRelay: boolean
  }
  notificationPermission: NotificationPermission
  onUpdateSettings: (settings: Partial<{
    soundEnabled: boolean
    browserNotificationEnabled: boolean
    vibrationEnabled: boolean
  }>) => void
  onUpdateConnectionSettings: (settings: Partial<{
    forceRelay: boolean
  }>) => void
  onRequestPermission: () => void
  onTestNotification: () => void
}

export function NotificationSettings({
  settings,
  connectionSettings,
  notificationPermission,
  onUpdateSettings,
  onUpdateConnectionSettings,
  onRequestPermission,
  onTestNotification,
}: NotificationSettingsProps) {
  const hasVibrationSupport = typeof navigator !== "undefined" && "vibrate" in navigator
  const hasNotificationSupport = typeof window !== "undefined" && "Notification" in window
  const hasTurnConfig = Boolean(
    (process.env.NEXT_PUBLIC_TURN_URL || process.env.NEXT_PUBLIC_TURNS_URL || process.env.NEXT_PUBLIC_TURN_URL_443) &&
    process.env.NEXT_PUBLIC_TURN_USERNAME &&
    process.env.NEXT_PUBLIC_TURN_CREDENTIAL
  )

  const handleNotificationToggle = async () => {
    if (notificationPermission === "default") {
      await onRequestPermission()
    }
    onUpdateSettings({ browserNotificationEnabled: !settings.browserNotificationEnabled })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <Settings className="h-4 w-4" />
          <span className="sr-only">通知设置</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {/* Sound */}
        <DropdownMenuItem 
          onClick={() => onUpdateSettings({ soundEnabled: !settings.soundEnabled })}
          className="gap-2 cursor-pointer"
        >
          <Volume2 className="h-4 w-4" />
          <span>声音提示</span>
          {settings.soundEnabled && <Check className="ml-auto h-4 w-4 text-accent" />}
        </DropdownMenuItem>

        {/* Browser Notification */}
        {hasNotificationSupport && (
          <DropdownMenuItem 
            onClick={handleNotificationToggle}
            disabled={notificationPermission === "denied"}
            className="gap-2 cursor-pointer"
          >
            <Bell className="h-4 w-4" />
            <span>浏览器通知</span>
            {settings.browserNotificationEnabled && <Check className="ml-auto h-4 w-4 text-accent" />}
          </DropdownMenuItem>
        )}

        {/* Vibration */}
        {hasVibrationSupport && (
          <DropdownMenuItem 
            onClick={() => onUpdateSettings({ vibrationEnabled: !settings.vibrationEnabled })}
            className="gap-2 cursor-pointer"
          >
            <Smartphone className="h-4 w-4" />
            <span>震动反馈</span>
            {settings.vibrationEnabled && <Check className="ml-auto h-4 w-4 text-accent" />}
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => onUpdateConnectionSettings({ forceRelay: !connectionSettings.forceRelay })}
          disabled={!hasTurnConfig}
          className="gap-2 cursor-pointer"
        >
          <Server className="h-4 w-4" />
          <span>强制中继</span>
          {!hasTurnConfig && (
            <span className="ml-auto text-xs text-muted-foreground">需 TURN</span>
          )}
          {connectionSettings.forceRelay && <Check className="ml-auto h-4 w-4 text-accent" />}
        </DropdownMenuItem>

        {/* Test */}
        <DropdownMenuItem 
          onClick={onTestNotification}
          className="gap-2 cursor-pointer"
        >
          <span className="text-sm">测试通知</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
