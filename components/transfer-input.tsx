'use client'

import type { Ref } from 'react'
import type { PendingTransferFile } from '@/lib/pending-transfer-file'
import { Clipboard, Loader2, Send, Upload } from 'lucide-react'
import { useEffect, useId, useReducer, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type PendingTransferInput = File | PendingTransferFile

interface TransferInputProps {
  text: string
  onTextChange: (text: string) => void
  onSendText: () => void
  onSendFiles: (files: PendingTransferInput[]) => void
  onBeforeFilePick?: () => void
  onSendClipboard?: () => void
  isSendingClipboard?: boolean
  highlightComposer?: boolean
  isConnected: boolean
  allowQueueWithoutConnection?: boolean
  sendingCount?: number
  textInputRef?: Ref<HTMLTextAreaElement>
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
  allowQueueWithoutConnection = false,
  sendingCount = 0,
  textInputRef,
}: TransferInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isMounted, markMounted] = useReducer(() => true, false)
  const textInputId = useId()
  const textHintId = useId()
  const canQueueWithoutConnection = allowQueueWithoutConnection && !isConnected
  const clipboardAvailable = isMounted && typeof navigator !== 'undefined' && !!navigator.clipboard

  useEffect(() => {
    markMounted()
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
          ref={textInputRef}
          id={textInputId}
          placeholder={isConnected ? '输入要发送的文本...' : '可先输入，连接后自动发送'}
          value={text}
          onChange={e => onTextChange(e.target.value)}
          disabled={!isConnected && !allowQueueWithoutConnection}
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
          disabled={!isConnected && !allowQueueWithoutConnection}
        >
          <Upload className="w-4 h-4 mr-2" />
          {canQueueWithoutConnection ? '选择文件并排队' : '选择文件'}
        </Button>
        <Button
          variant="secondary"
          className="min-w-0 flex-1 sm:flex-none"
          onClick={() => onSendClipboard?.()}
          disabled={(!isConnected && !allowQueueWithoutConnection) || !clipboardAvailable || isSendingClipboard}
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
          disabled={(!isConnected && !allowQueueWithoutConnection) || !text.trim()}
        >
          <Send className="w-4 h-4 mr-2" />
          {canQueueWithoutConnection ? '加入待发送队列' : '发送文本'}
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
        {isConnected ? '按 Ctrl/Cmd + Enter 快速发送' : '未连接时可先编辑并排队，连接后自动发送'}
      </p>
    </div>
  )
}
