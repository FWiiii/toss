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

  assert.deepEqual(
    validateIncomingTransferPayload({
      type: 'device-intro',
      deviceId: 'device-123',
      deviceName: '我的 MacBook',
    }),
    {
      type: 'device-intro',
      deviceId: 'device-123',
      deviceName: '我的 MacBook',
    },
  )

  assert.deepEqual(
    validateIncomingTransferPayload({
      type: 'file-offer',
      offerId: 'offer-1',
      name: 'demo.txt',
      fileType: 'text/plain',
      size: 12,
    }),
    {
      type: 'file-offer',
      offerId: 'offer-1',
      name: 'demo.txt',
      fileType: 'text/plain',
      size: 12,
    },
  )

  assert.deepEqual(
    validateIncomingTransferPayload({
      type: 'file-offer-response',
      offerId: 'offer-1',
      accepted: true,
    }),
    {
      type: 'file-offer-response',
      offerId: 'offer-1',
      accepted: true,
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

  assert.equal(validateIncomingTransferPayload({
    type: 'device-intro',
    deviceId: '',
    deviceName: '设备',
  }), null)

  assert.equal(validateIncomingTransferPayload({
    type: 'file-offer',
    offerId: 'offer-1',
    name: '',
    fileType: 'text/plain',
    size: 10,
  }), null)

  assert.equal(validateIncomingTransferPayload({
    type: 'file-offer-response',
    offerId: 'offer-1',
    accepted: 'yes',
  }), null)
})
