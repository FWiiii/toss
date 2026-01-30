"use client"

import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, Upload, Loader2 } from "lucide-react"

type TransferInputProps = {
  text: string
  onTextChange: (text: string) => void
  onSendText: () => void
  onSendFile: (file: File) => void
  isConnected: boolean
  sendingCount?: number
}

export function TransferInput({ 
  text, 
  onTextChange, 
  onSendText, 
  onSendFile, 
  isConnected,
  sendingCount = 0
}: TransferInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && isConnected) {
      onSendFile(file)
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
    <div className="p-4 border-t border-border">
      <div className="flex gap-2 mb-2">
        <Textarea
          placeholder={isConnected ? "输入要发送的文本..." : "连接设备后可发送内容"}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          disabled={!isConnected}
          className="min-h-[80px] resize-none bg-input border-border"
          onKeyDown={handleKeyDown}
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
