import type { NativeTransferFile } from './types'

export type NativeFileSaver = (file: NativeTransferFile) => Promise<void>

let nativeFileSaver: NativeFileSaver | null = null

/**
 * 由原生入口注册「保存到本地／分享」实现；Web 入口不注册，
 * 继续使用浏览器下载。
 */
export function registerNativeFileSaver(saver: NativeFileSaver) {
  nativeFileSaver = saver
}

export function getNativeFileSaver(): NativeFileSaver | null {
  return nativeFileSaver
}
