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

const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/i
const ROOM_CODE_SANITIZE_REGEX = /[^A-Z0-9]/g

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

  // Check camera support on mount
  useEffect(() => {
    setCameraSupported(isCameraSupported())
  }, [setCameraSupported])

  const extractRoomCode = useCallback((text: string): string | null => {
    // Try to extract room code from URL
    try {
      const url = new URL(text)
      const joinCode = url.searchParams.get('join')
      if (joinCode && ROOM_CODE_REGEX.test(joinCode)) {
        return joinCode.toUpperCase()
      }
    }
    catch {
      // Not a URL, try as direct code
    }

    // Try as direct 6-character code
    const cleaned = text.toUpperCase().replace(ROOM_CODE_SANITIZE_REGEX, '')
    if (cleaned.length === 6) {
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
  }, [open, facingMode, extractRoomCode, onScan, onOpenChange, stopScanner, cameraSupported])

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
    const code = manualCode.toUpperCase().replace(ROOM_CODE_SANITIZE_REGEX, '')
    if (code.length === 6) {
      onScan(code)
      onOpenChange(false)
    }
  }, [manualCode, onScan, onOpenChange])

  // Start scanner when dialog opens
  useEffect(() => {
    if (open && cameraSupported && !showManualInput) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(startScanner, 100)
      return () => clearTimeout(timer)
    }
    else {
      stopScanner()
    }
  }, [open, startScanner, stopScanner, cameraSupported, showManualInput])

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
            {showManualInput ? '输入对方设备上显示的 6 位连接码' : '允许摄像头访问，将房间二维码置于扫描框内'}
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
                    onChange={e => setManualCode(e.target.value.toUpperCase().replace(ROOM_CODE_SANITIZE_REGEX, '').slice(0, 6))}
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

                  {/* Scanning overlay */}
                  {!error && !isStarting && cameraSupported && (
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
                        <p className="text-sm">正在启动摄像头...</p>
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
                              onClick={startScanner}
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
                    将二维码对准框内即可自动识别
                  </p>

                  <div className="flex gap-2">
                    {cameraSupported && !error && (
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
