"use client"

import { useState, useEffect } from "react"
import { ConnectionStatus, ConnectionInfo, ConnectionType } from "@/lib/types"
import { 
  Wifi, 
  WifiOff, 
  Loader2, 
  AlertCircle, 
  Users, 
  Crown, 
  User,
  Clock,
  Signal,
  Zap,
  Radio,
  Server
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ConnectionStatusDisplayProps {
  status: ConnectionStatus
  isHost: boolean
  peerCount: number
  errorMessage?: string | null
  connectionInfo?: ConnectionInfo
  className?: string
}

// Get display info for connection type
function getConnectionTypeDisplay(type: ConnectionType) {
  switch (type) {
    case "direct":
      return {
        label: "局域网直连",
        description: "设备间直接通信，最快速度",
        icon: Zap,
        color: "text-emerald-500"
      }
    case "stun":
      return {
        label: "P2P 穿透",
        description: "NAT 穿透后直连",
        icon: Radio,
        color: "text-blue-500"
      }
    case "relay":
      return {
        label: "服务器中转",
        description: "通过 TURN 服务器转发",
        icon: Server,
        color: "text-amber-500"
      }
    default:
      return {
        label: "检测中...",
        description: "正在检测连接类型",
        icon: Loader2,
        color: "text-muted-foreground"
      }
  }
}

// Format duration in human readable format
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒`
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    return `${mins}分钟`
  } else {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`
  }
}

export function ConnectionStatusDisplay({ 
  status, 
  isHost, 
  peerCount, 
  errorMessage,
  connectionInfo,
  className 
}: ConnectionStatusDisplayProps) {
  const connectionTypeDisplay = getConnectionTypeDisplay(connectionInfo?.type || "unknown")
  const ConnectionTypeIcon = connectionTypeDisplay.icon
  const [connectedTime, setConnectedTime] = useState(0)
  const [connectionStartTime, setConnectionStartTime] = useState<Date | null>(null)

  // Track connection time
  useEffect(() => {
    if (status === "connected" && peerCount > 0) {
      if (!connectionStartTime) {
        setConnectionStartTime(new Date())
      }
      
      const interval = setInterval(() => {
        if (connectionStartTime) {
          const elapsed = Math.floor((Date.now() - connectionStartTime.getTime()) / 1000)
          setConnectedTime(elapsed)
        }
      }, 1000)
      
      return () => clearInterval(interval)
    } else if (status !== "connected" || peerCount === 0) {
      setConnectionStartTime(null)
      setConnectedTime(0)
    }
  }, [status, peerCount, connectionStartTime])

  // Reset timer when first connected
  useEffect(() => {
    if (status === "connected" && peerCount > 0 && !connectionStartTime) {
      setConnectionStartTime(new Date())
    }
  }, [status, peerCount, connectionStartTime])

  const getStatusConfig = () => {
    switch (status) {
      case "connected":
        return {
          icon: Wifi,
          label: "已连接",
          description: peerCount > 0 
            ? isHost 
              ? `${peerCount} 台设备已连接` 
              : "连接稳定，可以传输"
            : "等待其他设备...",
          bgColor: "bg-emerald-500/10",
          borderColor: "border-emerald-500/20",
          iconColor: "text-emerald-500",
          dotColor: "bg-emerald-500",
          showPulse: peerCount === 0
        }
      case "connecting":
        return {
          icon: Loader2,
          label: isHost ? "等待连接" : "正在连接",
          description: isHost 
            ? "房间已创建，等待其他设备加入..." 
            : "正在建立 P2P 连接...",
          bgColor: "bg-amber-500/10",
          borderColor: "border-amber-500/20",
          iconColor: "text-amber-500",
          dotColor: "bg-amber-500",
          showPulse: true,
          animate: true
        }
      case "reconnecting":
        return {
          icon: Loader2,
          label: "正在重连",
          description: errorMessage || "连接已断开，正在尝试重新连接...",
          bgColor: "bg-blue-500/10",
          borderColor: "border-blue-500/20",
          iconColor: "text-blue-500",
          dotColor: "bg-blue-500",
          showPulse: true,
          animate: true
        }
      case "error":
        return {
          icon: AlertCircle,
          label: "连接失败",
          description: errorMessage || "无法建立连接，请检查网络",
          bgColor: "bg-destructive/10",
          borderColor: "border-destructive/20",
          iconColor: "text-destructive",
          dotColor: "bg-destructive",
          showPulse: false
        }
      case "dissolved":
        return {
          icon: WifiOff,
          label: "房间已解散",
          description: "房主已关闭房间",
          bgColor: "bg-muted/50",
          borderColor: "border-border",
          iconColor: "text-muted-foreground",
          dotColor: "bg-muted-foreground",
          showPulse: false
        }
      default:
        return {
          icon: WifiOff,
          label: "未连接",
          description: "等待建立连接",
          bgColor: "bg-muted/50",
          borderColor: "border-border",
          iconColor: "text-muted-foreground",
          dotColor: "bg-muted-foreground",
          showPulse: false
        }
    }
  }

  const config = getStatusConfig()
  const StatusIcon = config.icon

  return (
    <div className={cn("space-y-3", className)}>
      {/* Main status card */}
      <div className={cn(
        "rounded-lg border p-4 transition-colors",
        config.bgColor,
        config.borderColor
      )}>
        <div className="flex items-start gap-3">
          {/* Status icon with pulse */}
          <div className="relative">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              config.bgColor
            )}>
              <StatusIcon className={cn(
                "w-5 h-5",
                config.iconColor,
                config.animate && "animate-spin"
              )} />
            </div>
            {/* Pulse indicator */}
            {config.showPulse && (
              <span className="absolute top-0 right-0 flex h-3 w-3">
                <span className={cn(
                  "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                  config.dotColor
                )} />
                <span className={cn(
                  "relative inline-flex rounded-full h-3 w-3",
                  config.dotColor
                )} />
              </span>
            )}
          </div>

          {/* Status text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-foreground">{config.label}</h4>
              {/* Role badge */}
              <span className={cn(
                "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
                isHost 
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" 
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
              )}>
                {isHost ? (
                  <>
                    <Crown className="w-3 h-3" />
                    <span>房主</span>
                  </>
                ) : (
                  <>
                    <User className="w-3 h-3" />
                    <span>访客</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {config.description}
            </p>
          </div>
        </div>

        {/* Connection details when connected */}
        {status === "connected" && peerCount > 0 && (
          <div className="mt-4 pt-3 border-t border-border/50">
            <div className="grid grid-cols-3 gap-3">
              {/* Peer count */}
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">设备</p>
                  <p className="text-sm font-medium">{peerCount} 台</p>
                </div>
              </div>
              
              {/* Connection time */}
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">时长</p>
                  <p className="text-sm font-medium">{formatDuration(connectedTime)}</p>
                </div>
              </div>
              
              {/* Connection type */}
              <div className="flex items-center gap-2">
                <ConnectionTypeIcon className={cn(
                  "w-4 h-4",
                  connectionTypeDisplay.color,
                  connectionInfo?.type === "unknown" && "animate-spin"
                )} />
                <div>
                  <p className="text-xs text-muted-foreground">模式</p>
                  <p className="text-sm font-medium">{connectionTypeDisplay.label}</p>
                </div>
              </div>
            </div>
            
            {/* Connection type description */}
            {connectionInfo?.type && connectionInfo.type !== "unknown" && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Signal className="w-3 h-3" />
                {connectionTypeDisplay.description}
                {connectionInfo.protocol && (
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded ml-1">
                    {connectionInfo.protocol.toUpperCase()}
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Tips based on status */}
      {status === "connecting" && isHost && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          <Signal className="w-4 h-4 shrink-0 mt-0.5" />
          <p>提示：在其他设备上输入房间代码或扫描二维码即可加入</p>
        </div>
      )}
      
      {status === "reconnecting" && (
        <div className="flex items-start gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-500/10 rounded-lg p-3">
          <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" />
          <p>连接意外断开，正在自动尝试重新连接，请稍候...</p>
        </div>
      )}
      
      {status === "error" && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>请检查：1) 两设备是否在同一网络 2) 浏览器是否允许 WebRTC 连接 3) 防火墙设置</p>
        </div>
      )}
    </div>
  )
}
