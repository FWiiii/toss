import { AppShell } from '@/components/app-shell'
import { AppRuntimeProvider, DEFAULT_STUN_SERVERS } from '@/lib/app-runtime'
import { registerNativeBarcodeScanner, scanRoomCodeNative } from '@/lib/native-barcode'
import { registerNativeFileSaving } from '@/lib/native-file-save'
import { registerNativeFileStorage } from '@/lib/native-receive-storage'
import { cleanupNativeStorage } from '@/lib/native-storage-cleanup'
import { TransferProvider } from '@/lib/transfer-context'
import logoSrc from '@/public/logo.svg?url'

// 收到的文件按块写入 App 私有目录，不聚合成整文件 Blob。
registerNativeFileStorage()
// 保存到本地／其他应用走系统分享面板。
registerNativeFileSaving()
// 扫码走系统原生相机（Capacitor 条码插件），不占用 WebView 的 getUserMedia。
registerNativeBarcodeScanner({ scan: () => scanRoomCodeNative() })
// 启动时清理中断传输残留的分片与过期分享暂存；不动已接收文件。
void cleanupNativeStorage().catch(() => {})

// Entry-specific configuration: no Next environment shim in shared code.
const runtime = {
  native: true,
  development: import.meta.env.DEV,
  publicRoomOrigin: import.meta.env.VITE_PUBLIC_ROOM_ORIGIN || '',
  peer: {
    host: import.meta.env.VITE_PEER_HOST || '0.peerjs.com',
    port: Number(import.meta.env.VITE_PEER_PORT || 443),
    path: import.meta.env.VITE_PEER_PATH || '/',
    secure: import.meta.env.VITE_PEER_SECURE !== 'false',
    iceServers: DEFAULT_STUN_SERVERS,
  },
}

export function MobileApp() {
  return (
    <AppRuntimeProvider value={runtime}>
      <TransferProvider>
        <AppShell logoSrc={logoSrc}>
          <p className="px-4 pb-6 text-center text-xs text-muted-foreground" role="note">
            前景传输验证 · 请保持 App 在前台。收到的文件先暂存在 App 私有目录，点下载图标可保存到「文件」App；重启后仍可再次打开的持久收件箱尚未接入。
          </p>
        </AppShell>
      </TransferProvider>
    </AppRuntimeProvider>
  )
}
