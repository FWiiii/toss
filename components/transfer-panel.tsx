"use client"

import React from "react"

import { useState, useRef, useCallback, useEffect } from "react"
import { useTransfer } from "@/lib/transfer-context"
import { useShareTarget } from "@/hooks/use-share-target"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, Upload, FileText, File as FileIcon, Download, Trash2, ImageIcon, Share2 } from "lucide-react"
import { cn } from "@/lib/utils"

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
}

function getFileIcon(name?: string) {
  if (!name) return FileIcon
  const ext = name.split(".").pop()?.toLowerCase()
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || "")) return ImageIcon
  if (["txt", "md", "json", "js", "ts", "html", "css"].includes(ext || "")) return FileText
  return FileIcon
}

export function TransferPanel() {
  const { connectionStatus, items, sendText, sendFile, clearHistory, peerCount } = useTransfer()
  const { sharedFiles, sharedText, hasSharedContent, clearSharedData } = useShareTarget()
  const [text, setText] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [pendingShare, setPendingShare] = useState<{ files: File[], text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const hasProcessedShareRef = useRef(false)

  const isConnected = connectionStatus === "connected" && peerCount > 0

  // Handle shared content from Web Share Target
  useEffect(() => {
    // Only process once
    if (!hasSharedContent || hasProcessedShareRef.current) {
      return
    }

    if (isConnected) {
      hasProcessedShareRef.current = true
      // Send with a small delay to ensure connection is stable
      const timer = setTimeout(async () => {
        if (sharedText) {
          sendText(sharedText)
        }
        // Send files sequentially
        for (const file of sharedFiles) {
          await sendFile(file)
        }
        clearSharedData()
      }, 500)
      return () => clearTimeout(timer)
    } else {
      // Store pending share data (only once)
      hasProcessedShareRef.current = true
      setPendingShare({ files: [...sharedFiles], text: sharedText })
      // Pre-fill text input
      if (sharedText) {
        setText(sharedText)
      }
      clearSharedData()
    }
  }, [hasSharedContent, isConnected, sharedFiles, sharedText, sendText, sendFile, clearSharedData])

  // Send pending share when connected
  useEffect(() => {
    if (!isConnected || !pendingShare || pendingShare.files.length === 0) {
      return
    }

    // Delay sending to ensure connection is fully established
    const filesToSend = [...pendingShare.files]
    setPendingShare(null)
    
    const timer = setTimeout(async () => {
      for (const file of filesToSend) {
        await sendFile(file)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [isConnected, pendingShare, sendFile])

  // Auto scroll to bottom when new items arrive
  useEffect(() => {
    if (items.length > 0) {
      // Check if mobile (< 1024px)
      const isMobile = window.innerWidth < 1024
      
      if (isMobile) {
        // On mobile, scroll the entire page to bottom
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: 'smooth'
        })
      } else if (listRef.current) {
        // On desktop, scroll the list container
        listRef.current.scrollTop = listRef.current.scrollHeight
      }
    }
  }, [items.length])

  const handleSendText = () => {
    if (text.trim() && isConnected) {
      sendText(text)
      setText("")
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && isConnected) {
      sendFile(file)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleDownload = (url: string, name?: string) => {
    const a = document.createElement("a")
    a.href = url
    a.download = name || "download"
    a.click()
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (isConnected) {
      setIsDragging(true)
    }
  }, [isConnected])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    if (!isConnected) return
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      sendFile(files[0])
    }
  }, [isConnected, sendFile])

  return (
    <div 
      className={cn(
        "rounded-xl border bg-card flex flex-col lg:h-full lg:min-h-0 transition-colors relative",
        isDragging ? "border-accent border-2 bg-accent/5" : "border-border"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">传输记录</h3>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearHistory}
            className="text-muted-foreground hover:text-foreground h-8"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            清空
          </Button>
        )}
      </div>

      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-accent/10 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
          <div className="text-center">
            <Upload className="w-12 h-12 text-accent mx-auto mb-2" />
            <p className="text-accent font-medium">释放以上传文件</p>
          </div>
        </div>
      )}

      {/* Pending Share Notice */}
      {pendingShare && !isConnected && (
        <div className="mx-4 mt-4 p-3 rounded-lg bg-accent/10 border border-accent/20">
          <div className="flex items-center gap-2 text-sm text-accent">
            <Share2 className="w-4 h-4" />
            <span>有待发送的分享内容，请先连接设备</span>
          </div>
          {pendingShare.files.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {pendingShare.files.length} 个文件待发送
            </p>
          )}
        </div>
      )}

      {/* Items List - 移动端自然高度，桌面端固定高度可滚动 */}
      <div ref={listRef} className="flex-1 lg:overflow-y-auto p-4 space-y-3 lg:min-h-0">
        {items.length === 0 && !pendingShare ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <Send className="w-7 h-7" />
            </div>
            <p className="text-sm">
              {isConnected ? "发送文本或文件开始传输" : "连接设备后开始传输"}
            </p>
          </div>
        ) : (
          items.map((item) => {
            // System messages
            if (item.type === "system") {
              return (
                <div key={item.id} className="flex justify-center">
                  <div className="px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground">
                    {item.content}
                  </div>
                </div>
              )
            }
            
            const IconComponent = getFileIcon(item.name)
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-lg p-3",
                  item.direction === "sent" ? "bg-primary/10 ml-8" : "bg-secondary mr-8"
                )}
              >
                <div className="flex items-start gap-3">
                  {item.type === "file" && (
                    <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0">
                      <IconComponent className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {item.type === "text" ? (
                      <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                        {item.content}
                      </p>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(item.size || 0)}</p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatTime(item.timestamp)} · {item.direction === "sent" ? "已发送" : "已接收"}
                    </p>
                  </div>
                  {item.type === "file" && item.direction === "received" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDownload(item.content, item.name)}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2 mb-2">
          <Textarea
            placeholder={isConnected ? "输入要发送的文本..." : "连接设备后可发送内容"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!isConnected}
            className="min-h-[80px] resize-none bg-input border-border"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSendText()
              }
            }}
          />
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="outline"
            className="flex-1 bg-transparent"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConnected}
          >
            <Upload className="w-4 h-4 mr-2" />
            选择文件
          </Button>
          <Button
            className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={handleSendText}
            disabled={!isConnected || !text.trim()}
          >
            <Send className="w-4 h-4 mr-2" />
            发送文本
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          按 Ctrl/Cmd + Enter 快速发送
        </p>
      </div>
    </div>
  )
}
