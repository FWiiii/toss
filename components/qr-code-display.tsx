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
      <DialogContent className="w-[calc(100%-2rem)] max-w-[320px] border-border/70 bg-card p-4 shadow-2xl sm:max-w-[320px] sm:p-5">
        <DialogHeader className="gap-1 text-center sm:text-center">
          <DialogTitle className="tracking-tight">扫码加入房间</DialogTitle>
          <DialogDescription>扫描二维码后自动加入这个临时房间</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          <div className="w-full max-w-[208px] rounded-xl border border-border/70 bg-muted/25 p-3">
            <div ref={qrRef} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
              {safeRoomCode
                ? (
                    <QRCodeSVG
                      value={roomUrl}
                      size={160}
                      level="M"
                      marginSize={0}
                      className="mx-auto h-auto w-full"
                      title={`加入 Toss 房间 ${formattedCode}`}
                    />
                  )
                : (
                    <div className="flex aspect-square items-center justify-center text-xs text-muted-foreground">
                      暂无房间码
                    </div>
                  )}
            </div>
          </div>

          <div className="w-full max-w-[208px] rounded-xl border border-border/70 bg-muted/25 px-3 py-2 text-center">
            <p className="text-xs text-muted-foreground">房间代码</p>
            <p className="mt-0.5 font-mono text-xl font-bold tracking-[0.14em] text-foreground">{formattedCode}</p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownload}
            disabled={!safeRoomCode}
            className={cn('w-full max-w-[208px]', saved && 'delight-ready-pulse')}
          >
            {saved
              ? <Check className="mr-2 h-4 w-4 text-success" />
              : <Download className="mr-2 h-4 w-4" />}
            {saved ? '已保存' : '保存二维码'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
