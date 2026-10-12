'use client'

import type { TransferShareTarget } from '@/components/transfer-panel'
import { useCallback, useEffect, useReducer, useState } from 'react'
import { registerIncomingShareConsumer, unregisterIncomingShareConsumer } from '@/lib/incoming-share'
import { subscribeIncomingShares } from '@/lib/native-share-receive'
import { createSharedPendingTransferFile } from '@/lib/shared-pending-file'

/**
 * 原生系统分享接收：订阅原生侧投递的分享内容，转成待发项。
 *
 * `enabled` 为 false 时（Web 入口）不订阅，返回空目标，保持网站行为不变。
 */
export function useNativeIncomingShare(enabled: boolean): TransferShareTarget {
  const [files, setFiles] = useState<TransferShareTarget['sharedFiles']>([])
  const [text, setText] = useState('')
  const [error, setError] = useReducer(
    (_current: string | null, next: string | null) => next,
    null,
  )

  const clearSharedData = useCallback(() => {
    setFiles([])
    setText('')
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }

    registerIncomingShareConsumer((payload) => {
      try {
        setFiles(prev => [...prev, ...payload.items.map(item => createSharedPendingTransferFile(item))])
        if (payload.text) {
          setText(prev => (prev ? `${prev}\n${payload.text}` : payload.text))
        }
        setError(payload.failed.length > 0
          ? `有 ${payload.failed.length} 个分享项无法读取：${payload.failed.join('、')}`
          : null)
      }
      catch (cause) {
        setError(`无法读取分享内容：${cause instanceof Error ? cause.message : String(cause)}`)
      }
    })

    let disposed = false
    let unsubscribe: (() => void) | null = null
    void subscribeIncomingShares().then((dispose) => {
      if (disposed) {
        // 卸载早于订阅完成：立刻释放，避免原生订阅泄漏。
        dispose()
        return
      }
      unsubscribe = dispose
    }).catch(() => {
      // 原生插件未实现时静默降级，不影响其余功能。
    })

    return () => {
      disposed = true
      unregisterIncomingShareConsumer()
      unsubscribe?.()
    }
  }, [enabled])

  return {
    clearSharedData,
    hasSharedContent: files.length > 0 || text.length > 0,
    shareLoadError: error,
    sharedFiles: files,
    sharedText: text,
  }
}
