'use client'

import { Clipboard, Loader2, Send, Upload } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface TransferInputProps {
  text: string
  onTextChange: (text: string) => void
  onSendText: () => void
  onSendFiles: (files: File[]) => void
  onBeforeFilePick?: () => void
  onSendClipboard?: () => void
  isSendingClipboard?: boolean
  highlightComposer?: boolean
  isConnected: boolean
  sendingCount?: number
}

export function TransferInput({
  text,
  onTextChange,
  onSendText,
  onSendFiles,
  onBeforeFilePick,
  onSendClipboard,
  isSendingClipboard = false,
  highlightComposer = false,
  isConnected,
  sendingCount = 0,
}: TransferInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [clipboardAvailable, setClipboardAvailable] = useState(false)
  const textInputId = useId()
  const textHintId = useId()

  useEffect(() => {
    setClipboardAvailable(typeof navigator !== 'undefined' && !!navigator.clipboard)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    // On mobile, selecting a file may briefly drop the connection.
    // Always pass selected files upward so the panel can queue and retry.
    if (fileList && fileList.length > 0) {
      onSendFiles(Array.from(fileList))
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSendText()
    }
  }

  return (
    <div className="border-t border-border/70 p-4" data-transfer-input>
      <div className={cn('mb-2 flex gap-2 rounded-xl transition-colors duration-300', highlightComposer && 'bg-accent/5')}>
        <label htmlFor={textInputId} className="sr-only">
          要发送的文本
        </label>
        <Textarea
          id={textInputId}
          placeholder={isConnected ? '输入要发送的文本...' : '连接设备后可发送内容'}
          value={text}
          onChange={e => onTextChange(e.target.value)}
          disabled={!isConnected}
          className={cn(
            'min-h-[84px] resize-none',
            highlightComposer ? 'border-accent/30 bg-accent/5' : 'border-border bg-input',
          )}
          aria-describedby={textHintId}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="file"
          ref={fileInputRef}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          variant="secondary"
          className="min-w-0 flex-1 sm:flex-none"
          onClick={() => {
            onBeforeFilePick?.()
            fileInputRef.current?.click()
          }}
          disabled={!isConnected}
        >
          <Upload className="w-4 h-4 mr-2" />
          选择文件
        </Button>
        <Button
          variant="secondary"
          className="min-w-0 flex-1 sm:flex-none"
          onClick={() => onSendClipboard?.()}
          disabled={!isConnected || !clipboardAvailable || isSendingClipboard}
        >
          {isSendingClipboard
            ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )
            : (
                <Clipboard className="w-4 h-4 mr-2" />
              )}
          {isSendingClipboard ? '正在读取…' : '发送剪贴板'}
        </Button>
      </div>
      <div className="mt-2">
        <Button
          className={cn('w-full', highlightComposer && 'delight-ready-pulse')}
          onClick={onSendText}
          disabled={!isConnected || !text.trim()}
        >
          <Send className="w-4 h-4 mr-2" />
          发送文本
        </Button>
      </div>
      <p id={textHintId} className="mt-2 text-xs text-muted-foreground" aria-live="polite">
        {sendingCount > 0
          ? (
              <>
                正在发送
                {sendingCount}
                {' '}
                个文件 ·
                {' '}
              </>
            )
          : null}
        按 Ctrl/Cmd + Enter 快速发送
      </p>
    </div>
  )
}
