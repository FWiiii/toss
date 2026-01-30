"use client"

import { Bell, Volume2, Smartphone, Settings, Check } from "lucide-react"
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
  notificationPermission: NotificationPermission
  onUpdateSettings: (settings: Partial<{
    soundEnabled: boolean
    browserNotificationEnabled: boolean
    vibrationEnabled: boolean
  }>) => void
  onRequestPermission: () => void
  onTestNotification: () => void
}

export function NotificationSettings({
  settings,
  notificationPermission,
  onUpdateSettings,
  onRequestPermission,
  onTestNotification,
}: NotificationSettingsProps) {
  const hasVibrationSupport = typeof navigator !== "undefined" && "vibrate" in navigator
  const hasNotificationSupport = typeof window !== "undefined" && "Notification" in window

  const handleNotificationToggle = async () => {
    if (notificationPermission === "default") {
      await onRequestPermission()
    }
    onUpdateSettings({ browserNotificationEnabled: !settings.browserNotificationEnabled })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-0 focus-visible:ring-offset-0">
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
