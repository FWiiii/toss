'use client'

import { Check, Download } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface QRCodeDisplayProps {
  roomCode: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QRCodeDisplay({ roomCode, open, onOpenChange }: QRCodeDisplayProps) {
  const qrRef = useRef<HTMLDivElement>(null)
  const [saved, setSaved] = useState(false)
  const safeRoomCode = roomCode ?? ''
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  // Generate the URL for the room
  const roomUrl = origin && safeRoomCode
    ? `${origin}?join=${safeRoomCode}`
    : ''
  const formattedCode = safeRoomCode ? `${safeRoomCode.slice(0, 3)} ${safeRoomCode.slice(3)}` : '--'
  const codeChars = Array.from(formattedCode).map((char, idx) => ({
    char,
    id: char === ' ' ? 'separator' : idx < 3 ? `prefix-${idx + 1}` : `suffix-${idx}`,
  }))

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setSaved(false)
    }
    onOpenChange(nextOpen)
  }, [onOpenChange])

  const handleDownload = useCallback(() => {
    if (!safeRoomCode)
      return
    if (!qrRef.current)
      return

    const svg = qrRef.current.querySelector('svg')
    if (!svg)
      return

    // Create canvas and draw SVG
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx)
      return

    const svgData = new XMLSerializer().serializeToString(svg)
    const img = new Image()

    img.onload = () => {
      canvas.width = img.width * 2
      canvas.height = img.height * 2
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const link = document.createElement('a')
      link.download = `toss-room-${safeRoomCode}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      setSaved(true)
      window.setTimeout(() => {
        setSaved(false)
      }, 1600)
    }

    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`
  }, [safeRoomCode])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border/70 bg-card shadow-2xl sm:max-w-[360px] sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-center tracking-tight">扫码加入房间</DialogTitle>
          <DialogDescription className="text-center">用另一台设备扫描二维码，即可安全加入这个临时房间</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div className="delight-preview-in relative rounded-[1.75rem] border border-accent/20 bg-gradient-to-br from-accent/10 via-background to-info/10 p-5 shadow-sm">
            <span className="pointer-events-none absolute left-3 top-3 h-5 w-5 rounded-tl-lg border-l-2 border-t-2 border-accent/60" aria-hidden="true" />
            <span className="pointer-events-none absolute right-3 top-3 h-5 w-5 rounded-tr-lg border-r-2 border-t-2 border-accent/60" aria-hidden="true" />
            <span className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 rounded-bl-lg border-b-2 border-l-2 border-accent/60" aria-hidden="true" />
            <span className="pointer-events-none absolute bottom-3 right-3 h-5 w-5 rounded-br-lg border-b-2 border-r-2 border-accent/60" aria-hidden="true" />
            <div
              ref={qrRef}
              className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-black/5"
            >
              {safeRoomCode
                ? (
                    <QRCodeSVG
                      value={roomUrl}
                      size={200}
                      level="M"
                      marginSize={0}
                      title={`加入 Toss 房间 ${formattedCode}`}
                    />
                  )
                : (
                    <div className="w-[200px] h-[200px] flex items-center justify-center text-xs text-muted-foreground">
                      暂无房间码
                    </div>
                  )}
            </div>
          </div>

          <div className="text-center delight-fade-up">
            <p className="text-sm text-muted-foreground mb-1">房间代码</p>
            <p className="text-2xl font-mono font-bold tracking-[0.16em]">
              {codeChars.map(({ char, id }, index) => (
                char === ' '
                  ? (
                      <span key={id} className="mx-1" aria-hidden="true">
                        {' '}
                      </span>
                    )
                  : (
                      <span
                        key={id}
                        className="delight-code-char"
                        style={{ animationDelay: `${index * 40}ms` }}
                      >
                        {char}
                      </span>
                    )
              ))}
            </p>
          </div>

          <p className="text-xs text-muted-foreground text-center delight-fade-up">
            使用其他设备扫描二维码即可加入房间
          </p>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownload}
            disabled={!safeRoomCode}
            className={cn(saved && 'delight-ready-pulse')}
          >
            {saved
              ? (
                  <Check className="w-4 h-4 mr-2 text-success" />
                )
              : (
                  <Download className="w-4 h-4 mr-2" />
                )}
            {saved ? '已保存' : '保存二维码'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
