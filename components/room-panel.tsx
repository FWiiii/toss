'use client'

import { AlertCircle, Check, Copy, Loader2, LogOut, Plus, QrCode, ScanLine } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useId, useRef, useState } from 'react'
import { ConnectionStatusDisplay } from '@/components/connection-status'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { useJoinCode } from '@/hooks/use-join-code'
import { STATUS_TONES } from '@/lib/design-tokens'
import { useTransfer } from '@/lib/transfer-context'
import { cn } from '@/lib/utils'

const CARD_CLASS = 'panel-surface relative overflow-hidden p-4'
const ROOM_CODE_SANITIZE_REGEX = /[^A-Z0-9]/g
const QRCodeDisplay = dynamic(
  () => import('@/components/qr-code-display').then(mod => mod.QRCodeDisplay),
  { ssr: false },
)
const QRCodeScanner = dynamic(
  () => import('@/components/qr-code-scanner').then(mod => mod.QRCodeScanner),
  { ssr: false },
)

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
    isEncrypted,
    encryptionFingerprint,
  } = useTransfer()
  const { joinCode, clearJoinCode } = useJoinCode()
  const [inputCode, setInputCode] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle')
  const [showQRCode, setShowQRCode] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const copyResetTimerRef = useRef<number | null>(null)
  const joinInputId = useId()
  const joinHintId = useId()
  const joinErrorId = useId()

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current)
      }
    }
  }, [])

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
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current)
      }

      try {
        // Try modern clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(roomCode)
        }
        else {
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
        setCopyState('success')
        copyResetTimerRef.current = window.setTimeout(setCopyState, 2000, 'idle')
      }
      catch {
        setCopyState('error')
        copyResetTimerRef.current = window.setTimeout(setCopyState, 2500, 'idle')
      }
    }
  }

  const handleJoinRoom = () => {
    if (inputCode.length >= 6) {
      joinRoom(inputCode)
    }
  }

  const formatCode = (code: string) => {
    return `${code.slice(0, 3)} ${code.slice(3)}`
  }

  const joinHasError = connectionStatus === 'error' && Boolean(errorMessage)
  const roomCodeCopied = copyState === 'success'
  const roomCodeCopyFailed = copyState === 'error'
  const copyAnnouncement = roomCodeCopyFailed
    ? '复制失败，请手动输入房间代码'
    : roomCodeCopied
      ? `已复制，可在另一台设备粘贴${isHost ? ' · 或直接让对方扫码' : ''}`
      : ''

  const handleLeaveRoom = () => {
    if (
      isHost
      && roomCode
      && (
        connectionStatus === 'connecting'
        || connectionStatus === 'connected'
        || connectionStatus === 'reconnecting'
      )
    ) {
      setShowLeaveConfirm(true)
      return
    }

    leaveRoom()
  }

  const handleConfirmLeaveRoom = () => {
    setShowLeaveConfirm(false)
    leaveRoom()
  }

  // Room dissolved state - show return button
  if (connectionStatus === 'dissolved') {
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

  const isConnected = connectionStatus === 'connected' && peerCount > 0
  if (roomCode || isConnected) {
    return (
      <div className={CARD_CLASS}>
        {/* Room Code Display */}
        {roomCode && (
          <div className="mb-4 text-center">
            <p className="mb-1 text-xs tracking-[0.16em] text-muted-foreground">房间代码</p>
            <div className="relative overflow-hidden rounded-xl border border-border/70 bg-muted/35 px-3 py-2.5">
              {roomCodeCopied && <div className="pointer-events-none absolute inset-0 delight-sweep-overlay" aria-hidden="true" />}
              <div className="relative flex min-w-0 items-center justify-center rounded-lg px-8 py-0.5">
                <span className="min-w-0 text-center font-mono text-2xl font-bold tracking-[0.14em] text-foreground sm:text-3xl sm:tracking-[0.16em]">
                  {formatCode(roomCode)}
                </span>
                <Button
                  variant={roomCodeCopied ? 'outline' : 'ghost'}
                  size="icon-sm"
                  className={cn(
                    'absolute right-0 top-1/2 -translate-y-1/2 transition-colors',
                    roomCodeCopied && `${STATUS_TONES.success.surface} ${STATUS_TONES.success.inline} border-success/40 hover:bg-success/15`,
                  )}
                  onClick={handleCopyCode}
                  aria-label={roomCodeCopied ? '房间代码已复制' : '复制房间代码'}
                  title={roomCodeCopied ? '房间代码已复制' : '复制房间代码'}
                >
                  {roomCodeCopied ? <Check className={`h-5 w-5 ${STATUS_TONES.success.inline}`} /> : <Copy className="h-5 w-5" />}
                </Button>
              </div>
              <p className="mt-1 text-center text-xs text-muted-foreground">输入代码或扫描二维码加入</p>
            </div>
            <p
              className={cn(
                'mt-1 min-h-[1rem] text-xs transition-all duration-200',
                roomCodeCopied || roomCodeCopyFailed ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
                roomCodeCopyFailed ? STATUS_TONES.danger.inline : 'text-muted-foreground',
              )}
              aria-live={copyAnnouncement ? 'polite' : 'off'}
              aria-atomic="true"
            >
              {copyAnnouncement}
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
          encryptionFingerprint={encryptionFingerprint}
          className="mb-4"
        />

        {/* Action Buttons */}
        <div className="flex gap-2">
          {isHost && roomCode && (
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowQRCode(true)}>
              <QrCode className="h-4 w-4" />
              二维码
            </Button>
          )}
          <Button
            variant={isHost ? 'destructive' : 'outline'}
            size="sm"
            className={isHost ? 'flex-1' : 'w-full'}
            onClick={handleLeaveRoom}
          >
            <LogOut className="h-4 w-4" />
            {isHost ? '解散' : '离开'}
          </Button>
        </div>

        {/* QR Code Display Dialog */}
        {showQRCode && (
          <QRCodeDisplay
            roomCode={roomCode}
            open={showQRCode}
            onOpenChange={setShowQRCode}
          />
        )}

        <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
          <DialogContent className="sm:max-w-md" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>确认解散房间</DialogTitle>
              <DialogDescription>
                解散后所有连接会立即中断，且当前房间代码会失效。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLeaveConfirm(false)}>
                取消
              </Button>
              <Button variant="destructive" onClick={handleConfirmLeaveRoom}>
                解散房间
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className={CARD_CLASS}>
      <div className="mb-3">
        <h3 className="text-base font-semibold tracking-tight text-foreground">连接设备</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">创建房间或输入代码加入</p>
      </div>
      <div className="space-y-4">
        <Button
          size="lg"
          className="w-full"
          onClick={createRoom}
          disabled={isCreatingRoom || isJoiningRoom}
        >
          {isCreatingRoom
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Plus className="h-4 w-4" />}
          {isCreatingRoom ? '创建中...' : '创建房间'}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">或加入现有房间</span>
          </div>
        </div>

        <div>
          <div className="flex gap-2">
            <label htmlFor={joinInputId} className="sr-only">房间代码</label>
            <Input
              id={joinInputId}
              placeholder="输入房间代码"
              value={inputCode}
              onChange={e => setInputCode(e.target.value.toUpperCase().replace(ROOM_CODE_SANITIZE_REGEX, '').slice(0, 6))}
              className="h-12 border-border bg-muted/40 text-center text-lg font-mono uppercase tracking-[0.18em]"
              maxLength={6}
              disabled={isCreatingRoom || isJoiningRoom}
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-describedby={joinHasError ? `${joinHintId} ${joinErrorId}` : joinHintId}
              aria-invalid={joinHasError}
              onKeyDown={(e) => {
                if (e.key === 'Enter')
                  handleJoinRoom()
              }}
            />
            <Button
              variant="secondary"
              size="lg"
              onClick={handleJoinRoom}
              disabled={inputCode.length < 6 || isCreatingRoom || isJoiningRoom}
              aria-label={isJoiningRoom ? '正在加入房间' : '加入房间'}
            >
              {isJoiningRoom
                ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  )
                : (
                    '加入'
                  )}
            </Button>
          </div>

          {/* Scan QR Code Button */}
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setShowScanner(true)}
            disabled={isCreatingRoom || isJoiningRoom}
          >
            <ScanLine className="h-4 w-4" />
            扫码加入
          </Button>

          <p id={joinHintId} className="sr-only">输入另一台设备提供的 6 位房间代码，或扫描二维码加入。</p>
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
      {showScanner && (
        <QRCodeScanner
          open={showScanner}
          onOpenChange={setShowScanner}
          onScan={handleScan}
        />
      )}
    </div>
  )
}
