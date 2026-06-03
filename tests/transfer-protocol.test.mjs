/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

test('validateIncomingTransferPayload accepts supported control payloads', async () => {
  const { validateIncomingTransferPayload } = await import('../lib/transfer-protocol.ts')

  assert.deepEqual(
    validateIncomingTransferPayload({
      type: 'file-start',
      name: 'demo.txt',
      fileType: 'text/plain',
      size: 12,
      itemId: 'file-1',
      offset: 0,
      resume: false,
    }),
    {
      type: 'file-start',
      name: 'demo.txt',
      fileType: 'text/plain',
      size: 12,
      itemId: 'file-1',
      offset: 0,
      resume: false,
    },
  )
})

test('validateIncomingTransferPayload rejects malformed or oversized payloads', async () => {
  const { MAX_TRANSFER_TEXT_LENGTH, validateIncomingTransferPayload } = await import('../lib/transfer-protocol.ts')

  assert.equal(validateIncomingTransferPayload({
    type: 'file-start',
    name: '',
    fileType: 'text/plain',
    size: -1,
  }), null)

  assert.equal(validateIncomingTransferPayload({
    type: 'file-chunk',
    itemId: 'file-1',
    offset: -1,
    bytes: new ArrayBuffer(8),
  }), null)

  assert.equal(validateIncomingTransferPayload({
    type: 'text',
    content: 'x'.repeat(MAX_TRANSFER_TEXT_LENGTH + 1),
  }), null)

  assert.equal(validateIncomingTransferPayload({
    type: 'ping',
    id: '',
  }), null)
})
