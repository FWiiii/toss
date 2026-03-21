"use client"

import { TransferProvider, useTransfer } from "@/lib/transfer-context"
import { RoomPanel } from "@/components/room-panel"
import { TransferPanel } from "@/components/transfer-panel"
import { PWARegister } from "@/components/pwa-register"
import { ThemeToggle } from "@/components/theme-toggle"
import { NotificationSettings } from "@/components/notification-settings"
import { RoomErrorBoundary, TransferErrorBoundary } from "@/components/error-boundary"
import { ArrowLeftRight, Smartphone, Laptop, Tablet } from "lucide-react"

const SHELL_CONTAINER = "mx-auto w-full max-w-[1200px] px-4 sm:px-6"
const FOOTER_FEATURES = ["端到端加密传输", "局域网高速直连", "全平台兼容", "支持 PWA 使用"]

function AppHeader() {
  const {
    notificationSettings,
    notificationPermission,
    updateNotificationSettings,
    requestNotificationPermission,
    testNotification,
    connectionSettings,
    updateConnectionSettings,
  } = useTransfer()

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-card/90 backdrop-blur-md lg:relative lg:z-auto shrink-0">
      <div className={`${SHELL_CONTAINER} flex h-14 items-center justify-between lg:h-16`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/25 to-transparent ring-1 ring-border/80 lg:h-11 lg:w-11">
            <img src="/logo.svg" alt="Toss" className="h-8 w-8 rounded-full lg:h-9 lg:w-9" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground lg:text-lg">Toss</h1>
            <p className="text-xs text-muted-foreground">跨设备传输</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-1 hidden items-center gap-1 text-muted-foreground sm:flex">
            <Smartphone className="w-4 h-4" />
            <ArrowLeftRight className="w-3 h-3" />
            <Laptop className="w-4 h-4" />
            <ArrowLeftRight className="w-3 h-3" />
            <Tablet className="w-4 h-4" />
          </div>
          <NotificationSettings
            settings={notificationSettings}
            notificationPermission={notificationPermission}
            onUpdateSettings={updateNotificationSettings}
            onRequestPermission={requestNotificationPermission}
            onTestNotification={testNotification}
            connectionSettings={connectionSettings}
            onUpdateConnectionSettings={updateConnectionSettings}
          />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

export default function Home() {
  return (
    <TransferProvider>
      <div className="relative flex min-h-screen flex-col bg-background lg:h-screen lg:overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-0 bg-[radial-gradient(120%_60%_at_50%_0%,color-mix(in_oklch,var(--color-accent)_16%,transparent)_0%,transparent_72%)]" />
        <AppHeader />
        <div className="h-14 lg:hidden shrink-0" />

        <main className={`${SHELL_CONTAINER} flex flex-1 flex-col gap-6 py-5 sm:py-6 lg:min-h-0 lg:flex-row lg:overflow-hidden`}>
          <div className="shrink-0 lg:w-[360px] lg:overflow-y-auto">
            <RoomErrorBoundary>
              <RoomPanel />
            </RoomErrorBoundary>
          </div>

          <div className="flex-1 lg:min-h-0 lg:overflow-hidden">
            <TransferErrorBoundary>
              <TransferPanel />
            </TransferErrorBoundary>
          </div>
        </main>

        <footer className="shrink-0 border-t border-border/70 bg-card/45 py-4">
          <div className={SHELL_CONTAINER}>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              {FOOTER_FEATURES.map((feature) => (
                <span key={feature} className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">
                  {feature}
                </span>
              ))}
            </div>
          </div>
        </footer>

        <PWARegister />
      </div>
    </TransferProvider>
  )
}
