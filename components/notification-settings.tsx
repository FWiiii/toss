'use client'

import type { LocalDeviceProfile, TrustedDeviceRecord } from '@/lib/trusted-devices'
import { Bell, Monitor, Moon, Server, Settings, Shield, Smartphone, Sun, Trash2, Volume2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useMemo, useReducer, useState } from 'react'
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
import { Input } from './ui/input'

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
  localDeviceProfile: LocalDeviceProfile
  trustedDevices: TrustedDeviceRecord[]
  onUpdateLocalDeviceName: (deviceName: string) => void
  onRemoveTrustedDevice: (deviceId: string) => void
}

function DeviceTrustSection({
  localDeviceProfile,
  trustedDevices,
  onUpdateLocalDeviceName,
  onRemoveTrustedDevice,
}: Pick<NotificationSettingsProps, 'localDeviceProfile' | 'trustedDevices' | 'onUpdateLocalDeviceName' | 'onRemoveTrustedDevice'>) {
  const [deviceNameDraft, setDeviceNameDraft] = useState(localDeviceProfile.deviceName)
  const trustedDeviceCountLabel = useMemo(() => {
    if (trustedDevices.length === 0) {
      return '暂无'
    }
    return `${trustedDevices.length} 台`
  }, [trustedDevices.length])

  const handleSaveDeviceName = () => {
    const nextName = deviceNameDraft.trim()
    if (!nextName || nextName === localDeviceProfile.deviceName) {
      setDeviceNameDraft(localDeviceProfile.deviceName)
      return
    }

    onUpdateLocalDeviceName(nextName)
  }

  const formatTrustedAt = (timestamp: number) => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return '未知'
    }
    return new Date(timestamp).toISOString().slice(0, 10)
  }

  return (
    <div className="space-y-3 px-2 py-2">
      <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">本机设备名</p>
          <p className="text-xs text-muted-foreground">
            当前设备 ID：
            {' '}
            {localDeviceProfile.deviceId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={deviceNameDraft}
            onChange={event => setDeviceNameDraft(event.target.value)}
            maxLength={64}
            aria-label="本机设备名"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleSaveDeviceName()
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            onClick={handleSaveDeviceName}
            disabled={deviceNameDraft.trim().length === 0 || deviceNameDraft.trim() === localDeviceProfile.deviceName}
          >
            保存
          </Button>
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">已信任设备</p>
            <p className="text-xs text-muted-foreground">
              已记住会自动接收的设备，当前
              {' '}
              {trustedDeviceCountLabel}
            </p>
          </div>
        </div>

        {trustedDevices.length === 0
          ? (
              <p className="text-xs text-muted-foreground">
                还没有已信任设备。你在接收确认中选择“信任此设备”后，会出现在这里。
              </p>
            )
          : (
              <div className="space-y-2">
                {trustedDevices.map(device => (
                  <div
                    key={device.deviceId}
                    className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-background/80 px-3 py-2"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {device.deviceName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {device.deviceId}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        信任于
                        {' '}
                        {formatTrustedAt(device.trustedAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onRemoveTrustedDevice(device.deviceId)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>移除信任</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
      </div>
    </div>
  )
}

export function NotificationSettings({
  settings,
  connectionSettings,
  notificationPermission,
  onUpdateSettings,
  onUpdateConnectionSettings,
  onRequestPermission,
  localDeviceProfile,
  trustedDevices,
  onUpdateLocalDeviceName,
  onRemoveTrustedDevice,
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
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-1rem))]">
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

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2">
          <Shield className="h-4 w-4" />
          <span>设备与信任</span>
        </DropdownMenuLabel>
        <DeviceTrustSection
          key={`${localDeviceProfile.deviceId}:${localDeviceProfile.deviceName}`}
          localDeviceProfile={localDeviceProfile}
          trustedDevices={trustedDevices}
          onUpdateLocalDeviceName={onUpdateLocalDeviceName}
          onRemoveTrustedDevice={onRemoveTrustedDevice}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
