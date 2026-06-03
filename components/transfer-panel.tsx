'use client'

import type { PendingTransferFile } from '@/lib/pending-transfer-file'
import { AlertTriangle, Monitor, Send, Share2, ShieldAlert, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import { ImagePreviewDialog } from '@/components/image-preview-dialog'
import { TransferInput } from '@/components/transfer-input'
import { TransferItemComponent } from '@/components/transfer-item'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useShareTarget } from '@/hooks/use-share-target'
import { resolvePendingTransferFile } from '@/lib/pending-transfer-file'
import { useTransfer, useTransferItems } from '@/lib/transfer-context'
import { buildOutgoingTransferOfferSummary } from '@/lib/transfer-data'
import { cn, formatFileSize } from '@/lib/utils'

const PANEL_CLASS = 'panel-surface relative overflow-hidden transition-colors'
const PANEL_HEADER_CLASS = 'flex items-center justify-between border-b border-border/70 px-4 py-3'
const SCROLL_AREA_CLASS = 'min-h-[220px] space-y-2 p-4 sm:min-h-[260px]'

type PendingTransferInput = File | PendingTransferFile

interface PendingShareState {
  files: PendingTransferInput[]
  text: string
}

type PendingShareAction = { type: 'replace', value: PendingShareState | null }
  | { type: 'append-files', files: PendingTransferInput[] }
  | { type: 'append-text', text: string }

function pendingShareReducer(state: PendingShareState | null, action: PendingShareAction): PendingShareState | null {
  switch (action.type) {
    case 'replace':
      return action.value
    case 'append-files':
      return {
        files: [...(state?.files ?? []), ...action.files],
        text: state?.text ?? '',
      }
    case 'append-text':
      return {
        files: state?.files ?? [],
        text: state?.text
          ? `${state.text}\n\n${action.text}`
          : action.text,
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
    startScreenShare,
    stopScreenShare,
    incomingFileOffers,
    respondToIncomingFileOffer,
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
  const {
    sharedFiles,
    sharedText,
    shareLoadError,
    hasSharedContent,
    clearSharedData,
  } = useShareTarget()
  const [text, setText] = useReducer((_current: string, next: string) => next, '')
  const [isDragging, setIsDragging] = useState(false)
  const [pendingShare, dispatchPendingShare] = useReducer(pendingShareReducer, null)
  const [previewImage, setPreviewImage] = useState<{ url: string, name: string } | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [isSendingClipboard, setIsSendingClipboard] = useState(false)
  const [trustIncomingDevice, setTrustIncomingDevice] = useReducer(
    (_current: boolean, next: boolean) => next,
    false,
  )
  const [secondaryConfirmed, setSecondaryConfirmed] = useReducer(
    (_current: boolean, next: boolean) => next,
    false,
  )
  const [isRespondingToIncomingOffer, setIsRespondingToIncomingOffer] = useReducer(
    (_current: boolean, next: boolean) => next,
    false,
  )
  const [highlightComposer, setHighlightComposer] = useReducer(
    (_current: boolean, next: boolean) => next,
    false,
  )
  const [dropFeedbackLabel, setDropFeedbackLabel] = useState<string | null>(null)
  const hasProcessedShareRef = useRef(false)
  const hasShownShareLoadErrorRef = useRef(false)
  const hasFocusedRef = useRef(false)
  const hasHighlightedComposerRef = useRef(false)
  const activeItemsEndRef = useRef<HTMLDivElement>(null)
  const itemsEndRef = useRef<HTMLDivElement>(null)
  const composerInputRef = useRef<HTMLTextAreaElement>(null)
  const previousItemsCountRef = useRef(0)
  const shouldAutoScrollRef = useRef(true)
  const completedSectionId = useId()
  const activeIncomingFileOffer = incomingFileOffers[0] ?? null
  const activeIncomingSummary = activeIncomingFileOffer?.summary ?? null
  const activeIncomingRiskFlags = useMemo(
    () => new Set(activeIncomingSummary?.riskFlags ?? []),
    [activeIncomingSummary],
  )
  const requiresSecondaryConfirmation = activeIncomingSummary?.requiresSecondaryConfirmation ?? false

  const isConnected = connectionStatus === 'connected' && peerCount > 0
  const isScreenSharing = useMemo(
    () => items.some(item => item.type === 'stream' && item.direction === 'sent'),
    [items],
  )

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
        composerInputRef.current?.focus()
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

  useEffect(() => {
    setTrustIncomingDevice(false)
    setSecondaryConfirmed(false)
    setIsRespondingToIncomingOffer(false)
  }, [activeIncomingFileOffer?.offerId])

  useEffect(() => {
    if (!shareLoadError) {
      hasShownShareLoadErrorRef.current = false
      return
    }
    if (hasShownShareLoadErrorRef.current) {
      return
    }

    addSystemMessage(shareLoadError, true)
    hasShownShareLoadErrorRef.current = true
  }, [addSystemMessage, shareLoadError])
  const activeItems = useMemo(
    () => items.filter(item => item.status === 'transferring' || item.status === 'pending'),
    [items],
  )
  const completedItems = useMemo(
    () => items.filter(item => !(item.status === 'transferring' || item.status === 'pending')),
    [items],
  )
  const hasItems = activeItems.length > 0 || completedItems.length > 0
  const pendingShareSummary = useMemo(() => {
    if (!pendingShare) {
      return ''
    }

    const segments: string[] = []
    if (pendingShare.files.length > 0) {
      segments.push(`${pendingShare.files.length} 个文件`)
    }
    if (pendingShare.text.trim()) {
      segments.push('1 段文本')
    }
    return segments.join(' · ')
  }, [pendingShare])

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

  const sendFiles = useCallback(async (files: PendingTransferInput[]) => {
    if (files.length === 0)
      return

    if (!isConnected) {
      dispatchPendingShare({ type: 'append-files', files })
      return
    }

    const resolvedFiles = (await Promise.all(files.map(async (pendingFile) => {
      try {
        return await resolvePendingTransferFile(pendingFile)
      }
      catch (error) {
        console.error('Failed to resolve shared file:', error)
        addSystemMessage('获取分享文件失败，请重试', true)
        return null
      }
    }))).filter((file): file is File => file !== null)

    if (resolvedFiles.length === 0) {
      return
    }

    const offerSummary = buildOutgoingTransferOfferSummary(resolvedFiles)

    for (const file of resolvedFiles) {
      await sendFile(file, offerSummary)
    }
  }, [addSystemMessage, isConnected, sendFile])

  const handleSendClipboard = useCallback(async () => {
    if (!navigator.clipboard)
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
        if (isConnected) {
          sendText(trimmedText)
        }
        else {
          dispatchPendingShare({ type: 'append-text', text: trimmedText })
        }
      }

      if (files.length > 0 && trimmedText) {
        addSystemMessage('已从剪贴板加入内容')
      }
      else if (files.length > 0) {
        addSystemMessage(files.every(file => file.type.startsWith('image/')) ? '已从剪贴板加入图片' : '已从剪贴板加入文件')
      }
      else if (trimmedText) {
        addSystemMessage(isConnected ? '已从剪贴板加入文本' : '文本已加入待发送队列')
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

    let cancelled = false

    if (isConnected) {
      hasProcessedShareRef.current = true
      void (async () => {
        if (cancelled) {
          return
        }
        if (sharedText) {
          sendText(sharedText)
        }
        await sendFiles(sharedFiles)
        if (!cancelled) {
          clearSharedData()
        }
      })()
      return () => {
        cancelled = true
      }
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
      return () => {
        cancelled = true
      }
    }
  }, [clearSharedData, hasSharedContent, isConnected, sendFiles, sendText, sharedFiles, sharedText])

  // Send pending share when connected
  useEffect(() => {
    if (!isConnected || !pendingShare) {
      return
    }

    let cancelled = false
    const filesToSend = [...pendingShare.files]
    const textToSend = pendingShare.text
    dispatchPendingShare({ type: 'replace', value: null })

    void (async () => {
      if (cancelled) {
        return
      }
      if (textToSend.trim()) {
        sendText(textToSend)
      }
      if (filesToSend.length > 0) {
        await sendFiles(filesToSend)
      }
    })()
    return () => {
      cancelled = true
    }
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
    if (!text.trim()) {
      return
    }

    if (isConnected) {
      sendText(text)
      setText('')
      return
    }

    dispatchPendingShare({ type: 'append-text', text: text.trim() })
    addSystemMessage('文本已加入待发送队列，连接后自动发送')
    setText('')
  }, [addSystemMessage, isConnected, sendText, text])

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
    setIsDragging(true)
  }, [])

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

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const droppedFiles = Array.from(files)
      setDropFeedbackLabel(
        isConnected
          ? `已加入 ${droppedFiles.length} 个文件`
          : `已排队 ${droppedFiles.length} 个文件`,
      )
      void sendFiles(droppedFiles)
    }
  }, [isConnected, sendFiles])

  const handleStopStream = useCallback(() => {
    stopScreenShare()
  }, [stopScreenShare])

  const handleRespondToIncomingOffer = useCallback(async (accepted: boolean) => {
    if (!activeIncomingFileOffer || isRespondingToIncomingOffer) {
      return
    }

    setIsRespondingToIncomingOffer(true)
    try {
      await respondToIncomingFileOffer(
        activeIncomingFileOffer.offerId,
        accepted,
        accepted ? trustIncomingDevice : false,
        secondaryConfirmed,
      )
    }
    finally {
      setIsRespondingToIncomingOffer(false)
    }
  }, [
    activeIncomingFileOffer,
    isRespondingToIncomingOffer,
    respondToIncomingFileOffer,
    secondaryConfirmed,
    trustIncomingDevice,
  ])

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
        <div className="flex items-center gap-1">
          {isConnected && (
            <Button
              variant={isScreenSharing ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => {
                if (isScreenSharing) {
                  stopScreenShare()
                }
                else {
                  void startScreenShare()
                }
              }}
            >
              <Monitor className="w-4 h-4 mr-1" />
              {isScreenSharing ? '停止共享' : '共享屏幕'}
            </Button>
          )}
          {items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearHistory}>
              <Trash2 className="w-4 h-4 mr-1" />
              清空
            </Button>
          )}
        </div>
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
          <div className="flex items-center gap-2 text-sm font-medium text-accent">
            <Share2 className="w-4 h-4" />
            <span>待发送内容已排队，连接后自动发送</span>
          </div>
          {pendingShareSummary && (
            <p className="mt-1 text-sm text-accent/90">
              {pendingShareSummary}
            </p>
          )}
        </div>
      )}

      <Dialog
        open={Boolean(activeIncomingFileOffer)}
        onOpenChange={(open) => {
          if (!open && activeIncomingFileOffer && !isRespondingToIncomingOffer) {
            void handleRespondToIncomingOffer(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{requiresSecondaryConfirmation ? '高风险文件确认' : '接收文件确认'}</DialogTitle>
            <DialogDescription>
              {activeIncomingFileOffer && activeIncomingSummary
                ? activeIncomingSummary.fileCount > 1
                  ? `${activeIncomingFileOffer.deviceName} 想发送 ${activeIncomingSummary.fileCount} 个文件`
                  : `${activeIncomingFileOffer.deviceName} 想发送 ${activeIncomingFileOffer.fileName}`
                : '确认是否接收来自对方设备的文件'}
            </DialogDescription>
          </DialogHeader>

          {activeIncomingFileOffer && activeIncomingSummary && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">
                      {activeIncomingSummary.fileCount > 1
                        ? `共 ${activeIncomingSummary.fileCount} 个文件`
                        : activeIncomingFileOffer.fileName}
                    </p>
                    <p className="text-xs">
                      {activeIncomingSummary.totalSize > 0 ? formatFileSize(activeIncomingSummary.totalSize) : '未知大小'}
                      {activeIncomingSummary.fileCount === 1 && activeIncomingFileOffer.fileType
                        ? ` · ${activeIncomingFileOffer.fileType}`
                        : ''}
                    </p>
                  </div>
                  {activeIncomingRiskFlags.size > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {activeIncomingRiskFlags.has('executable') && (
                        <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                          可执行文件
                        </span>
                      )}
                      {activeIncomingRiskFlags.has('large') && (
                        <span className="rounded-full bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
                          超大文件提醒
                        </span>
                      )}
                      {activeIncomingRiskFlags.has('batch') && (
                        <span className="rounded-full bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
                          批量文件提醒
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {activeIncomingSummary.sampleFiles.map(file => (
                    <div key={`${file.name}-${file.size}-${file.type}`} className="flex items-center justify-between gap-3 text-xs">
                      <p className="min-w-0 flex-1 truncate text-foreground">{file.name}</p>
                      <span className="shrink-0 text-muted-foreground">
                        {file.size > 0 ? formatFileSize(file.size) : '未知大小'}
                      </span>
                    </div>
                  ))}
                  {activeIncomingSummary.fileCount > activeIncomingSummary.sampleFiles.length && (
                    <p className="text-xs text-muted-foreground">
                      其余
                      {' '}
                      {activeIncomingSummary.fileCount - activeIncomingSummary.sampleFiles.length}
                      {' '}
                      个文件已折叠
                    </p>
                  )}
                </div>

                {activeIncomingFileOffer.fingerprint && (
                  <p className="mt-3 text-xs">
                    会话指纹：
                    <br />
                    {activeIncomingFileOffer.fingerprint}
                  </p>
                )}
                {incomingFileOffers.length > 1 && (
                  <p className="mt-1 text-xs">
                    还有
                    {' '}
                    {incomingFileOffers.length - 1}
                    {' '}
                    个待确认请求排队中
                  </p>
                )}
              </div>

              {activeIncomingRiskFlags.has('executable') && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">高风险文件确认</p>
                      <p>
                        检测到可执行文件，请确认来源可信后再接收。
                        {activeIncomingSummary.executableFileName
                          ? ` 可执行文件：${activeIncomingSummary.executableFileName}`
                          : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeIncomingRiskFlags.has('large') && (
                <div className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">超大文件提醒</p>
                      <p>本次接收包含超大文件，传输可能耗时较长，请确认设备空间和网络状态。</p>
                    </div>
                  </div>
                </div>
              )}

              {activeIncomingRiskFlags.has('batch') && (
                <div className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">批量文件提醒</p>
                      <p>本次接收包含较多文件，请确认数量和文件名都符合预期。</p>
                    </div>
                  </div>
                </div>
              )}

              {requiresSecondaryConfirmation && (
                <label className="flex items-start gap-3 rounded-lg border border-destructive/20 px-3 py-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0"
                    checked={secondaryConfirmed}
                    disabled={isRespondingToIncomingOffer}
                    onChange={event => setSecondaryConfirmed(event.target.checked)}
                  />
                  <span>
                    {activeIncomingSummary.executableFileName
                      ? `我已确认要接收 ${activeIncomingSummary.executableFileName}，并知晓这可能带来安全风险`
                      : '我已确认要接收高风险文件，并知晓这可能带来安全风险'}
                  </span>
                </label>
              )}

              {activeIncomingFileOffer.deviceId && (
                <label className="flex items-start gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0"
                    checked={trustIncomingDevice}
                    disabled={isRespondingToIncomingOffer}
                    onChange={event => setTrustIncomingDevice(event.target.checked)}
                  />
                  <span>
                    信任此设备，以后自动接收来自它的文件
                  </span>
                </label>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={isRespondingToIncomingOffer}
              onClick={() => {
                void handleRespondToIncomingOffer(false)
              }}
            >
              {isRespondingToIncomingOffer ? '处理中...' : '拒绝'}
            </Button>
            <Button
              disabled={isRespondingToIncomingOffer || (requiresSecondaryConfirmation && !secondaryConfirmed)}
              onClick={() => {
                void handleRespondToIncomingOffer(true)
              }}
            >
              {isRespondingToIncomingOffer
                ? '处理中...'
                : requiresSecondaryConfirmation ? '确认后接收' : '接受'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Items List */}
      <div className={SCROLL_AREA_CLASS}>
        {!hasItems && !pendingShare
          ? (
              <EmptyState
                icon={Send}
                title={isConnected ? '准备发送' : '等待连接'}
                description={isConnected ? '发送文本或文件即可开始传输' : '连接设备后即可开始传输'}
                containerClassName="h-full"
              />
            )
          : (
              <div className="space-y-3">
                {activeItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
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
                          onStopStream={handleStopStream}
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
                      className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors"
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
                            onStopStream={handleStopStream}
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
        allowQueueWithoutConnection
        sendingCount={sendingCount}
        textInputRef={composerInputRef}
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
