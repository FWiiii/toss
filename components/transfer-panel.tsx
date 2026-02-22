"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useTransfer } from "@/lib/transfer-context"
import { useShareTarget } from "@/hooks/use-share-target"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { TransferItemComponent } from "@/components/transfer-item"
import { ImagePreviewDialog } from "@/components/image-preview-dialog"
import { TransferInput } from "@/components/transfer-input"
import { Send, Trash2, Share2, Upload } from "lucide-react"
import { cn } from "@/lib/utils"

export function TransferPanel() {
  const {
    connectionStatus,
    items,
    sendText,
    sendFile,
    cancelTransfer,
    clearHistory,
    peerCount,
    sendingCount,
    suspendAutoReconnect,
  } = useTransfer()
  const { sharedFiles, sharedText, hasSharedContent, clearSharedData } = useShareTarget()
  const [text, setText] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [pendingShare, setPendingShare] = useState<{ files: File[], text: string } | null>(null)
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [isSendingClipboard, setIsSendingClipboard] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const hasProcessedShareRef = useRef(false)
  const hasFocusedRef = useRef(false)

  const isConnected = connectionStatus === "connected" && peerCount > 0
  
  useEffect(() => {
    if (!isConnected) {
      hasFocusedRef.current = false
      return
    }
    if (hasFocusedRef.current) return
    hasFocusedRef.current = true
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLTextAreaElement>('[data-transfer-input] textarea')
      if (input) {
        input.focus()
      }
    })
  }, [isConnected])
  const activeItems = items.filter((item) => item.status === "transferring" || item.status === "pending")
  const completedItems = items.filter((item) => !(item.status === "transferring" || item.status === "pending"))
  const hasItems = activeItems.length > 0 || completedItems.length > 0

  const sendFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    if (!isConnected) {
      setPendingShare((prev) => ({
        files: [...(prev?.files ?? []), ...files],
        text: prev?.text ?? "",
      }))
      return
    }

    for (const file of files) {
      await sendFile(file)
    }
  }, [isConnected, sendFile])

  const handleSendClipboard = useCallback(async () => {
    if (!isConnected || !navigator.clipboard) return
    setIsSendingClipboard(true)

    try {
      const files: File[] = []
      if (navigator.clipboard.read) {
        try {
          const items = await navigator.clipboard.read()
          for (const item of items) {
            const imageType = item.types.find((type) => type.startsWith("image/"))
            if (imageType) {
              const blob = await item.getType(imageType)
              const ext = imageType.split("/")[1] || "png"
              files.push(new File([blob], `clipboard-${Date.now()}.${ext}`, { type: imageType }))
            }
          }
        } catch {
          // Ignore if read permission is not granted
        }
      }

      let textData = ""
      try {
        textData = await navigator.clipboard.readText()
      } catch {
        textData = ""
      }

      if (files.length > 0) {
        await sendFiles(files)
      }
      if (textData.trim()) {
        sendText(textData)
      }
    } finally {
      setIsSendingClipboard(false)
    }
  }, [isConnected, sendFiles, sendText])

  // Handle shared content from Web Share Target
  useEffect(() => {
    if (!hasSharedContent || hasProcessedShareRef.current) {
      return
    }

    if (isConnected) {
      hasProcessedShareRef.current = true
      const timer = setTimeout(async () => {
        if (sharedText) {
          sendText(sharedText)
        }
        await sendFiles(sharedFiles)
        clearSharedData()
      }, 500)
      return () => clearTimeout(timer)
    } else {
      hasProcessedShareRef.current = true
      setPendingShare({ files: [...sharedFiles], text: sharedText })
      if (sharedText) {
        setText(sharedText)
      }
      clearSharedData()
    }
  }, [hasSharedContent, isConnected, sharedFiles, sharedText, sendText, sendFile, clearSharedData])

  // Send pending share when connected
  useEffect(() => {
    if (!isConnected || !pendingShare) {
      return
    }

    const filesToSend = [...pendingShare.files]
    const textToSend = pendingShare.text
    setPendingShare(null)

    const timer = setTimeout(async () => {
      if (textToSend.trim()) {
        sendText(textToSend)
      }
      if (filesToSend.length > 0) {
        await sendFiles(filesToSend)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [isConnected, pendingShare, sendFiles, sendText])

  // Auto scroll to bottom when new items arrive
  useEffect(() => {
    if (items.length === 0) return

    // Double requestAnimationFrame to ensure layout is complete
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const isMobile = window.innerWidth < 1024
        
        if (isMobile) {
          // On mobile, scroll to the input area smoothly
          const inputArea = document.querySelector('[data-transfer-input]')
          if (inputArea) {
            inputArea.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'end',
              inline: 'nearest' 
            })
          } else {
            // Fallback: smooth scroll to bottom
            window.scrollTo({
              top: document.documentElement.scrollHeight,
              behavior: 'smooth'
            })
          }
        } else if (listRef.current) {
          // Desktop: smooth scroll in container
          listRef.current.scrollTo({
            top: listRef.current.scrollHeight,
            behavior: 'smooth'
          })
        }
      })
    })
  }, [items.length])

  const handleSendText = useCallback(() => {
    if (text.trim() && isConnected) {
      sendText(text)
      setText("")
    }
  }, [text, isConnected, sendText])

  const handleBeforeFilePick = useCallback(() => {
    // On some mobile browsers, opening the file picker can trigger visibility
    // transitions. Suspend auto-reconnect briefly to avoid state flapping.
    suspendAutoReconnect(20000)
  }, [suspendAutoReconnect])

  const handleDownload = useCallback((url: string, name?: string) => {
    const a = document.createElement("a")
    a.href = url
    a.download = name || "download"
    a.click()
  }, [])

  const handlePreviewImage = useCallback((url: string, name: string) => {
    setPreviewImage({ url, name })
  }, [])

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
      sendFiles(Array.from(files))
    }
  }, [isConnected, sendFiles])

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
          <Button variant="ghost" size="sm" onClick={clearHistory}>
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

      {/* Items List */}
      <div
        ref={listRef}
        className="flex-1 lg:overflow-y-auto p-4 space-y-2 min-h-[300px] lg:min-h-0"
        style={{ willChange: 'scroll-position' }}
      >
        {!hasItems && !pendingShare ? (
          <EmptyState
            icon={Send}
            description={isConnected ? "发送文本或文件开始传输" : "连接设备后开始传输"}
            containerClassName="h-full"
          />
        ) : (
          <div className="space-y-3">
            {activeItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>进行中</span>
                  <span>{activeItems.length}</span>
                </div>
                <div className="space-y-2">
                  {activeItems.map((item) => (
                    <TransferItemComponent
                      key={item.id}
                      item={item}
                      onPreviewImage={handlePreviewImage}
                      onDownload={handleDownload}
                      onCancel={cancelTransfer}
                    />
                  ))}
                </div>
              </div>
            )}

            {completedItems.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowCompleted((prev) => !prev)}
                  className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>已完成</span>
                  <span>{showCompleted ? "收起" : `展开 ${completedItems.length}`}</span>
                </button>
                {showCompleted && (
                  <div className="space-y-2">
                    {completedItems.map((item) => (
                      <TransferItemComponent
                        key={item.id}
                        item={item}
                        onPreviewImage={handlePreviewImage}
                        onDownload={handleDownload}
                        onCancel={cancelTransfer}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <TransferInput
        text={text}
        onTextChange={setText}
        onSendText={handleSendText}
        onSendFiles={sendFiles}
        onBeforeFilePick={handleBeforeFilePick}
        onSendClipboard={handleSendClipboard}
        isSendingClipboard={isSendingClipboard}
        isConnected={isConnected}
        sendingCount={sendingCount}
      />

      {/* Image Preview Dialog */}
      <ImagePreviewDialog
        image={previewImage}
        onClose={() => setPreviewImage(null)}
        onDownload={handleDownload}
      />
    </div>
  )
}
