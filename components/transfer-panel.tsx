'use client'

import { Send, Share2, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useId, useReducer, useRef, useState } from 'react'
import { ImagePreviewDialog } from '@/components/image-preview-dialog'
import { TransferInput } from '@/components/transfer-input'
import { TransferItemComponent } from '@/components/transfer-item'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useShareTarget } from '@/hooks/use-share-target'
import { useTransfer, useTransferItems } from '@/lib/transfer-context'
import { cn } from '@/lib/utils'

const PANEL_CLASS = 'panel-surface relative overflow-hidden transition-colors'
const PANEL_HEADER_CLASS = 'flex items-center justify-between border-b border-border/70 px-4 py-3'
const SCROLL_AREA_CLASS = 'min-h-[220px] space-y-2 p-4 sm:min-h-[260px]'

interface PendingShareState {
  files: File[]
  text: string
}

type PendingShareAction = { type: 'replace', value: PendingShareState | null }
  | { type: 'append-files', files: File[] }

function pendingShareReducer(state: PendingShareState | null, action: PendingShareAction): PendingShareState | null {
  switch (action.type) {
    case 'replace':
      return action.value
    case 'append-files':
      return {
        files: [...(state?.files ?? []), ...action.files],
        text: state?.text ?? '',
      }
    default:
      return state
  }
}

export function TransferPanel() {
  const {
    connectionStatus,
    peerCount,
    suspendAutoReconnect,
  } = useTransfer()
  const {
    items,
    sendText,
    sendFile,
    cancelTransfer,
    clearHistory,
    addSystemMessage,
    sendingCount,
  } = useTransferItems()
  const { sharedFiles, sharedText, hasSharedContent, clearSharedData } = useShareTarget()
  const [text, setText] = useReducer((_current: string, next: string) => next, '')
  const [isDragging, setIsDragging] = useState(false)
  const [pendingShare, dispatchPendingShare] = useReducer(pendingShareReducer, null)
  const [previewImage, setPreviewImage] = useState<{ url: string, name: string } | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [isSendingClipboard, setIsSendingClipboard] = useState(false)
  const [highlightComposer, setHighlightComposer] = useReducer(
    (_current: boolean, next: boolean) => next,
    false,
  )
  const [dropFeedbackLabel, setDropFeedbackLabel] = useState<string | null>(null)
  const hasProcessedShareRef = useRef(false)
  const hasFocusedRef = useRef(false)
  const hasHighlightedComposerRef = useRef(false)
  const activeItemsEndRef = useRef<HTMLDivElement>(null)
  const itemsEndRef = useRef<HTMLDivElement>(null)
  const previousItemsCountRef = useRef(0)
  const shouldAutoScrollRef = useRef(true)
  const completedSectionId = useId()

  const isConnected = connectionStatus === 'connected' && peerCount > 0

  useEffect(() => {
    if (!isConnected) {
      hasFocusedRef.current = false
      hasHighlightedComposerRef.current = false
      setHighlightComposer(false)
      return
    }

    let timeoutId: number | undefined

    if (!hasFocusedRef.current) {
      hasFocusedRef.current = true
      requestAnimationFrame(() => {
        const input = document.querySelector<HTMLTextAreaElement>('[data-transfer-input] textarea')
        if (input) {
          input.focus()
        }
      })
    }

    if (!hasHighlightedComposerRef.current) {
      hasHighlightedComposerRef.current = true
      setHighlightComposer(true)
      timeoutId = window.setTimeout(() => {
        setHighlightComposer(false)
      }, 1200)
    }

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [isConnected])

  useEffect(() => {
    if (!dropFeedbackLabel)
      return

    const timeoutId = window.setTimeout(() => {
      setDropFeedbackLabel(null)
    }, 1400)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [dropFeedbackLabel])
  const activeItems = items.filter(item => item.status === 'transferring' || item.status === 'pending')
  const completedItems = items.filter(item => !(item.status === 'transferring' || item.status === 'pending'))
  const hasItems = activeItems.length > 0 || completedItems.length > 0
  const showDormantPanel = !isConnected && !hasItems && !pendingShare

  const getAutoScrollAnchor = useCallback(() => {
    if (activeItems.length > 0 && activeItemsEndRef.current) {
      return activeItemsEndRef.current
    }
    return itemsEndRef.current
  }, [activeItems.length])

  const updateAutoScrollState = useCallback(() => {
    const anchor = getAutoScrollAnchor()
    if (!anchor) {
      shouldAutoScrollRef.current = true
      return
    }

    const rect = anchor.getBoundingClientRect()
    shouldAutoScrollRef.current = Math.abs(rect.top - window.innerHeight) <= 160
  }, [getAutoScrollAnchor])

  const scrollToLatest = useCallback(() => {
    const anchor = getAutoScrollAnchor()
    if (!anchor)
      return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    anchor.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'end',
      inline: 'nearest',
    })
  }, [getAutoScrollAnchor])

  const sendFiles = useCallback(async (files: File[]) => {
    if (files.length === 0)
      return

    if (!isConnected) {
      dispatchPendingShare({ type: 'append-files', files })
      return
    }

    for (const file of files) {
      await sendFile(file)
    }
  }, [isConnected, sendFile])

  const handleSendClipboard = useCallback(async () => {
    if (!isConnected || !navigator.clipboard)
      return
    setIsSendingClipboard(true)

    try {
      const files: File[] = []
      if (navigator.clipboard.read) {
        try {
          const items = await navigator.clipboard.read()
          for (const item of items) {
            const imageType = item.types.find(type => type.startsWith('image/'))
            if (imageType) {
              const blob = await item.getType(imageType)
              const ext = imageType.split('/')[1] || 'png'
              files.push(new File([blob], `clipboard-${Date.now()}.${ext}`, { type: imageType }))
            }
          }
        }
        catch {
          // Ignore if read permission is not granted
        }
      }

      let textData = ''
      try {
        textData = await navigator.clipboard.readText()
      }
      catch {
        textData = ''
      }

      const trimmedText = textData.trim()

      if (files.length > 0) {
        await sendFiles(files)
      }
      if (trimmedText) {
        sendText(trimmedText)
      }

      if (files.length > 0 && trimmedText) {
        addSystemMessage('已从剪贴板加入内容')
      }
      else if (files.length > 0) {
        addSystemMessage(files.every(file => file.type.startsWith('image/')) ? '已从剪贴板加入图片' : '已从剪贴板加入文件')
      }
      else if (trimmedText) {
        addSystemMessage('已从剪贴板加入文本')
      }
      else {
        addSystemMessage('剪贴板中暂无可发送内容', true)
      }
    }
    finally {
      setIsSendingClipboard(false)
    }
  }, [addSystemMessage, isConnected, sendFiles, sendText])

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
    }
    else {
      hasProcessedShareRef.current = true
      dispatchPendingShare({
        type: 'replace',
        value: { files: [...sharedFiles], text: sharedText },
      })
      if (sharedText) {
        setText(sharedText)
      }
      clearSharedData()
    }
  }, [clearSharedData, hasSharedContent, isConnected, sendFiles, sendText, sharedFiles, sharedText])

  // Send pending share when connected
  useEffect(() => {
    if (!isConnected || !pendingShare) {
      return
    }

    const filesToSend = [...pendingShare.files]
    const textToSend = pendingShare.text
    dispatchPendingShare({ type: 'replace', value: null })

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

  useEffect(() => {
    updateAutoScrollState()
  }, [items.length, showCompleted, pendingShare, updateAutoScrollState])

  useEffect(() => {
    updateAutoScrollState()

    const handleViewportChange = () => {
      updateAutoScrollState()
    }

    window.addEventListener('scroll', handleViewportChange, { passive: true })
    window.addEventListener('resize', handleViewportChange)

    return () => {
      window.removeEventListener('scroll', handleViewportChange)
      window.removeEventListener('resize', handleViewportChange)
    }
  }, [updateAutoScrollState])

  // Auto-follow new items only while the user stays near the bottom.
  useEffect(() => {
    const previousCount = previousItemsCountRef.current
    previousItemsCountRef.current = items.length

    if (items.length === 0 || items.length === previousCount || previewImage) {
      return
    }

    if (previousCount > 0 && !shouldAutoScrollRef.current) {
      return
    }

    requestAnimationFrame(() => {
      scrollToLatest()
      updateAutoScrollState()
    })
  }, [items.length, previewImage, scrollToLatest, updateAutoScrollState])

  const handleSendText = useCallback(() => {
    if (text.trim() && isConnected) {
      sendText(text)
      setText('')
    }
  }, [text, isConnected, sendText])

  const handleBeforeFilePick = useCallback(() => {
    // On some mobile browsers, opening the file picker can trigger visibility
    // transitions. Suspend auto-reconnect briefly to avoid state flapping.
    suspendAutoReconnect(20000)
  }, [suspendAutoReconnect])

  const handleDownload = useCallback((url: string, name?: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = name || 'download'
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
    const nextTarget = e.relatedTarget
    if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget)) {
      return
    }
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (!isConnected)
      return

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const droppedFiles = Array.from(files)
      setDropFeedbackLabel(`已加入 ${droppedFiles.length} 个文件`)
      void sendFiles(droppedFiles)
    }
  }, [isConnected, sendFiles])

  if (showDormantPanel) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-card/65 px-5 py-4">
        <p className="text-sm font-medium text-foreground">连接后开始发送</p>
        <p className="mt-1 text-xs text-muted-foreground">
          文本、图片和文件会在连接成功后出现在这里。
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        PANEL_CLASS,
        isDragging ? 'border-accent bg-accent/5 ring-2 ring-accent/30 delight-drag-lift' : 'border-border/80',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dropFeedbackLabel && (
        <div className="pointer-events-none absolute right-4 top-4 z-20" aria-live="polite">
          <div className="delight-fade-up rounded-full border border-accent/25 bg-background/95 px-3 py-1 text-xs text-accent shadow-sm">
            {dropFeedbackLabel}
          </div>
        </div>
      )}

      {/* Header */}
      <div className={PANEL_HEADER_CLASS}>
        <h3 className="text-sm font-medium text-foreground">传输</h3>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearHistory}>
            <Trash2 className="w-4 h-4 mr-1" />
            清空
          </Button>
        )}
      </div>

      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-accent/10 backdrop-blur-sm delight-drag-lift">
          <div className="text-center">
            <Upload className="w-12 h-12 text-accent mx-auto mb-2" />
            <p className="text-accent font-medium">释放以上传文件</p>
          </div>
        </div>
      )}

      {/* Pending Share Notice */}
      {pendingShare && !isConnected && (
        <div className="mx-4 mt-4 rounded-lg border border-accent/25 bg-accent/10 p-3">
          <div className="flex items-center gap-2 text-sm text-accent">
            <Share2 className="w-4 h-4" />
            <span>有待发送的分享内容，请先连接设备</span>
          </div>
          {pendingShare.files.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {pendingShare.files.length}
              {' '}
              个文件待发送
            </p>
          )}
          {pendingShare.text.trim() && (
            <p className="text-xs text-muted-foreground mt-1">
              1 段文本待发送
            </p>
          )}
        </div>
      )}

      {/* Items List */}
      <div className={SCROLL_AREA_CLASS}>
        {!hasItems && !pendingShare
          ? (
              <EmptyState
                icon={Send}
                description={isConnected ? '发送文本或文件开始传输' : '连接设备后开始传输'}
                containerClassName="h-full"
              />
            )
          : (
              <div className="space-y-3">
                {activeItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>进行中</span>
                      <span>{activeItems.length}</span>
                    </div>
                    <div className="space-y-2">
                      {activeItems.map(item => (
                        <TransferItemComponent
                          key={item.id}
                          item={item}
                          onPreviewImage={handlePreviewImage}
                          onDownload={handleDownload}
                          onCancel={cancelTransfer}
                        />
                      ))}
                    </div>
                    <div ref={activeItemsEndRef} aria-hidden="true" />
                  </div>
                )}

                {completedItems.length > 0 && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowCompleted(prev => !prev)}
                      className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
                      aria-expanded={showCompleted}
                      aria-controls={completedSectionId}
                    >
                      <span>已完成</span>
                      <span>{showCompleted ? '收起' : `展开 ${completedItems.length}`}</span>
                    </button>
                    {showCompleted && (
                      <div id={completedSectionId} className="space-y-2">
                        {completedItems.map(item => (
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
        <div ref={itemsEndRef} aria-hidden="true" />
      </div>

      {/* Input Area */}
      {isConnected && (
        <TransferInput
          text={text}
          onTextChange={setText}
          onSendText={handleSendText}
          onSendFiles={sendFiles}
          onBeforeFilePick={handleBeforeFilePick}
          onSendClipboard={handleSendClipboard}
          isSendingClipboard={isSendingClipboard}
          highlightComposer={highlightComposer}
          isConnected={isConnected}
          sendingCount={sendingCount}
        />
      )}

      {/* Image Preview Dialog */}
      <ImagePreviewDialog
        image={previewImage}
        onClose={() => setPreviewImage(null)}
        onDownload={handleDownload}
      />
    </div>
  )
}
