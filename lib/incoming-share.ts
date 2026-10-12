import type { NativeTransferFile } from './types'

/**
 * 外部应用分享进 Toss 的内容项。原生侧已把内容复制到 App 私有目录，
 * 这里只持有描述信息，由 UI 决定何时加入待发队列。
 */
export interface IncomingShareItem extends NativeTransferFile {
  size: number
}

export interface IncomingSharePayload {
  items: IncomingShareItem[]
  text: string
}

export type IncomingShareConsumer = (payload: IncomingSharePayload) => void

let consumer: IncomingShareConsumer | null = null
let pending: IncomingSharePayload | null = null

/**
 * UI 就绪时注册消费者；已到达但尚未消费的分享会立即投递。
 */
export function registerIncomingShareConsumer(next: IncomingShareConsumer) {
  consumer = next
  if (pending) {
    const queued = pending
    pending = null
    consumer(queued)
  }
}

export function unregisterIncomingShareConsumer() {
  consumer = null
}

/**
 * 原生侧收到系统分享后调用。UI 尚未挂载时先缓存，避免冷启动丢失内容。
 */
export function deliverIncomingShare(payload: IncomingSharePayload) {
  if (payload.items.length === 0 && !payload.text.trim()) {
    return
  }

  if (consumer) {
    consumer(payload)
    return
  }

  pending = pending
    ? {
        items: [...pending.items, ...payload.items],
        text: pending.text
          ? `${pending.text}\n${payload.text}`.trim()
          : payload.text,
      }
    : payload
}
