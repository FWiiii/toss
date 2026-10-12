import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner'
import { Capacitor } from '@capacitor/core'

/**
 * 原生扫码：使用 Capacitor 条码插件在原生层调用系统相机，
 * 不依赖 WebView 的 getUserMedia，也不需要 App 内自绘相机界面。
 */
export interface NativeBarcodeApi {
  scanBarcode: (options: {
    hint: number
    scanInstructions?: string
    cameraDirection?: number
    scanOrientation?: number
    cancelButtonAccessibilityLabel?: string
  }) => Promise<{ ScanResult: string }>
}

export async function scanRoomCodeNative(
  api: NativeBarcodeApi = CapacitorBarcodeScanner,
): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('原生扫码仅在 App 内可用')
  }

  const result = await api.scanBarcode({
    hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
    scanInstructions: '将房间二维码对准取景框',
    cancelButtonAccessibilityLabel: '取消扫描',
  })

  return result?.ScanResult?.trim() || null
}

export interface NativeBarcodeSaver {
  scan: () => Promise<string | null>
}

let nativeBarcodeScanner: NativeBarcodeSaver | null = null

/**
 * 由原生入口注册；Web 入口不注册，继续使用浏览器相机与图片上传。
 */
export function registerNativeBarcodeScanner(scanner: NativeBarcodeSaver) {
  nativeBarcodeScanner = scanner
}

export function getNativeBarcodeScanner(): NativeBarcodeSaver | null {
  return nativeBarcodeScanner
}
