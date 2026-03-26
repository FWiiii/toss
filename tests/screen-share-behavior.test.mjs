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

test('screen share wiring uses shared helpers, active stream items, and item-derived UI state', async () => {
  const roomSource = await readProjectFile('lib/transfer-room.ts')
  const contextSource = await readProjectFile('lib/transfer-context.tsx')
  const panelSource = await readProjectFile('components/transfer-panel.tsx')
  const itemSource = await readProjectFile('components/transfer-item.tsx')

  assert.match(roomSource, /bindIncomingScreenShareCall\(call, callbacks\.onIncomingScreenShare\)/)
  assert.match(contextSource, /type:\s*'stream'[\s\S]*status:\s*'transferring'/)
  assert.match(contextSource, /cleanupScreenShare\(false\)/)
  assert.match(panelSource, /const isScreenSharing = useMemo\([\s\S]*items\.some\([\s\S]*item\.type === 'stream'[\s\S]*item\.direction === 'sent'/)
  assert.match(itemSource, /onStop=\{item\.direction === 'sent' \? onStopStream : undefined\}/)
})
