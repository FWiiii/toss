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
      className="fixed left-4 right-4 z-50 rounded-xl border border-border bg-card p-4 shadow-lg md:left-auto md:right-4 md:w-80"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground">{showIosGuide ? '添加到主屏幕' : '安装应用'}</h3>
          {showIosGuide
            ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  iOS Safari：点“分享”按钮，再选“添加到主屏幕”。
                </p>
              )
            : (
                <p className="mt-1 text-sm text-muted-foreground">
                  安装 Toss 到您的设备，享受更好的体验
                </p>
              )}
          <div className="flex gap-2 mt-3">
            {!showIosGuide && (
              <Button size="sm" onClick={handleInstall}>
                安装
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={handleDismissPrompt}>
              稍后
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="flex-shrink-0 -mt-1 -mr-1"
          onClick={handleDismissPrompt}
          aria-label="关闭安装提示"
          title="关闭安装提示"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
