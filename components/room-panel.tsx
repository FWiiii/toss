"use client"

import { useEffect, useId, useState } from "react"
import { useTransfer } from "@/lib/transfer-context"
import { useJoinCode } from "@/hooks/use-join-code"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { QRCodeDisplay } from "@/components/qr-code-display"
import { QRCodeScanner } from "@/components/qr-code-scanner"
import { ConnectionStatusDisplay } from "@/components/connection-status"
import { Copy, Check, LogOut, Loader2, AlertCircle, QrCode, ScanLine } from "lucide-react"
import { STATUS_TONES } from "@/lib/design-tokens"
import { cn } from "@/lib/utils"

const CARD_CLASS = "panel-surface relative overflow-hidden p-6"
const SECTION_HINT_CLASS = "mt-2 text-center text-xs text-muted-foreground"

export function RoomPanel() {
  const { 
    roomCode, 
    connectionStatus,
    connectionInfo,
    connectionQuality,
    errorMessage, 
    createRoom, 
    joinRoom, 
    leaveRoom, 
    peerCount, 
    isHost,
    isCreatingRoom,
    isJoiningRoom,
    isEncrypted
  } = useTransfer()
  const { joinCode, clearJoinCode } = useJoinCode()
  const [inputCode, setInputCode] = useState("")
  const [copied, setCopied] = useState(false)
  const [showQRCode, setShowQRCode] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const joinInputId = useId()
  const joinHintId = useId()
  const joinErrorId = useId()

  // Auto-join when code is provided via URL
  useEffect(() => {
    if (joinCode && !roomCode && !isJoiningRoom) {
      joinRoom(joinCode)
      clearJoinCode()
    }
  }, [joinCode, roomCode, isJoiningRoom, joinRoom, clearJoinCode])

  // Handle scanned QR code
  const handleScan = (code: string) => {
    setInputCode(code)
    joinRoom(code)
  }

  const handleCopyCode = async () => {
    if (roomCode) {
      try {
        // Try modern clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(roomCode)
        } else {
          // Fallback for older browsers or non-HTTPS
          const textArea = document.createElement('textarea')
          textArea.value = roomCode
          textArea.style.position = 'fixed'
          textArea.style.left = '-9999px'
          document.body.appendChild(textArea)
          textArea.select()
          document.execCommand('copy')
          document.body.removeChild(textArea)
        }
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // If all else fails, show the code for manual copy
        console.error('Failed to copy to clipboard')
      }
    }
  }

  const handleJoinRoom = () => {
    if (inputCode.length >= 6) {
      joinRoom(inputCode)
    }
  }

  const formatCode = (code: string) => {
    return code.slice(0, 3) + " " + code.slice(3)
  }

  const joinHasError = connectionStatus === "error" && Boolean(errorMessage)

  // Room dissolved state - show return button
  if (connectionStatus === "dissolved") {
    return (
      <div className={CARD_CLASS}>
        <EmptyState
          icon={AlertCircle}
          title="房间已解散"
          description="房主已关闭房间，连接已断开"
          iconClassName={`${STATUS_TONES.danger.iconSurface} ${STATUS_TONES.danger.icon}`}
        />
        <Button className="w-full mt-2" onClick={leaveRoom}>
          返回首页
        </Button>
      </div>
    )
  }

  const isConnected = connectionStatus === "connected" && peerCount > 0
  if (roomCode || isConnected) {
    return (
      <div className={CARD_CLASS}>
        {/* Room Code Display */}
        {roomCode && (
          <div className="text-center mb-5">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">房间代码</p>
            <div className="relative overflow-hidden rounded-xl">
              {copied && <div className="pointer-events-none absolute inset-0 delight-sweep-overlay" aria-hidden="true" />}
              <div className="relative flex items-center justify-center gap-2 rounded-xl px-2 py-1">
              <span className="text-4xl font-mono font-bold tracking-[0.3em] text-foreground sm:text-[2.6rem]">
                {formatCode(roomCode)}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleCopyCode}
                aria-label={copied ? "房间代码已复制" : "复制房间代码"}
                title={copied ? "房间代码已复制" : "复制房间代码"}
              >
                {copied ? <Check className={`h-5 w-5 ${STATUS_TONES.success.inline}`} /> : <Copy className="h-5 w-5" />}
              </Button>
              </div>
            </div>
            <p
              className={cn(
                "mt-2 min-h-[1rem] text-xs text-muted-foreground transition-all duration-200",
                copied ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              )}
              aria-live="polite"
            >
              已复制，可在另一台设备粘贴{isHost ? " · 或直接让对方扫码" : ""}
            </p>
          </div>
        )}

        {/* Connection Status Display */}
        <ConnectionStatusDisplay
          status={connectionStatus}
          isHost={isHost}
          peerCount={peerCount}
          errorMessage={errorMessage}
          connectionInfo={connectionInfo}
          connectionQuality={connectionQuality}
          isEncrypted={isEncrypted}
          className="mb-5"
        />

        {/* Action Buttons */}
        <div className="flex gap-2">
          {isHost && roomCode && (
            <Button variant="outline" className="flex-1" onClick={() => setShowQRCode(true)}>
              <QrCode className="w-4 h-4 mr-2" />
              显示二维码
            </Button>
          )}
          <Button
            variant={isHost ? "destructive" : "outline"}
            className={isHost ? "flex-1" : "w-full"}
            onClick={leaveRoom}
          >
            <LogOut className="w-4 h-4 mr-2" />
            {isHost ? "解散房间" : "离开房间"}
          </Button>
        </div>

        {/* QR Code Display Dialog */}
        <QRCodeDisplay
          roomCode={roomCode}
          open={showQRCode}
          onOpenChange={setShowQRCode}
        />
      </div>
    )
  }

  return (
    <div className={CARD_CLASS}>
      <div className="space-y-6">
        <div>
          <Button
            size="xl"
            className="w-full"
            onClick={createRoom}
            disabled={isCreatingRoom || isJoiningRoom}
          >
            {isCreatingRoom ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                创建中...
              </>
            ) : (
              "创建房间"
            )}
          </Button>
          <p className={SECTION_HINT_CLASS}>
            生成代码给另一台设备
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">或者</span>
          </div>
        </div>

        <div>
          <div className="flex gap-2">
            <label htmlFor={joinInputId} className="sr-only">
              房间代码
            </label>
            <Input
              id={joinInputId}
              placeholder="输入房间代码"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              className="h-14 border-border bg-input text-center text-xl font-mono uppercase tracking-[0.2em]"
              maxLength={6}
              disabled={isCreatingRoom || isJoiningRoom}
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-describedby={joinHasError ? `${joinHintId} ${joinErrorId}` : joinHintId}
              aria-invalid={joinHasError}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoinRoom()
              }}
            />
            <Button
              variant="secondary"
              size="xl"
              onClick={handleJoinRoom}
              disabled={inputCode.length < 6 || isCreatingRoom || isJoiningRoom}
              aria-label={isJoiningRoom ? "正在加入房间" : "加入房间"}
            >
              {isJoiningRoom ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "加入"
              )}
            </Button>
          </div>
          
          {/* Scan QR Code Button */}
          <Button
            variant="outline"
            size="lg"
            className="w-full mt-3"
            onClick={() => setShowScanner(true)}
            disabled={isCreatingRoom || isJoiningRoom}
          >
            <ScanLine className="w-4 h-4 mr-2" />
            扫描二维码加入
          </Button>
          
          <p id={joinHintId} className={SECTION_HINT_CLASS}>
            输入代码或扫码加入
          </p>
          {joinHasError && (
            <p
              id={joinErrorId}
              className={`mt-2 text-center text-xs ${STATUS_TONES.danger.inline}`}
              aria-live="polite"
            >
              {errorMessage}
            </p>
          )}
        </div>

      </div>

      {/* QR Code Scanner Dialog */}
      <QRCodeScanner
        open={showScanner}
        onOpenChange={setShowScanner}
        onScan={handleScan}
      />
    </div>
  )
}
