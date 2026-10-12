import type { IncomingShareItem } from './incoming-share'
import type { PendingTransferFile } from './pending-transfer-file'
import { Capacitor } from '@capacitor/core'
import { generateUUID } from './utils'

/**
 * 把外部应用分享进来的私有文件包装成待发项。
 *
 * 注意：发送路径目前要求 `File`，因此这里通过 `fetch(convertFileSrc(uri))`
 * 把文件读进 WebView 内存。分享进来的大文件会占用与其大小相当的内存，
 * 这是已知限制；真正的有界发送需要发送端接受 range-read 来源，属后续步骤。
 */
export function createSharedPendingTransferFile(
  item: IncomingShareItem,
  convertFileSrc: (uri: string) => string = Capacitor.convertFileSrc,
): PendingTransferFile {
  return {
    id: generateUUID(),
    name: item.name,
    size: item.size,
    type: item.mimeType,
    resolveFile: async () => {
      const response = await fetch(convertFileSrc(item.uri))
      if (!response.ok) {
        throw new Error(`无法读取分享的文件：${item.name}`)
      }
      const blob = await response.blob()
      return new File([blob], item.name, { type: blob.type || item.mimeType })
    },
  }
}
