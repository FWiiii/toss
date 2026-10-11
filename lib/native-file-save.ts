import type { NativeTransferFile } from './types'
import { Share } from '@capacitor/share'
import { registerNativeFileSaver } from './file-save'

/**
 * 原生保存：把已落盘到 App 私有目录的文件交给系统分享面板，
 * 由用户选择「存储到文件」或发送到其他应用。
 */
export interface NativeShareApi {
  canShare: () => Promise<{ value: boolean }>
  share: (options: { dialogTitle?: string, files?: string[], title?: string }) => Promise<unknown>
}

export async function saveNativeFile(
  file: NativeTransferFile,
  share: NativeShareApi = Share,
): Promise<void> {
  if (!file.uri) {
    throw new Error('文件路径不可用')
  }

  const available = await share.canShare()
  if (!available.value) {
    throw new Error('当前设备不支持系统分享')
  }

  // files 需要 file:// URI；iOS 与 Android 均由插件转换为可授权的临时 URI。
  await share.share({
    dialogTitle: '保存或分享文件',
    files: [file.uri],
    title: file.name,
  })
}

export function registerNativeFileSaving() {
  registerNativeFileSaver(saveNativeFile)
}
