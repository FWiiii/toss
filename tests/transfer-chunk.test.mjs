/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

test('binary file chunk payload round-trips bytes without base64 encoding', async () => {
  const {
    createBinaryFileChunkPayload,
    readBinaryChunkPayload,
  } = await import('../lib/transfer-chunk.ts')

  const source = new Uint8Array([0, 255, 1, 128, 64])
  const payload = createBinaryFileChunkPayload({
    bytes: source,
    itemId: 'item-1',
    offset: 12,
  })

  assert.equal(payload.type, 'file-chunk')
  assert.equal(payload.itemId, 'item-1')
  assert.equal(payload.offset, 12)
  assert.ok(payload.bytes instanceof ArrayBuffer)
  assert.deepEqual(Array.from(readBinaryChunkPayload(payload.bytes)), Array.from(source))
})

test('binary chunk reader accepts typed array views', async () => {
  const { readBinaryChunkPayload } = await import('../lib/transfer-chunk.ts')

  const source = Uint8Array.from([5, 4, 3, 2, 1])
  const view = new Uint8Array(source.buffer, 1, 3)

  assert.deepEqual(Array.from(readBinaryChunkPayload(view)), [4, 3, 2])
})
