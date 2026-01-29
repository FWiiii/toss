"use client"

import { TransferProvider } from "@/lib/transfer-context"
import { RoomPanel } from "@/components/room-panel"
import { TransferPanel } from "@/components/transfer-panel"
import { PWARegister } from "@/components/pwa-register"
import { ThemeToggle } from "@/components/theme-toggle"
import { ArrowLeftRight, Smartphone, Laptop, Tablet } from "lucide-react"

export default function Home() {
  return (
    <TransferProvider>
      <div className="min-h-screen lg:h-screen bg-background flex flex-col lg:overflow-hidden">
        {/* Header - Fixed on mobile, normal on desktop */}
        <header className="fixed top-0 left-0 right-0 z-50 lg:relative lg:z-auto border-b border-border bg-card/95 backdrop-blur-sm shrink-0">
          <div className="container mx-auto px-4 h-14 lg:h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center">
                <img src="/logo.svg" alt="Toss" className="rounded-full"/>
              </div>  
              <div>
                <h1 className="text-base lg:text-lg font-semibold text-foreground">Toss</h1>
                <p className="text-xs text-muted-foreground">跨设备传输</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1 text-muted-foreground">
                <Smartphone className="w-4 h-4" />
                <ArrowLeftRight className="w-3 h-3" />
                <Laptop className="w-4 h-4" />
                <ArrowLeftRight className="w-3 h-3" />
                <Tablet className="w-4 h-4" />
              </div>
              <ThemeToggle />
            </div>
          </div>
        </header>
        {/* Spacer for fixed header on mobile */}
        <div className="h-14 lg:hidden shrink-0" />

        {/* Main Content */}
        <main className="flex-1 container mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6 lg:min-h-0 lg:overflow-hidden">
          {/* Left Panel - Room */}
          <div className="lg:w-[360px] shrink-0 overflow-y-auto">
            <RoomPanel />
          </div>

          {/* Right Panel - Transfer */}
          <div className="flex-1 lg:min-h-0 lg:overflow-hidden">
            <TransferPanel />
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border py-4 shrink-0">
          <div className="container mx-auto px-4 flex flex-col items-center gap-2">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">🔒 端对端加密</span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1">⚡ 局域网直传</span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1">📱 跨平台</span>
              <span className="text-border">·</span>
              <span>支持 PWA 安装</span>
            </div>
          </div>
        </footer>

        <PWARegister />
      </div>
    </TransferProvider>
  )
}
