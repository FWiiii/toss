import type { IncomingShareItem, IncomingSharePayload } from './incoming-share'
import { registerPlugin } from '@capacitor/core'
import { deliverIncomingShare } from './incoming-share'

/**
 * 原生分享接收桥：Android `ACTION_SEND`／iOS Share Extension 把内容复制到
 * App 私有目录后，通过该插件把描述信息交给 JS。
 */
export interface ShareReceiverPlugin {
  addListener: (
    eventName: 'incomingShare',
    listener: (payload: { items: IncomingShareItem[], text?: string }) => void,
  ) => Promise<{ remove: () => Promise<void> }>
  getPendingShare: () => Promise<{ items: IncomingShareItem[], text?: string } | null>
}

export const ShareReceiver = registerPlugin<ShareReceiverPlugin>('ShareReceiver')

/**
 * 订阅原生分享。挂载时先取一次积压内容，避免冷启动时事件早于监听注册。
 */
export async function subscribeIncomingShares(): Promise<() => void> {
  const handle = await ShareReceiver.addListener('incomingShare', (payload) => {
    deliverIncomingShare(normalizePayload(payload))
  })

  try {
    const pending = await ShareReceiver.getPendingShare()
    if (pending) {
      deliverIncomingShare(normalizePayload(pending))
    }
  }
  catch {
    // 没有积压内容或平台未实现时忽略。
  }

  return () => {
    void handle.remove()
  }
}

function normalizePayload(payload: { items: IncomingShareItem[], text?: string }): IncomingSharePayload {
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    text: payload.text ?? '',
  }
}
