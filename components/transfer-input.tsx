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
  const textCountId = useId()
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
    <div className="border-t border-border/70 bg-muted/15 p-3 sm:p-4" data-transfer-input>
      <div className={cn('mb-2 flex gap-2 rounded-xl transition-colors duration-300', highlightComposer && 'bg-accent/5')}>
        <label htmlFor={textInputId} className="sr-only">要发送的文本</label>
        <Textarea
          ref={textInputRef}
          id={textInputId}
          placeholder={isConnected ? '输入要发送的文本...' : '可先输入，连接后自动发送'}
          value={text}
          onChange={e => onTextChange(e.target.value)}
          disabled={!isConnected && !allowQueueWithoutConnection}
          className={cn(
            'min-h-[76px] resize-y rounded-xl bg-background px-3 py-2.5',
            highlightComposer ? 'border-accent/30 bg-accent/5' : 'border-border',
          )}
          aria-describedby={`${textHintId} ${textCountId}`}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="flex flex-wrap gap-1">
        <input type="file" ref={fileInputRef} multiple onChange={handleFileSelect} className="hidden" />
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 flex-1 sm:flex-none"
          onClick={() => {
            onBeforeFilePick?.()
            fileInputRef.current?.click()
          }}
          disabled={!isConnected && !allowQueueWithoutConnection}
        >
          <Upload className="mr-1.5 h-4 w-4" />
          {canQueueWithoutConnection ? '选择文件并排队' : '选择文件'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 flex-1 sm:flex-none"
          onClick={() => onSendClipboard?.()}
          disabled={(!isConnected && !allowQueueWithoutConnection) || !clipboardAvailable || isSendingClipboard}
        >
          {isSendingClipboard
            ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            : <Clipboard className="mr-1.5 h-4 w-4" />}
          {isSendingClipboard ? '正在读取…' : '发送剪贴板'}
        </Button>
        <Button
          size="sm"
          className={cn('min-w-0 flex-1 sm:flex-none', highlightComposer && 'delight-ready-pulse')}
          onClick={onSendText}
          disabled={(!isConnected && !allowQueueWithoutConnection) || !text.trim()}
        >
          <Send className="mr-1.5 h-4 w-4" />
          {canQueueWithoutConnection ? '加入队列' : '发送'}
        </Button>
      </div>
      {(sendingCount > 0 || text.length > 0) && (
        <div className="mt-1.5 flex items-start justify-between gap-3">
          <p id={textHintId} className="min-w-0 text-xs text-muted-foreground" aria-live="polite">
            {sendingCount > 0 && (
              <>
                正在发送
                {' '}
                {sendingCount}
                {' 个文件'}
                {text.length > 0 && ' · '}
              </>
            )}
            {text.length > 0 && (
              isConnected ? '按 Ctrl/Cmd + Enter 快速发送' : '未连接时会在连接后自动发送'
            )}
          </p>
          {text.length > 0 && (
            <span id={textCountId} className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-live="off">
              {`${text.length.toLocaleString('zh-CN')} 字`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
