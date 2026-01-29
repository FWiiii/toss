"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, X } from "lucide-react"

export function PWARegister() {
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.log("SW registration failed:", err)
      })
    }

    // Handle install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallPrompt(true)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === "accepted") {
        setShowInstallPrompt(false)
      }
      setDeferredPrompt(null)
    }
  }

  if (!showInstallPrompt) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-card border border-border rounded-xl p-4 shadow-lg z-50">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground">安装应用</h3>
          <p className="text-xs text-muted-foreground mt-1">
            安装 Toss 到您的设备，享受更好的体验
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={handleInstall} className="bg-accent text-accent-foreground hover:bg-accent/90">
              安装
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowInstallPrompt(false)}>
              稍后
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 -mt-1 -mr-1"
          onClick={() => setShowInstallPrompt(false)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
