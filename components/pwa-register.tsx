'use client'

import { Download, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
}

const INSTALL_PROMPT_DISMISSED_AT_KEY = 'toss-install-prompt-dismissed-at'
const INSTALL_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const IOS_DEVICE_REGEX = /iphone|ipad|ipod/

function detectIos(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  return IOS_DEVICE_REGEX.test(navigator.userAgent.toLowerCase())
}

function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const isLegacyStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  return window.matchMedia('(display-mode: standalone)').matches || isLegacyStandalone
}

function getDismissedAt() {
  try {
    return Number(localStorage.getItem(INSTALL_PROMPT_DISMISSED_AT_KEY) || '0')
  }
  catch {
    return 0
  }
}

function isPromptInCooldown(now: number = Date.now()) {
  const dismissedAt = getDismissedAt()
  return dismissedAt > 0 && now - dismissedAt < INSTALL_PROMPT_COOLDOWN_MS
}

function markInstallPromptDismissed() {
  try {
    localStorage.setItem(INSTALL_PROMPT_DISMISSED_AT_KEY, String(Date.now()))
  }
  catch {
    // Ignore localStorage failures.
  }
}

export function PWARegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos] = useState(detectIos)
  const [isStandalone, setIsStandalone] = useState(detectStandaloneMode)
  const [promptDismissed, setPromptDismissed] = useState(isPromptInCooldown)

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)')

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('SW registration failed:', err)
      })
    }

    const handleStandaloneModeChange = () => {
      const nextStandalone = detectStandaloneMode()
      setIsStandalone(previousStandalone => previousStandalone === nextStandalone ? previousStandalone : nextStandalone)
    }

    // Handle install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      if (isPromptInCooldown())
        return
      const promptEvent = e as BeforeInstallPromptEvent
      promptEvent.preventDefault()
      setDeferredPrompt(promptEvent)
    }

    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      markInstallPromptDismissed()
      setPromptDismissed(true)
    }

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleStandaloneModeChange)
    }
    else {
      media.addListener(handleStandaloneModeChange)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', handleStandaloneModeChange)
      }
      else {
        media.removeListener(handleStandaloneModeChange)
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setPromptDismissed(true)
      }
      else {
        markInstallPromptDismissed()
        setPromptDismissed(true)
      }
      setDeferredPrompt(null)
    }
  }

  const handleDismissPrompt = () => {
    markInstallPromptDismissed()
    setPromptDismissed(true)
  }

  const showInstallPrompt = !isStandalone && !promptDismissed && (isIos || deferredPrompt !== null)

  if (!showInstallPrompt || isStandalone)
    return null

  const showIosGuide = isIos && !deferredPrompt

  return (
    <div
      className="fixed left-3 right-3 z-50 rounded-lg border border-border bg-card p-3 shadow-lg md:bottom-3 md:left-auto md:right-3 md:w-72"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/20">
          <Download className="h-4 w-4 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-foreground">{showIosGuide ? '添加到主屏幕' : '安装应用'}</h3>
          {showIosGuide
            ? <p className="mt-0.5 text-xs text-muted-foreground">Safari 分享菜单 → 添加到主屏幕</p>
            : <p className="mt-0.5 text-xs text-muted-foreground">安装 Toss，获得更好的体验</p>}
          <div className="mt-2 flex gap-1.5">
            {!showIosGuide && <Button size="sm" onClick={handleInstall}>安装</Button>}
            <Button size="sm" variant="ghost" onClick={handleDismissPrompt}>稍后</Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mr-1 -mt-1 shrink-0"
          onClick={handleDismissPrompt}
          aria-label="关闭安装提示"
          title="关闭安装提示"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
