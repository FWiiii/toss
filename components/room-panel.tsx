"use client"

import { useState, useEffect } from "react"
import { useTransfer } from "@/lib/transfer-context"
import { useJoinCode } from "@/hooks/use-join-code"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { QRCodeDisplay } from "@/components/qr-code-display"
import { QRCodeScanner } from "@/components/qr-code-scanner"
import { ConnectionStatusDisplay } from "@/components/connection-status"
import { Copy, Check, LogOut, Loader2, AlertCircle, QrCode, ScanLine } from "lucide-react"

// Common card style to reduce duplication
const CARD_CLASS = "rounded-xl border border-border bg-card p-6"

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
    isJoiningRoom
  } = useTransfer()
  const { joinCode, clearJoinCode } = useJoinCode()
  const [inputCode, setInputCode] = useState("")
  const [copied, setCopied] = useState(false)
  const [showQRCode, setShowQRCode] = useState(false)
  const [showScanner, setShowScanner] = useState(false)

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

  // Room dissolved state - show return button
  if (connectionStatus === "dissolved") {
    return (
      <div className={CARD_CLASS}>
        <EmptyState
          icon={AlertCircle}
          title="房间已解散"
          description="房主已关闭房间，连接已断开"
          iconClassName="bg-destructive/10 text-destructive"
        />
        <Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mt-2"
          onClick={leaveRoom}
        >
          返回首页
        </Button>
      </div>
    )
  }

  if (roomCode) {
    return (
      <div className={CARD_CLASS}>
        {/* Room Code Display */}
        <div className="text-center mb-5">
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">房间代码</p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-4xl font-mono font-bold tracking-[0.3em] text-foreground">
              {formatCode(roomCode)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopyCode}
              className="text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check className="w-5 h-5 text-accent" /> : <Copy className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Connection Status Display */}
        <ConnectionStatusDisplay
          status={connectionStatus}
          isHost={isHost}
          peerCount={peerCount}
          errorMessage={errorMessage}
          connectionInfo={connectionInfo}
          connectionQuality={connectionQuality}
          className="mb-5"
        />

        {/* Action Buttons */}
        <div className="flex gap-2">
          {isHost && (
            <Button
              variant="outline"
              className="flex-1 bg-transparent"
              onClick={() => setShowQRCode(true)}
            >
              <QrCode className="w-4 h-4 mr-2" />
              显示二维码
            </Button>
          )}
          <Button
            variant="outline"
            className={isHost ? "flex-1 bg-transparent" : "w-full bg-transparent"}
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
            className="w-full h-14 text-lg font-medium bg-primary text-primary-foreground hover:bg-primary/90"
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
          <p className="text-xs text-muted-foreground text-center mt-2">
            生成一个房间代码，分享给其他设备
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
            <Input
              placeholder="输入房间代码"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              className="h-14 text-center text-xl font-mono tracking-[0.2em] uppercase bg-input border-border"
              maxLength={6}
              disabled={isCreatingRoom || isJoiningRoom}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoinRoom()
              }}
            />
            <Button
              variant="secondary"
              className="h-14 px-6"
              onClick={handleJoinRoom}
              disabled={inputCode.length < 6 || isCreatingRoom || isJoiningRoom}
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
            className="w-full mt-3 h-12 bg-transparent"
            onClick={() => setShowScanner(true)}
            disabled={isCreatingRoom || isJoiningRoom}
          >
            <ScanLine className="w-4 h-4 mr-2" />
            扫描二维码加入
          </Button>
          
          <p className="text-xs text-muted-foreground text-center mt-2">
            输入房间代码或扫描二维码加入
          </p>
          {errorMessage && connectionStatus === "error" && (
            <p className="text-xs text-destructive text-center mt-2">{errorMessage}</p>
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
