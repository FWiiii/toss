"use client"

import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Download, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

interface QRCodeDisplayProps {
  roomCode: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QRCodeDisplay({ roomCode, open, onOpenChange }: QRCodeDisplayProps) {
  const qrRef = useRef<HTMLDivElement>(null)
  const [origin, setOrigin] = useState("")
  const safeRoomCode = roomCode ?? ""

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin)
    }
  }, [])
  
  // Generate the URL for the room
  const roomUrl = origin && safeRoomCode
    ? `${origin}?join=${safeRoomCode}`
    : ""

  const handleDownload = useCallback(() => {
    if (!safeRoomCode) return
    if (!qrRef.current) return
    
    const svg = qrRef.current.querySelector("svg")
    if (!svg) return

    // Create canvas and draw SVG
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const img = new Image()
    
    img.onload = () => {
      canvas.width = img.width * 2
      canvas.height = img.height * 2
      ctx.fillStyle = "white"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      
      const link = document.createElement("a")
      link.download = `toss-room-${safeRoomCode}.png`
      link.href = canvas.toDataURL("image/png")
      link.click()
    }
    
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)))
  }, [safeRoomCode])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[340px]">
        <DialogHeader>
          <DialogTitle className="text-center">扫码加入房间</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-4 py-4">
          <div 
            ref={qrRef}
            className="bg-white p-4 rounded-xl"
          >
            {safeRoomCode ? (
              <QRCodeSVG
                value={roomUrl}
                size={200}
                level="M"
                marginSize={0}
              />
            ) : (
              <div className="w-[200px] h-[200px] flex items-center justify-center text-xs text-muted-foreground">
                暂无房间码
              </div>
            )}
          </div>
          
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">房间代码</p>
            <p className="text-2xl font-mono font-bold tracking-[0.2em]">
              {safeRoomCode ? `${safeRoomCode.slice(0, 3)} ${safeRoomCode.slice(3)}` : "--"}
            </p>
          </div>
          
          <p className="text-xs text-muted-foreground text-center">
            使用其他设备扫描二维码即可加入房间
          </p>
          
          <Button variant="secondary" size="sm" onClick={handleDownload} disabled={!safeRoomCode}>
            <Download className="w-4 h-4 mr-2" />
            保存二维码
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
