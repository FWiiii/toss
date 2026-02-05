"use client"

import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, Upload, Loader2, Clipboard } from "lucide-react"

type TransferInputProps = {
  text: string
  onTextChange: (text: string) => void
  onSendText: () => void
  onSendFiles: (files: File[]) => void
  onSendClipboard?: () => void
  isSendingClipboard?: boolean
  isConnected: boolean
  sendingCount?: number
}

export function TransferInput({ 
  text, 
  onTextChange, 
  onSendText, 
  onSendFiles, 
  onSendClipboard,
  isSendingClipboard = false,
  isConnected,
  sendingCount = 0
}: TransferInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const clipboardAvailable = typeof navigator !== "undefined" && !!navigator.clipboard

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (fileList && fileList.length > 0 && isConnected) {
      onSendFiles(Array.from(fileList))
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSendText()
    }
  }

  return (
    <div className="p-4 border-t border-border" data-transfer-input>
      <div className="flex gap-2 mb-2">
        <Textarea
          placeholder={isConnected ? "输入要发送的文本..." : "连接设备后可发送内容"}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          disabled={!isConnected}
          className="min-h-[80px] resize-none bg-input border-border focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-border"
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="file"
          ref={fileInputRef}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          variant="outline"
          className="flex-1 sm:flex-auto sm:min-w-[120px]"
          onClick={() => fileInputRef.current?.click()}
          disabled={!isConnected}
        >
          <Upload className="w-4 h-4 mr-2" />
          选择文件
        </Button>
        <Button
          variant="outline"
          className="flex-1 sm:flex-auto sm:min-w-[120px]"
          onClick={() => onSendClipboard?.()}
          disabled={!isConnected || !clipboardAvailable || isSendingClipboard}
        >
          {isSendingClipboard ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Clipboard className="w-4 h-4 mr-2" />
          )}
          发送剪贴板
        </Button>
        <Button
          className="flex-1 sm:flex-auto sm:min-w-[120px]"
          onClick={onSendText}
          disabled={!isConnected || !text.trim()}
        >
          <Send className="w-4 h-4 mr-2" />
          发送文本
        </Button>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-2">
        {sendingCount > 0 ? (
          <>正在发送 {sendingCount} 个文件 · </>
        ) : null}
        按 Ctrl/Cmd + Enter 快速发送
      </p>
    </div>
  )
}
