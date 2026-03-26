/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const ROOT = new URL('../', import.meta.url)

async function readProjectFile(path) {
  return readFile(new URL(path, ROOT), 'utf8')
}

test('bindIncomingScreenShareCall delivers an already-present remote stream exactly once', async () => {
  const { bindIncomingScreenShareCall } = await import('../lib/screen-share.ts')

  const stream = { id: 'remote-stream' }
  const events = new Map()
  const seen = []
  const call = {
    remoteStream: stream,
    answerCalls: 0,
    on(event, handler) {
      events.set(event, handler)
    },
    answer() {
      this.answerCalls++
    },
  }

  bindIncomingScreenShareCall(call, (incomingStream, activeCall) => {
    seen.push({ incomingStream, activeCall })
  })

  assert.equal(call.answerCalls, 1)
  assert.deepEqual(seen, [{ incomingStream: stream, activeCall: call }])

  events.get('stream')?.(stream)
  assert.equal(seen.length, 1)
})

test('bindIncomingScreenShareCall forwards the first later stream event after answering', async () => {
  const { bindIncomingScreenShareCall } = await import('../lib/screen-share.ts')

  const events = new Map()
  const seen = []
  const stream = { id: 'late-stream' }
  const call = {
    answerCalls: 0,
    on(event, handler) {
      events.set(event, handler)
    },
    answer() {
      this.answerCalls++
    },
  }

  bindIncomingScreenShareCall(call, (incomingStream, activeCall) => {
    seen.push({ incomingStream, activeCall })
  })

  assert.equal(call.answerCalls, 1)
  assert.equal(seen.length, 0)

  events.get('stream')?.(stream)
  assert.deepEqual(seen, [{ incomingStream: stream, activeCall: call }])
})

test('stopOutgoingScreenShare stops tracks, closes all calls, and removes the active item', async () => {
  const { stopOutgoingScreenShare } = await import('../lib/screen-share.ts')

  let stopCount = 0
  const closed = []
  const removed = []
  const stream = {
    getTracks() {
      return [
        { stop() { stopCount++ } },
        { stop() { stopCount++ } },
      ]
    },
  }

  const changed = stopOutgoingScreenShare({
    stream,
    calls: [
      { close() { closed.push('first') } },
      { close() { closed.push('second') } },
    ],
    itemId: 'outgoing-item',
    removeItem: id => removed.push(id),
  })

  assert.equal(changed, true)
  assert.equal(stopCount, 2)
  assert.deepEqual(closed, ['first', 'second'])
  assert.deepEqual(removed, ['outgoing-item'])
})

test('ensureScreenShareCallForPeer dials late peers once and removes closed calls', async () => {
  const { ensureScreenShareCallForPeer } = await import('../lib/screen-share.ts')

  const eventsByPeer = new Map()
  const errors = []
  const closed = []
  const peer = {
    call(peerId, stream) {
      const events = new Map()
      const call = {
        peer: peerId,
        stream,
        on(event, handler) {
          events.set(event, handler)
        },
      }
      eventsByPeer.set(peerId, events)
      return call
    },
  }

  const stream = { id: 'active-share' }
  const calls = ensureScreenShareCallForPeer({
    peer,
    peerId: 'peer-a',
    stream,
    calls: [],
    onError: (peerId, error) => errors.push([peerId, error]),
    onClose: peerId => closed.push(peerId),
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].peer, 'peer-a')

  const duplicate = ensureScreenShareCallForPeer({
    peer,
    peerId: 'peer-a',
    stream,
    calls,
    onError: (peerId, error) => errors.push([peerId, error]),
    onClose: peerId => closed.push(peerId),
  })

  assert.equal(duplicate.length, 1)

  eventsByPeer.get('peer-a').get('error')?.('boom')
  eventsByPeer.get('peer-a').get('close')?.()
  assert.deepEqual(errors, [['peer-a', 'boom']])
  assert.deepEqual(closed, ['peer-a'])
})

test('partitionTransferItemsForHistoryClear keeps active items and only collects removed blob URLs', async () => {
  const {
    collectTrackedBlobUrls,
    partitionTransferItemsForHistoryClear,
  } = await import('../lib/transfer-item-history.ts')

  const activeBlob = 'blob:active'
  const completedBlob = 'blob:completed'
  const duplicateBlob = 'blob:completed'

  const { kept, removed } = partitionTransferItemsForHistoryClear([
    { id: '1', status: 'transferring', content: activeBlob },
    { id: '2', status: 'completed', content: completedBlob },
    { id: '3', status: 'error', content: duplicateBlob },
    { id: '4', status: 'pending', content: 'plain-text' },
  ])

  assert.deepEqual(kept.map(item => item.id), ['1', '4'])
  assert.deepEqual(removed.map(item => item.id), ['2', '3'])
  assert.deepEqual(collectTrackedBlobUrls(removed), [completedBlob])
})

test('screen share wiring uses shared helpers, active stream items, and item-derived UI state', async () => {
  const roomSource = await readProjectFile('lib/transfer-room.ts')
  const connectionSource = await readProjectFile('lib/transfer-connection.ts')
  const contextSource = await readProjectFile('lib/transfer-context.tsx')
  const itemsSource = await readProjectFile('hooks/use-transfer-items.ts')
  const streamSource = await readProjectFile('components/stream-item.tsx')
  const panelSource = await readProjectFile('components/transfer-panel.tsx')
  const itemSource = await readProjectFile('components/transfer-item.tsx')

  assert.match(roomSource, /bindIncomingScreenShareCall\(call, callbacks\.onIncomingScreenShare\)/)
  assert.match(connectionSource, /callbacks\.handlePeerConnectedToScreenShare\?\.\(conn\.peer\)/)
  assert.match(contextSource, /ensureScreenShareCallForPeer\(/)
  assert.match(contextSource, /type:\s*'stream'[\s\S]*status:\s*'transferring'/)
  assert.match(contextSource, /cleanupScreenShare\(false\)/)
  assert.match(itemsSource, /collectTrackedBlobUrls\(removed\)/)
  assert.match(streamSource, /muted=\{item\.direction === 'sent'\}/)
  assert.match(panelSource, /const isScreenSharing = useMemo\([\s\S]*items\.some\([\s\S]*item\.type === 'stream'[\s\S]*item\.direction === 'sent'/)
  assert.match(itemSource, /onStop=\{item\.direction === 'sent' \? onStopStream : undefined\}/)
})

test('screen share capture avoids unsupported min constraints in display-media requests', async () => {
  const contextSource = await readProjectFile('lib/transfer-context.tsx')

  assert.match(contextSource, /getDisplayMedia\(displayMediaOptions\)/)
  assert.doesNotMatch(contextSource, /frameRate:\s*\{\s*ideal:\s*60,\s*min:\s*30\s*\}/)
})
