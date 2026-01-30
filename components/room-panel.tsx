"use client"

import { useState } from "react"
import { useTransfer } from "@/lib/transfer-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Copy, Check, LogOut, Users, Wifi, WifiOff, Loader2, AlertCircle } from "lucide-react"

export function RoomPanel() {
  const { roomCode, connectionStatus, errorMessage, createRoom, joinRoom, leaveRoom, peerCount } = useTransfer()
  const [inputCode, setInputCode] = useState("")
  const [copied, setCopied] = useState(false)

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

  if (roomCode) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {connectionStatus === "connected" ? (
              <Wifi className="w-4 h-4 text-accent" />
            ) : connectionStatus === "connecting" ? (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            ) : connectionStatus === "error" ? (
              <AlertCircle className="w-4 h-4 text-destructive" />
            ) : (
              <WifiOff className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">
              {connectionStatus === "connected" 
                ? "已连接" 
                : connectionStatus === "connecting" 
                  ? "等待连接..." 
                  : connectionStatus === "error"
                    ? "连接失败"
                    : "未连接"}
            </span>
          </div>
          {peerCount > 0 && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>{peerCount}</span>
            </div>
          )}
        </div>

        <div className="text-center mb-6">
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
          <p className="text-xs text-muted-foreground mt-3">
            {connectionStatus === "connecting" 
              ? "等待其他设备加入..." 
              : connectionStatus === "connected"
                ? "已有设备连接，可以开始传输"
                : connectionStatus === "error"
                  ? errorMessage || "连接失败"
                  : "在其他设备上输入此代码即可连接"}
          </p>
          {connectionStatus === "error" && (
            <p className="text-xs text-destructive mt-2">{errorMessage}</p>
          )}
        </div>

        <Button
          variant="outline"
          className="w-full bg-transparent"
          onClick={leaveRoom}
        >
          <LogOut className="w-4 h-4 mr-2" />
          离开房间
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="space-y-6">
        <div>
          <Button
            className="w-full h-14 text-lg font-medium bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={createRoom}
          >
            创建房间
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
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoinRoom()
              }}
            />
            <Button
              variant="secondary"
              className="h-14 px-6"
              onClick={handleJoinRoom}
              disabled={inputCode.length < 6}
            >
              加入
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            输入其他设备上显示的6位代码
          </p>
          {errorMessage && connectionStatus === "error" && (
            <p className="text-xs text-destructive text-center mt-2">{errorMessage}</p>
          )}
        </div>
      </div>
    </div>
  )
}
