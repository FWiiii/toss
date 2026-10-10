'use client'

import Image from 'next/image'
import { RoomErrorBoundary, TransferErrorBoundary } from '@/components/error-boundary'
import { NotificationSettings } from '@/components/notification-settings'
import { PWARegister } from '@/components/pwa-register'
import { RoomPanel } from '@/components/room-panel'
import { TransferPanel } from '@/components/transfer-panel'
import { TransferProvider, useTransfer } from '@/lib/transfer-context'
import { cn } from '@/lib/utils'

const SHELL_CONTAINER = 'mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8'

function AppHeader() {
  const {
    notificationSettings,
    notificationPermission,
    updateNotificationSettings,
    requestNotificationPermission,
    connectionSettings,
    updateConnectionSettings,
    localDeviceProfile,
    trustedDevices,
    updateLocalDeviceName,
    removeTrustedDevice,
  } = useTransfer()

  return (
    <header className="sticky inset-x-0 top-0 z-50 shrink-0 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className={`${SHELL_CONTAINER} flex h-14 items-center justify-between lg:h-[4.25rem]`}>
        <div className="flex items-center gap-3">
          <div className="group relative flex h-9 w-9 items-center justify-center rounded-full bg-card ring-1 ring-border/80 shadow-sm before:absolute before:-inset-1 before:rounded-full before:bg-accent/10 before:opacity-0 before:blur-md before:transition-opacity hover:before:opacity-100 lg:h-10 lg:w-10">
            <Image
              src="/logo.svg"
              alt="Toss"
              width={36}
              height={36}
              priority
              className="relative z-10 h-7 w-7 rounded-full lg:h-8 lg:w-8"
            />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-foreground lg:text-base">Toss</h1>
            <p className="text-[11px] text-muted-foreground">跨设备分享</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationSettings
            settings={notificationSettings}
            notificationPermission={notificationPermission}
            onUpdateSettings={updateNotificationSettings}
            onRequestPermission={requestNotificationPermission}
            connectionSettings={connectionSettings}
            onUpdateConnectionSettings={updateConnectionSettings}
            localDeviceProfile={localDeviceProfile}
            trustedDevices={trustedDevices}
            onUpdateLocalDeviceName={updateLocalDeviceName}
            onRemoveTrustedDevice={removeTrustedDevice}
          />
        </div>
      </div>
    </header>
  )
}

function AppShell() {
  const { roomCode, connectionStatus } = useTransfer()
  const showSplitLayout = Boolean(roomCode) || connectionStatus !== 'disconnected'

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main
        className={cn(
          SHELL_CONTAINER,
          'flex flex-1 flex-col gap-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:gap-5 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pt-6 md:pb-6',
          showSplitLayout && 'lg:grid lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] lg:items-start',
        )}
      >
        <div className={cn('delight-fade-up min-w-0', !showSplitLayout && 'mx-auto w-full max-w-[38rem]', showSplitLayout && 'lg:sticky lg:top-24 lg:w-full lg:max-w-[24rem] lg:self-start')} style={{ animationDelay: '70ms' }}>
          <RoomErrorBoundary>
            <RoomPanel />
          </RoomErrorBoundary>
        </div>

        <div className={cn('delight-fade-up min-w-0', showSplitLayout && 'lg:min-w-0 lg:flex-1', !showSplitLayout && 'mx-auto w-full max-w-[38rem]')} style={{ animationDelay: '130ms' }}>
          <TransferErrorBoundary>
            <TransferPanel />
          </TransferErrorBoundary>
        </div>
      </main>

      <PWARegister />
    </div>
  )
}

export function AppClientPage() {
  return (
    <TransferProvider>
      <AppShell />
    </TransferProvider>
  )
}
