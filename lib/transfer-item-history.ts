import type { TransferItem } from './types'

export function isActiveTransferItem(item: Pick<TransferItem, 'status'>) {
  return item.status === 'transferring' || item.status === 'pending'
}

export function partitionTransferItemsForHistoryClear(items: TransferItem[]) {
  const kept: TransferItem[] = []
  const removed: TransferItem[] = []

  for (const item of items) {
    if (isActiveTransferItem(item)) {
      kept.push(item)
    }
    else {
      removed.push(item)
    }
  }

  return { kept, removed }
}

export function collectTrackedBlobUrls(items: Array<Pick<TransferItem, 'content'>>) {
  const urls = new Set<string>()

  for (const item of items) {
    if (typeof item.content === 'string' && item.content.startsWith('blob:')) {
      urls.add(item.content)
    }
  }

  return Array.from(urls)
}
