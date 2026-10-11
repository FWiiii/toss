import { AppShell } from '@/components/app-shell'
import { AppRuntimeProvider, DEFAULT_STUN_SERVERS } from '@/lib/app-runtime'
import { registerNativeFileSaving } from '@/lib/native-file-save'
import { registerNativeFileStorage } from '@/lib/native-receive-storage'
import { TransferProvider } from '@/lib/transfer-context'
import logoSrc from '@/public/logo.svg?url'

// 收到的文件按块写入 App 私有目录，不聚合成整文件 Blob。
registerNativeFileStorage()
// 保存到本地／其他应用走系统分享面板。
registerNativeFileSaving()

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
            前景传输验证 · 请保持 App 在前台。收到的文件先暂存在 App 私有目录，点下载图标可保存到「文件」App；持久收件箱与系统分享接收尚未接入。
          </p>
        </AppShell>
      </TransferProvider>
    </AppRuntimeProvider>
  )
}
