'use client'

import type { StatusTone } from '@/lib/design-tokens'
import type { ConnectionInfo, ConnectionQuality, ConnectionStatus, ConnectionType } from '@/lib/types'
import {
  Activity,
  AlertCircle,
  Crown,
  Gauge,
  Loader2,
  Lock,
  Radio,
  Server,
  Signal,
  User,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { STATUS_TONES } from '@/lib/design-tokens'
import { cn, formatFileSize } from '@/lib/utils'

interface ConnectionStatusDisplayProps {
  status: ConnectionStatus
  isHost: boolean
  peerCount: number
  errorMessage?: string | null
  connectionInfo?: ConnectionInfo
  connectionQuality?: ConnectionQuality
  isEncrypted?: boolean
  className?: string
}

// Get display info for connection type
function getConnectionTypeDisplay(type: ConnectionType) {
  switch (type) {
    case 'direct':
      return {
        label: '局域网直连',
        description: '设备间直接通信，最快速度',
        icon: Zap,
        tone: 'success' as const,
      }
    case 'stun':
      return {
        label: 'P2P 穿透',
        description: 'NAT 穿透后直连',
        icon: Radio,
        tone: 'info' as const,
      }
    case 'relay':
      return {
        label: '服务器中转',
        description: '通过 TURN 服务器转发',
        icon: Server,
        tone: 'warning' as const,
      }
    default:
      return {
        label: '检测中...',
        description: '正在检测连接类型',
        icon: Loader2,
        tone: 'neutral' as const,
      }
  }
}

// Get quality indicator color
function getQualityTone(quality: string): StatusTone {
  switch (quality) {
    case 'excellent':
      return 'success'
    case 'good':
      return 'success'
    case 'fair':
      return 'warning'
    case 'poor':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function ConnectionStatusDisplay({
  status,
  isHost,
  peerCount,
  errorMessage,
  connectionInfo,
  connectionQuality,
  isEncrypted = false,
  className,
}: ConnectionStatusDisplayProps) {
  const connectionTypeDisplay = getConnectionTypeDisplay(connectionInfo?.type || 'unknown')
  const ConnectionTypeIcon = connectionTypeDisplay.icon
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [showConnectionFlash, setShowConnectionFlash] = useState(false)
  const wasReadyRef = useRef(false)

  useEffect(() => {
    if (status !== 'connected' || peerCount === 0) {
      setShowDiagnostics(false)
    }
  }, [peerCount, status])

  useEffect(() => {
    const isReady = status === 'connected' && peerCount > 0
    let timeoutId: number | undefined

    if (isReady && !wasReadyRef.current) {
      setShowConnectionFlash(true)
      timeoutId = window.setTimeout(() => {
        setShowConnectionFlash(false)
      }, 760)
    }

    if (!isReady) {
      setShowConnectionFlash(false)
    }

    wasReadyRef.current = isReady

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [peerCount, status])

  // Generate dynamic description based on connection quality
  const getConnectionDescription = () => {
    if (peerCount === 0)
      return '等待其他设备加入'
    if (isHost)
      return `${peerCount} 台设备已连上，可开始发送`
    return '已连上，可开始发送文本或文件'
  }

  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: Wifi,
          label: '已连接',
          description: getConnectionDescription(),
          tone: 'success' as const,
          showPulse: peerCount === 0,
        }
      case 'connecting':
        return {
          icon: Loader2,
          label: isHost ? '等待连接' : '正在连接',
          description: isHost
            ? '房间已创建，等待其他设备加入...'
            : '正在建立 P2P 连接...',
          tone: 'warning' as const,
          showPulse: true,
          animate: true,
        }
      case 'reconnecting':
        return {
          icon: Loader2,
          label: '正在重连',
          description: errorMessage || '连接已断开，正在尝试重新连接...',
          tone: 'info' as const,
          showPulse: true,
          animate: true,
        }
      case 'error':
        return {
          icon: AlertCircle,
          label: '连接失败',
          description: errorMessage || '无法建立连接，请检查网络',
          tone: 'danger' as const,
          showPulse: false,
        }
      case 'dissolved':
        return {
          icon: WifiOff,
          label: '房间已解散',
          description: '房主已关闭房间',
          tone: 'neutral' as const,
          showPulse: false,
        }
      default:
        return {
          icon: WifiOff,
          label: '未连接',
          description: '等待建立连接',
          tone: 'neutral' as const,
          showPulse: false,
        }
    }
  }

  const config = getStatusConfig()
  const StatusIcon = config.icon
  const tone = STATUS_TONES[config.tone]
  const connectionTone = STATUS_TONES[connectionTypeDisplay.tone]
  const qualityTone
    = connectionQuality && connectionQuality.latency !== null
      ? STATUS_TONES[getQualityTone(connectionQuality.quality)]
      : null
  const hasDiagnostics
    = status === 'connected'
      && peerCount > 0
      && (
        connectionInfo?.type !== 'unknown'
        || connectionQuality?.latency !== null
        || connectionQuality?.bandwidth !== null
        || isEncrypted
      )

  return (
    <div className={cn('space-y-3', className)}>
      {/* Main status card */}
      <div className={cn(
        'relative overflow-hidden rounded-lg border p-4 transition-colors',
        tone.surface,
        showConnectionFlash && 'delight-connected-flash',
      )}
      >
        {showConnectionFlash && (
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-success/10 to-transparent"
            aria-hidden="true"
          />
        )}
        <div className="relative flex items-start gap-3">
          {/* Status icon with pulse */}
          <div className="relative">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full',
              tone.iconSurface,
            )}
            >
              <StatusIcon className={cn(
                'h-5 w-5',
                tone.icon,
                config.animate && 'animate-spin',
              )}
              />
            </div>
            {config.showPulse && (
              <span className="absolute top-0 right-0 flex h-3 w-3 will-change-transform">
                <span className={cn(
                  'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 transform-gpu',
                  tone.dot,
                )}
                />
                <span className={cn(
                  'relative inline-flex h-3 w-3 rounded-full',
                  tone.dot,
                )}
                />
              </span>
            )}
          </div>

          {/* Status text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-foreground">{config.label}</h4>
              {/* Role badge */}
              <span className={cn(
                'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
                isHost
                  ? STATUS_TONES.warning.badge
                  : STATUS_TONES.info.badge,
              )}
              >
                {isHost
                  ? (
                      <>
                        <Crown className="w-3 h-3" />
                        <span>房主</span>
                      </>
                    )
                  : (
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
            {status === 'connected' && peerCount > 0 && (
              <p className={cn(
                'mt-2 text-xs text-muted-foreground',
                showConnectionFlash && 'delight-fade-up',
              )}
              >
                下一步：在下方发送文本，或选择文件与剪贴板内容。
              </p>
            )}
          </div>
        </div>

        {hasDiagnostics && (
          <div className="mt-3 pt-2 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={() => setShowDiagnostics(prev => !prev)}
            >
              {showDiagnostics ? '收起连接详情' : '查看连接详情'}
            </Button>

            {showDiagnostics && (
              <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1.5" title={connectionTypeDisplay.description} aria-label={`连接方式 ${connectionTypeDisplay.label}`}>
                  <ConnectionTypeIcon className={cn(
                    'w-3.5 h-3.5',
                    connectionTone.inline,
                    connectionInfo?.type === 'unknown' && 'animate-spin',
                  )}
                  />
                  <span className={cn('font-medium', connectionTone.inline)}>
                    {connectionTypeDisplay.label}
                  </span>
                </div>

                {connectionQuality && connectionQuality.latency !== null && (
                  <div className="flex items-center gap-1.5" title="网络延迟" aria-label={`网络延迟 ${connectionQuality.latency} 毫秒`}>
                    <Activity className={cn('h-3.5 w-3.5', qualityTone?.inline)} />
                    <span className={cn('font-medium', qualityTone?.inline)}>
                      {connectionQuality.latency}
                      ms
                    </span>
                  </div>
                )}

                {connectionQuality && connectionQuality.bandwidth !== null && (
                  <div className="flex items-center gap-1.5" title="传输速度" aria-label={`传输速度 ${formatFileSize(connectionQuality.bandwidth)} 每秒`}>
                    <Gauge className="w-3.5 h-3.5" />
                    <span className="font-medium text-foreground">
                      {formatFileSize(connectionQuality.bandwidth)}
                      /s
                    </span>
                  </div>
                )}

                {isEncrypted && (
                  <div className="flex items-center gap-1.5" title="端到端加密已启用" aria-label="端到端加密已启用">
                    <Lock className={cn('w-3.5 h-3.5', STATUS_TONES.success.inline)} />
                    <span className={cn('font-medium', STATUS_TONES.success.inline)}>已加密</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tips based on status */}
      {status === 'connecting' && isHost && (
        <div className={cn(
          'flex items-start gap-2 p-3 text-xs',
          STATUS_TONES.neutral.calloutSurface,
          STATUS_TONES.neutral.calloutText,
        )}
        >
          <Signal className="mt-0.5 h-4 w-4 shrink-0" />
          <p>提示：在其他设备上输入房间代码或扫描二维码即可加入</p>
        </div>
      )}

      {status === 'reconnecting' && (
        <div
          className={cn(
            'flex items-start gap-2 p-3 text-xs',
            STATUS_TONES.info.calloutSurface,
            STATUS_TONES.info.calloutText,
          )}
          role="status"
          aria-live="polite"
        >
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <p>连接意外断开，正在自动尝试重新连接，请稍候...</p>
        </div>
      )}

      {status === 'error' && (
        <div
          className={cn(
            'flex items-start gap-2 p-3 text-xs',
            STATUS_TONES.neutral.calloutSurface,
            STATUS_TONES.neutral.calloutText,
          )}
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>请检查：1) 两设备是否在同一网络 2) 浏览器是否允许 WebRTC 连接 3) 防火墙设置</p>
        </div>
      )}
    </div>
  )
}
