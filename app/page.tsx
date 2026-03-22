'use client'

import Image from 'next/image'
import { memo } from 'react'
import { RoomErrorBoundary, TransferErrorBoundary } from '@/components/error-boundary'
import { NotificationSettings } from '@/components/notification-settings'
import { PWARegister } from '@/components/pwa-register'
import { RoomPanel } from '@/components/room-panel'
import { TransferPanel } from '@/components/transfer-panel'
import { TransferProvider, useTransfer } from '@/lib/transfer-context'
import { cn } from '@/lib/utils'

const SHELL_CONTAINER = 'mx-auto w-full max-w-[1200px] px-4 sm:px-6'

const AppHeader = memo(() => {
  const {
    notificationSettings,
    notificationPermission,
    updateNotificationSettings,
    requestNotificationPermission,
    connectionSettings,
    updateConnectionSettings,
  } = useTransfer()

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-card/90 backdrop-blur-md lg:relative lg:z-auto shrink-0">
      <div className={`${SHELL_CONTAINER} flex h-14 items-center justify-between lg:h-16`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-border/80 lg:h-11 lg:w-11">
            <Image
              src="/logo.svg"
              alt="Toss"
              width={36}
              height={36}
              priority
              className="h-8 w-8 rounded-full lg:h-9 lg:w-9"
            />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground lg:text-lg">Toss</h1>
            <p className="text-xs text-muted-foreground">跨设备传输</p>
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
          />
        </div>
      </div>
    </header>
  )
})

const AppShell = memo(() => {
  const { roomCode, connectionStatus } = useTransfer()
  const showSplitLayout = Boolean(roomCode) || connectionStatus !== 'disconnected'

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <AppHeader />
      <div className="h-14 shrink-0 lg:hidden" />

      <main
        className={cn(
          SHELL_CONTAINER,
          'flex flex-1 flex-col gap-5 py-5 sm:py-6',
          showSplitLayout && 'lg:grid lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)]',
        )}
      >
        <div className={cn('min-w-0', !showSplitLayout && 'mx-auto w-full max-w-[36rem]', showSplitLayout && 'lg:sticky lg:top-6 lg:self-start')}>
          <RoomErrorBoundary>
            <RoomPanel />
          </RoomErrorBoundary>
        </div>

        <div className={cn('min-w-0', !showSplitLayout && 'mx-auto w-full max-w-[36rem]')}>
          <TransferErrorBoundary>
            <TransferPanel />
          </TransferErrorBoundary>
        </div>
      </main>

      <PWARegister />
    </div>
  )
})

export default function Home() {
  return (
    <TransferProvider>
      <AppShell />
    </TransferProvider>
  )
}
