import type { AppInfo } from '@capacitor/app'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function MobileApp() {
  const platform = Capacitor.getPlatform()
  const native = Capacitor.isNativePlatform()
  const [checking, setChecking] = useState(false)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [message, setMessage] = useState('尚未執行原生橋接檢查。')

  async function checkNativeBridge() {
    if (!native) {
      setMessage('目前為瀏覽器預覽，無法驗證原生橋接。請在 Android 或 iOS App 中執行。')
      return
    }

    setChecking(true)
    setAppInfo(null)
    try {
      const info = await App.getInfo()
      setAppInfo(info)
      setMessage('原生橋接正常，已讀取此 App 的安裝資訊。')
    }
    catch (error) {
      setMessage(`原生橋接檢查失敗：${error instanceof Error ? error.message : String(error)}`)
    }
    finally {
      setChecking(false)
    }
  }

  return (
    <main className="mobile-shell font-sans">
      <header className="mb-6">
        <p className="text-sm font-medium text-accent">Toss · 行動端</p>
        <h1 className="mt-2 text-2xl font-semibold">本地啟動檢查</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          此頁面隨 App 打包，不依賴遠端網站。傳輸功能仍使用現有 Web／PWA，尚未接入此入口。
        </p>
      </header>

      <section className="panel-surface p-5" aria-labelledby="runtime-title">
        <h2 id="runtime-title" className="text-lg font-semibold">執行環境</h2>
        <dl className="runtime-details mt-4">
          <dt>平台</dt>
          <dd>{platform}</dd>
          <dt>執行模式</dt>
          <dd>{native ? 'Capacitor 原生 App' : '瀏覽器預覽（非原生驗證）'}</dd>
          <dt>頁面來源</dt>
          <dd>{window.location.origin}</dd>
          <dt>安全環境</dt>
          <dd>{window.isSecureContext ? '是' : '否'}</dd>
          <dt>Web Crypto API</dt>
          <dd>{typeof crypto?.subtle !== 'undefined' ? '可用' : '不可用'}</dd>
          <dt>WebRTC API</dt>
          <dd>{typeof RTCPeerConnection !== 'undefined' ? '可用' : '不可用'}</dd>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          API 可用只表示存在對應介面，不代表已通過加密或跨裝置傳輸測試。
        </p>
      </section>

      <section className="panel-surface mt-4 p-5" aria-labelledby="bridge-title">
        <h2 id="bridge-title" className="text-lg font-semibold">原生橋接</h2>
        <Button className="mt-4 min-h-11 w-full" disabled={checking} onClick={checkNativeBridge}>
          {checking ? '檢查中…' : '檢查原生橋接'}
        </Button>
        <p className="mt-3 text-sm text-muted-foreground" role="status">{message}</p>
        {appInfo && (
          <dl className="runtime-details mt-4">
            <dt>名稱</dt>
            <dd>{appInfo.name}</dd>
            <dt>App ID</dt>
            <dd>{appInfo.id}</dd>
            <dt>版本</dt>
            <dd>{`${appInfo.version}（${appInfo.build}）`}</dd>
          </dl>
        )}
      </section>
    </main>
  )
}
