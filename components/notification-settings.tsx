'use client'

import { Bell, Monitor, Moon, Server, Settings, Smartphone, Sun, Volume2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useReducer } from 'react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

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
  onRequestPermission: () => Promise<NotificationPermission>
}

export function NotificationSettings({
  settings,
  connectionSettings,
  notificationPermission,
  onUpdateSettings,
  onUpdateConnectionSettings,
  onRequestPermission,
}: NotificationSettingsProps) {
  const [isMounted, markMounted] = useReducer(() => true, false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    markMounted()
  }, [markMounted])

  const hasVibrationSupport = isMounted && typeof navigator !== 'undefined' && 'vibrate' in navigator
  const hasNotificationSupport = isMounted && typeof window !== 'undefined' && 'Notification' in window
  const hasTurnConfig = Boolean(
    (process.env.NEXT_PUBLIC_TURN_URL || process.env.NEXT_PUBLIC_TURNS_URL || process.env.NEXT_PUBLIC_TURN_URL_443)
    && process.env.NEXT_PUBLIC_TURN_USERNAME
    && process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
  )

  const handleNotificationToggle = async (nextEnabled: boolean) => {
    if (nextEnabled && notificationPermission === 'denied') {
      return
    }

    if (nextEnabled && notificationPermission === 'default') {
      const permission = await onRequestPermission()
      if (permission !== 'granted') {
        return
      }
    }

    onUpdateSettings({ browserNotificationEnabled: nextEnabled })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="设置" title="设置">
          <Settings className="h-4 w-4" />
          <span className="sr-only">设置</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel>界面</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={isMounted ? theme ?? 'system' : 'system'}
          onValueChange={value => setTheme(value)}
        >
          <DropdownMenuRadioItem value="light" className="gap-2 cursor-pointer">
            <Sun className="h-4 w-4" />
            <span>浅色</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="gap-2 cursor-pointer">
            <Moon className="h-4 w-4" />
            <span>深色</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="gap-2 cursor-pointer">
            <Monitor className="h-4 w-4" />
            <span>跟随系统</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>提醒</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={settings.soundEnabled}
          onCheckedChange={checked => onUpdateSettings({ soundEnabled: checked === true })}
          className="gap-2 cursor-pointer"
        >
          <Volume2 className="h-4 w-4" />
          <span>声音提示</span>
        </DropdownMenuCheckboxItem>

        {/* Browser Notification */}
        {hasNotificationSupport && (
          <DropdownMenuCheckboxItem
            checked={settings.browserNotificationEnabled}
            onCheckedChange={checked => void handleNotificationToggle(checked === true)}
            disabled={notificationPermission === 'denied'}
            className="gap-2 cursor-pointer"
          >
            <Bell className="h-4 w-4" />
            <span>浏览器通知</span>
          </DropdownMenuCheckboxItem>
        )}
        {hasNotificationSupport && notificationPermission === 'denied' && (
          <p className="px-2 pb-1 text-xs text-muted-foreground">
            浏览器已拒绝通知，可在站点权限里重新开启。
          </p>
        )}

        {/* Vibration */}
        {hasVibrationSupport && (
          <DropdownMenuCheckboxItem
            checked={settings.vibrationEnabled}
            onCheckedChange={checked => onUpdateSettings({ vibrationEnabled: checked === true })}
            className="gap-2 cursor-pointer"
          >
            <Smartphone className="h-4 w-4" />
            <span>震动反馈</span>
          </DropdownMenuCheckboxItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>连接</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={connectionSettings.forceRelay}
          onCheckedChange={checked => onUpdateConnectionSettings({ forceRelay: checked === true })}
          disabled={!hasTurnConfig}
          className="gap-2 cursor-pointer"
        >
          <Server className="h-4 w-4" />
          <span>强制中继</span>
          {!hasTurnConfig && (
            <span className="ml-auto text-xs text-muted-foreground">需 TURN</span>
          )}
        </DropdownMenuCheckboxItem>
        {!hasTurnConfig && (
          <p className="px-2 pb-1 text-xs text-muted-foreground">
            未检测到 TURN 配置，当前仅使用直连与穿透。
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
