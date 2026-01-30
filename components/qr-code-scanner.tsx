"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Camera, AlertCircle, SwitchCamera, ImagePlus, Keyboard } from "lucide-react"

interface QRCodeScannerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (code: string) => void
}

// Check if camera is supported
function isCameraSupported(): boolean {
  if (typeof window === "undefined") return false
  
  // Check for secure context (HTTPS or localhost)
  const isSecureContext = window.isSecureContext || 
    window.location.protocol === "https:" || 
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  
  // Check for getUserMedia support
  const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  
  return isSecureContext && hasGetUserMedia
}

export function QRCodeScanner({ open, onOpenChange, onScan }: QRCodeScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html5QrCodeRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")
  const [cameraSupported, setCameraSupported] = useState(true)
  const [manualCode, setManualCode] = useState("")
  const [showManualInput, setShowManualInput] = useState(false)

  // Check camera support on mount
  useEffect(() => {
    setCameraSupported(isCameraSupported())
  }, [])

  const extractRoomCode = useCallback((text: string): string | null => {
    // Try to extract room code from URL
    try {
      const url = new URL(text)
      const joinCode = url.searchParams.get("join")
      if (joinCode && /^[A-Z0-9]{6}$/i.test(joinCode)) {
        return joinCode.toUpperCase()
      }
    } catch {
      // Not a URL, try as direct code
    }
    
    // Try as direct 6-character code
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, "")
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
      } catch {
        // Ignore stop errors
      }
    }
  }, [])

  const startScanner = useCallback(async () => {
    if (!scannerRef.current || !open || !cameraSupported) return
    
    setIsStarting(true)
    setError(null)

    try {
      // Dynamic import to avoid SSR issues
      const { Html5Qrcode } = await import("html5-qrcode")
      
      // Stop existing scanner if any
      await stopScanner()
      
      // Create new scanner instance
      const scannerId = "qr-scanner-" + Date.now()
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
        }
      )
    } catch (err) {
      console.error("Scanner error:", err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      
      if (errorMessage.includes("Permission") || errorMessage.includes("denied")) {
        setError("请允许访问摄像头以扫描二维码")
      } else if (errorMessage.includes("NotFound") || errorMessage.includes("not found") || errorMessage.includes("Requested device not found")) {
        setError("未找到摄像头设备")
      } else if (errorMessage.includes("not supported") || errorMessage.includes("NotSupportedError")) {
        setError("当前浏览器不支持摄像头功能，请尝试上传二维码图片或手动输入房间代码")
        setCameraSupported(false)
      } else if (errorMessage.includes("NotAllowedError")) {
        setError("摄像头访问被拒绝，请在浏览器设置中允许访问摄像头")
      } else if (errorMessage.includes("NotReadableError") || errorMessage.includes("Could not start video source")) {
        setError("摄像头被其他应用占用，请关闭其他使用摄像头的应用后重试")
      } else {
        setError("无法启动摄像头，请尝试上传二维码图片")
      }
    } finally {
      setIsStarting(false)
    }
  }, [open, facingMode, extractRoomCode, onScan, onOpenChange, stopScanner, cameraSupported])

  // Handle image file upload for QR scanning
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    try {
      const { Html5Qrcode } = await import("html5-qrcode")
      const html5QrCode = new Html5Qrcode("qr-file-scanner")
      
      const result = await html5QrCode.scanFile(file, true)
      const roomCode = extractRoomCode(result)
      
      if (roomCode) {
        onScan(roomCode)
        onOpenChange(false)
      } else {
        setError("无法从图片中识别有效的房间代码")
      }
      
      html5QrCode.clear()
    } catch (err) {
      console.error("File scan error:", err)
      setError("无法识别图片中的二维码，请确保图片清晰")
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [extractRoomCode, onScan, onOpenChange])

  // Handle manual code submission
  const handleManualSubmit = useCallback(() => {
    const code = manualCode.toUpperCase().replace(/[^A-Z0-9]/g, "")
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
    } else {
      stopScanner()
    }
  }, [open, startScanner, stopScanner, cameraSupported, showManualInput])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [stopScanner])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setError(null)
      setManualCode("")
      setShowManualInput(false)
    }
  }, [open])

  const handleSwitchCamera = useCallback(async () => {
    await stopScanner()
    setFacingMode(prev => prev === "environment" ? "user" : "environment")
  }, [stopScanner])

  // Restart scanner when facing mode changes
  useEffect(() => {
    if (open && !isStarting && cameraSupported && !showManualInput) {
      startScanner()
    }
  }, [facingMode]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-center">
            {showManualInput ? "手动输入房间代码" : "扫描二维码"}
          </DialogTitle>
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

        {showManualInput ? (
          /* Manual input mode */
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="输入6位房间代码"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                className="h-14 text-center text-2xl font-mono tracking-[0.3em] uppercase"
                maxLength={6}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleManualSubmit()
                }}
              />
              <p className="text-xs text-muted-foreground text-center">
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
        ) : (
          /* Camera/Scanner mode */
          <>
            <div className="relative">
              {/* Scanner container */}
              <div 
                ref={scannerRef}
                className="w-full aspect-square bg-black"
              />
              
              {/* Scanning overlay */}
              {!error && !isStarting && cameraSupported && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* Corner markers */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px]">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-accent rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-accent rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-accent rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-accent rounded-br-lg" />
                  </div>
                </div>
              )}
              
              {/* Loading state */}
              {isStarting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <div className="text-center text-white">
                    <Camera className="w-12 h-12 mx-auto mb-2 animate-pulse" />
                    <p className="text-sm">正在启动摄像头...</p>
                  </div>
                </div>
              )}
              
              {/* Error state or camera not supported */}
              {(error || !cameraSupported) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/90">
                  <div className="text-center text-white p-6">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 text-amber-500" />
                    <p className="text-sm mb-4 max-w-[280px]">
                      {error || "当前环境不支持摄像头扫描"}
                    </p>
                    <div className="space-y-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <ImagePlus className="w-4 h-4 mr-2" />
                        上传二维码图片
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full bg-transparent text-white border-white/30 hover:bg-white/10"
                        onClick={() => setShowManualInput(true)}
                      >
                        <Keyboard className="w-4 h-4 mr-2" />
                        手动输入代码
                      </Button>
                      {cameraSupported && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-white/70 hover:text-white hover:bg-white/10"
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
                    variant="outline"
                    className="flex-1"
                    onClick={handleSwitchCamera}
                    disabled={isStarting}
                  >
                    <SwitchCamera className="w-4 h-4 mr-2" />
                    切换摄像头
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="w-4 h-4 mr-2" />
                  上传图片
                </Button>
                <Button
                  variant="ghost"
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
