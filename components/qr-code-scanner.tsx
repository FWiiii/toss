'use client'

import { AlertCircle, Camera, ImagePlus, Keyboard, SwitchCamera } from 'lucide-react'
import { useCallback, useEffect, useId, useReducer, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { STATUS_TONES } from '@/lib/design-tokens'
import { getNativeBarcodeScanner } from '@/lib/native-barcode'
import { isValidRoomCode, ROOM_CODE_LENGTH, sanitizeRoomCode } from '@/lib/room-code'

interface QRCodeScannerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (code: string) => void
}

// Check if camera is supported
function isCameraSupported(): boolean {
  if (typeof window === 'undefined')
    return false

  // Check for secure context (HTTPS or localhost)
  const isSecureContext = window.isSecureContext
    || window.location.protocol === 'https:'
    || window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'

  // Check for getUserMedia support
  const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)

  return isSecureContext && hasGetUserMedia
}

export function QRCodeScanner({ open, onOpenChange, onScan }: QRCodeScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null)

  const html5QrCodeRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [cameraSupported, setCameraSupported] = useReducer(
    (_current: boolean, next: boolean) => next,
    true,
  )
  const [manualCode, setManualCode] = useState('')
  const [showManualInput, setShowManualInput] = useState(false)
  const manualCodeInputId = useId()
  const manualCodeHintId = useId()
  // 原生入口在模块加载时注册；非空即表示运行在 App 内，应使用系统相机而非 WebView 相机。
  const [nativeScanner] = useState(() => getNativeBarcodeScanner())
  const isNativeScanner = nativeScanner !== null
  // 防止依赖变化时重复唤起系统相机：每次打开对话框只自动拉起一次。
  const nativeScanGuardRef = useRef(false)
  // 系统相机是原生模态界面，期间对话框可能已被关闭；用它丢弃过期结果。
  const openRef = useRef(open)
  openRef.current = open

  // Check camera support on mount（原生路径由系统相机提供能力，无需 getUserMedia）
  useEffect(() => {
    if (isNativeScanner) {
      setCameraSupported(true)
      return
    }
    setCameraSupported(isCameraSupported())
  }, [setCameraSupported, isNativeScanner])

  const extractRoomCode = useCallback((text: string): string | null => {
    // Try to extract room code from URL
    try {
      const url = new URL(text)
      const joinCode = url.searchParams.get('join')
      if (joinCode && isValidRoomCode(joinCode)) {
        return sanitizeRoomCode(joinCode)
      }
    }
    catch {
      // Not a URL, try as direct code
    }

    // Try as direct 6-character code
    const cleaned = sanitizeRoomCode(text)
    if (cleaned.length === ROOM_CODE_LENGTH) {
      return cleaned
    }

    return null
  }, [])

  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        const state = html5QrCodeRef.current.getState()
        // State 2 = SCANNING, State 3 = PAUSED
        if (state === 2 || state === 3) {
          await html5QrCodeRef.current.stop()
        }
      }
      catch {
        // Ignore stop errors
      }
    }
  }, [])

  const startScanner = useCallback(async () => {
    // 原生路径由系统相机完成扫描，绝不调用 WebView 的 getUserMedia。
    if (isNativeScanner)
      return
    if (!scannerRef.current || !open || !cameraSupported)
      return

    setIsStarting(true)
    setError(null)

    try {
      // Dynamic import to avoid SSR issues
      const { Html5Qrcode } = await import('html5-qrcode')

      // Stop existing scanner if any
      await stopScanner()

      // Create new scanner instance
      const scannerId = `qr-scanner-${Date.now()}`
      scannerRef.current.id = scannerId

      const html5QrCode = new Html5Qrcode(scannerId)
      html5QrCodeRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          const roomCode = extractRoomCode(decodedText)
          if (roomCode) {
            // Stop scanner and close dialog
            stopScanner()
            onScan(roomCode)
            onOpenChange(false)
          }
        },
        () => {
          // Ignore scan failures (no QR code in frame)
        },
      )
    }
    catch (err) {
      console.error('Scanner error:', err)
      const errorMessage = err instanceof Error ? err.message : String(err)

      if (errorMessage.includes('Permission') || errorMessage.includes('denied')) {
        setError('请允许访问摄像头以扫描二维码')
      }
      else if (errorMessage.includes('NotFound') || errorMessage.includes('not found') || errorMessage.includes('Requested device not found')) {
        setError('未找到摄像头设备')
      }
      else if (errorMessage.includes('not supported') || errorMessage.includes('NotSupportedError')) {
        setError('当前浏览器不支持摄像头功能，请尝试上传二维码图片或手动输入房间代码')
        setCameraSupported(false)
      }
      else if (errorMessage.includes('NotAllowedError')) {
        setError('摄像头访问被拒绝，请在浏览器设置中允许访问摄像头')
      }
      else if (errorMessage.includes('NotReadableError') || errorMessage.includes('Could not start video source')) {
        setError('摄像头被其他应用占用，请关闭其他使用摄像头的应用后重试')
      }
      else {
        setError('无法启动摄像头，请尝试上传二维码图片')
      }
    }
    finally {
      setIsStarting(false)
    }
  }, [open, facingMode, extractRoomCode, onScan, onOpenChange, stopScanner, cameraSupported, isNativeScanner])

  // Handle image file upload for QR scanning
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file)
      return

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const html5QrCode = new Html5Qrcode('qr-file-scanner')

      const result = await html5QrCode.scanFile(file, true)
      const roomCode = extractRoomCode(result)

      if (roomCode) {
        onScan(roomCode)
        onOpenChange(false)
      }
      else {
        setError('无法从图片中识别有效的房间代码')
      }

      html5QrCode.clear()
    }
    catch (err) {
      console.error('File scan error:', err)
      setError('无法识别图片中的二维码，请确保图片清晰')
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [extractRoomCode, onScan, onOpenChange])

  // Handle manual code submission
  const handleManualSubmit = useCallback(() => {
    const code = sanitizeRoomCode(manualCode)
    if (code.length === ROOM_CODE_LENGTH) {
      onScan(code)
      onOpenChange(false)
    }
  }, [manualCode, onScan, onOpenChange])

  // 原生扫码：调用系统相机，用户取消（null）时静默关闭，出错则保留手动输入入口。
  const runNativeScan = useCallback(async () => {
    if (!nativeScanner)
      return

    setIsStarting(true)
    setError(null)

    try {
      const raw = await nativeScanner.scan()

      // 对话框已关闭（用户在系统相机界面取消并关掉弹窗），丢弃结果。
      if (!openRef.current)
        return

      const roomCode = raw ? extractRoomCode(raw) : null

      if (roomCode) {
        onScan(roomCode)
        onOpenChange(false)
      }
      else if (raw === null) {
        // 用户取消，不算错误。
        onOpenChange(false)
      }
      else {
        setError('未能从扫描结果中识别房间代码，请重试或手动输入')
      }
    }
    catch (err) {
      console.error('Native scanner error:', err)
      setError('无法启动系统相机扫码，请重试、上传二维码图片或手动输入房间代码')
    }
    finally {
      setIsStarting(false)
    }
  }, [nativeScanner, extractRoomCode, onScan, onOpenChange])

  // Start scanner when dialog opens（原生路径直接唤起系统相机）
  useEffect(() => {
    if (!open || showManualInput) {
      nativeScanGuardRef.current = false
      stopScanner()
      return
    }

    if (isNativeScanner) {
      if (!nativeScanGuardRef.current) {
        nativeScanGuardRef.current = true
        void runNativeScan()
      }
      return
    }

    if (cameraSupported) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(startScanner, 100)
      return () => clearTimeout(timer)
    }

    stopScanner()
  }, [open, startScanner, stopScanner, cameraSupported, showManualInput, isNativeScanner, runNativeScan])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [stopScanner])

  const handleSwitchCamera = useCallback(async () => {
    await stopScanner()
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')
  }, [stopScanner])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setError(null)
      setManualCode('')
      setShowManualInput(false)
    }
    onOpenChange(nextOpen)
  }, [onOpenChange])

  // Restart scanner when facing mode changes
  useEffect(() => {
    if (open && !isStarting && cameraSupported && !showManualInput) {
      startScanner()
    }
  }, [facingMode]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden border-border/70 bg-card p-0 shadow-2xl sm:max-w-[400px] sm:rounded-3xl">
        <DialogHeader className="relative border-b border-border/70 bg-muted/20 px-5 pb-4 pt-5 text-center sm:px-6">
          <DialogTitle className="text-center tracking-tight">
            {showManualInput ? '手动输入房间代码' : '扫描二维码'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {showManualInput
              ? '输入对方设备上显示的 6 位连接码'
              : isNativeScanner
                ? '将使用系统相机扫描二维码，无需网页摄像头权限'
                : '允许摄像头访问，将房间二维码置于扫描框内'}
          </DialogDescription>
        </DialogHeader>

        {/* Hidden file input for QR image upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* Hidden div for file scanning */}
        <div id="qr-file-scanner" className="hidden" />

        {showManualInput
          ? (
        /* Manual input mode */
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <label htmlFor={manualCodeInputId} className="sr-only">
                    房间代码
                  </label>
                  <Input
                    id={manualCodeInputId}
                    placeholder="输入6位房间代码"
                    value={manualCode}
                    onChange={e => setManualCode(sanitizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH))}
                    className="h-14 text-center text-2xl font-mono tracking-[0.3em] uppercase"
                    maxLength={6}
                    autoFocus
                    inputMode="text"
                    autoComplete="one-time-code"
                    autoCapitalize="characters"
                    spellCheck={false}
                    aria-describedby={manualCodeHintId}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')
                        handleManualSubmit()
                    }}
                  />
                  <p id={manualCodeHintId} className="text-xs text-muted-foreground text-center">
                    请输入房间创建者提供的6位代码
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={handleManualSubmit}
                    disabled={manualCode.length !== 6}
                  >
                    加入房间
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowManualInput(false)}
                  >
                    返回扫描
                  </Button>
                </div>
              </div>
            )
          : (
        /* Camera/Scanner mode */
              <>
                <div className="relative">
                  {/* Scanner container */}
                  <div
                    ref={scannerRef}
                    className="qr-scanner-viewport relative aspect-square w-full bg-black"
                    role="img"
                    aria-label="摄像头二维码扫描画面"
                    aria-busy={isStarting}
                  />

                  {/* Scanning overlay（仅 WebView 相机路径） */}
                  {!isNativeScanner && !error && !isStarting && cameraSupported && (
                    <div className="absolute inset-0 pointer-events-none">
                      {/* Corner markers */}
                      <div className="qr-scan-frame absolute left-1/2 top-1/2 h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2">
                        <div className="absolute inset-0 rounded-2xl border border-white/20" />
                        <div className="qr-scan-line absolute inset-x-1 top-1 rounded-full" />
                        <div className="absolute left-0 top-0 h-8 w-8 rounded-tl-lg border-l-2 border-t-2 border-accent" />
                        <div className="absolute right-0 top-0 h-8 w-8 rounded-tr-lg border-r-2 border-t-2 border-accent" />
                        <div className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-lg border-b-2 border-l-2 border-accent" />
                        <div className="absolute bottom-0 right-0 h-8 w-8 rounded-br-lg border-b-2 border-r-2 border-accent" />
                      </div>
                    </div>
                  )}

                  {/* Loading state */}
                  {isStarting && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                      <div className="text-center text-white" role="status" aria-live="polite">
                        <Camera className="w-12 h-12 mx-auto mb-2 animate-pulse" />
                        <p className="text-sm">{isNativeScanner ? '正在启动系统相机...' : '正在启动摄像头...'}</p>
                      </div>
                    </div>
                  )}

                  {/* Error state or camera not supported */}
                  {(error || !cameraSupported) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/90">
                      <div className="p-6 text-center text-white" role="alert" aria-live="assertive">
                        <AlertCircle className={`mx-auto mb-3 h-12 w-12 ${STATUS_TONES.warning.inline}`} />
                        <p className="text-sm mb-4 max-w-[280px]">
                          {error || '当前环境不支持摄像头扫描'}
                        </p>
                        <div className="space-y-2">
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <ImagePlus className="w-4 h-4 mr-2" />
                            上传二维码图片
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            onClick={() => setShowManualInput(true)}
                          >
                            <Keyboard className="w-4 h-4 mr-2" />
                            手动输入代码
                          </Button>
                          {cameraSupported && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-white/80 hover:text-white hover:bg-white/10"
                              onClick={() => void (isNativeScanner ? runNativeScan() : startScanner())}
                            >
                              重新尝试扫描
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  <p className="text-xs text-muted-foreground text-center">
                    {isNativeScanner ? '使用系统相机扫描二维码，识别后自动返回' : '将二维码对准框内即可自动识别'}
                  </p>

                  <div className="flex gap-2">
                    {isNativeScanner && !error && (
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => void runNativeScan()}
                        disabled={isStarting}
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        重新扫描
                      </Button>
                    )}
                    {!isNativeScanner && cameraSupported && !error && (
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={handleSwitchCamera}
                        disabled={isStarting}
                      >
                        <SwitchCamera className="w-4 h-4 mr-2" />
                        切换
                      </Button>
                    )}
                    {isNativeScanner && (
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => setShowManualInput(true)}
                        disabled={isStarting}
                      >
                        <Keyboard className="w-4 h-4 mr-2" />
                        手动
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="w-4 h-4 mr-2" />
                      上传
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => onOpenChange(false)}
                    >
                      取消
                    </Button>
                  </div>
                </div>
              </>
            )}
      </DialogContent>
    </Dialog>
  )
}
