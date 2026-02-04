"use client"

import { useState, useEffect } from "react"
import { useTransfer } from "@/lib/transfer-context"
import { useJoinCode } from "@/hooks/use-join-code"
import { useDeviceDiscovery } from "@/hooks/use-device-discovery"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { QRCodeDisplay } from "@/components/qr-code-display"
import { QRCodeScanner } from "@/components/qr-code-scanner"
import { ConnectionStatusDisplay } from "@/components/connection-status"
import { Copy, Check, LogOut, Loader2, AlertCircle, QrCode, ScanLine, Laptop, Smartphone, Tablet } from "lucide-react"

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
    connectToPeer,
    leaveRoom, 
    peerCount, 
    isHost,
    isCreatingRoom,
    isJoiningRoom,
    isEncrypted,
    selfPeerId
  } = useTransfer()
  const { joinCode, clearJoinCode } = useJoinCode()
  const { devices: nearbyDevices, isLoading: isDiscoveryLoading } = useDeviceDiscovery({
    enabled: true,
    isHost,
    roomCode,
    peerId: selfPeerId,
  })
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

  const getDeviceIcon = (deviceType: "mobile" | "desktop" | "tablet" | "unknown") => {
    if (deviceType === "mobile") return Smartphone
    if (deviceType === "tablet") return Tablet
    return Laptop
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
        {roomCode ? (
          <div className="text-center mb-5">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">房间代码</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-4xl font-mono font-bold tracking-[0.3em] text-foreground">
                {formatCode(roomCode)}
              </span>
              <Button variant="ghost" size="icon-sm" onClick={handleCopyCode}>
                {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center mb-5">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">直连模式</p>
            <div className="text-lg font-semibold text-foreground">已连接附近设备</div>
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
              className="h-14 text-center text-xl font-mono tracking-[0.2em] uppercase bg-input border-border focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-border"
              maxLength={6}
              disabled={isCreatingRoom || isJoiningRoom}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoinRoom()
              }}
            />
            <Button
              variant="secondary"
              size="xl"
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
            size="lg"
            className="w-full mt-3"
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

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">附近设备</span>
          </div>
        </div>

        <div>
          {nearbyDevices.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground">
              {isDiscoveryLoading ? "正在搜索设备..." : "未发现可连接设备"}
              <p className="mt-1">基于同公网 IP 自动发现</p>
            </div>
          ) : (
            <div className="space-y-2">
              {nearbyDevices.map((device) => {
                const Icon = getDeviceIcon(device.deviceType)
                return (
                  <div
                    key={device.deviceId}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{device.name}</p>
                        <p className="text-xs text-muted-foreground">可直接连接</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => connectToPeer(device.peerId)}
                      disabled={isCreatingRoom || isJoiningRoom}
                    >
                      连接
                    </Button>
                  </div>
                )
              })}
            </div>
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
