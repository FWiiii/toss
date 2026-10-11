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
      summary: {
        fileCount: 12,
        totalSize: 842 * 1024 * 1024,
        sampleFiles: [
          { name: 'a.jpg', size: 1, type: 'image/jpeg' },
          { name: 'b.jpg', size: 1, type: 'image/jpeg' },
          { name: 'c.jpg', size: 1, type: 'image/jpeg' },
        ],
        riskFlags: ['batch', 'executable'],
        requiresSecondaryConfirmation: true,
        executableFileName: 'RemoteHelper.dmg',
      },
    }),
    {
      type: 'file-offer',
      offerId: 'offer-1',
      name: 'demo.txt',
      fileType: 'text/plain',
      size: 12,
      summary: {
        fileCount: 12,
        totalSize: 842 * 1024 * 1024,
        sampleFiles: [
          { name: 'a.jpg', size: 1, type: 'image/jpeg' },
          { name: 'b.jpg', size: 1, type: 'image/jpeg' },
          { name: 'c.jpg', size: 1, type: 'image/jpeg' },
        ],
        riskFlags: ['batch', 'executable'],
        requiresSecondaryConfirmation: true,
        executableFileName: 'RemoteHelper.dmg',
      },
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
    type: 'file-start',
    name: 'demo.txt',
    fileType: 'text/plain',
    size: 12,
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
    type: 'file-offer',
    offerId: 'offer-1',
    name: 'demo.txt',
    fileType: 'text/plain',
    size: 10,
    summary: {
      fileCount: 2,
      totalSize: 10,
      sampleFiles: [
        { name: 'a.jpg', size: 1, type: 'image/jpeg' },
        { name: 'b.jpg', size: 1, type: 'image/jpeg' },
        { name: 'c.jpg', size: 1, type: 'image/jpeg' },
        { name: 'd.jpg', size: 1, type: 'image/jpeg' },
      ],
    },
  }), null)

  assert.equal(validateIncomingTransferPayload({
    type: 'file-offer',
    offerId: 'offer-1',
    name: 'demo.txt',
    fileType: 'text/plain',
    size: 10,
    summary: {
      fileCount: 2,
      totalSize: 10,
      sampleFiles: [
        { name: 'a.jpg', size: 1, type: 'image/jpeg' },
      ],
      riskFlags: ['mystery-risk'],
    },
  }), null)

  assert.equal(validateIncomingTransferPayload({
    type: 'file-offer-response',
    offerId: 'offer-1',
    accepted: 'yes',
  }), null)
})

test('buildOutgoingTransferOfferSummary omits single files and summarizes batches', async () => {
  const { buildOutgoingTransferOfferSummary } = await import('../lib/transfer-data.ts')

  const solo = new File([new Uint8Array([1, 2, 3])], 'solo.txt', { type: 'text/plain' })
  assert.equal(buildOutgoingTransferOfferSummary([solo]), undefined)

  const files = [
    new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array([1, 2])], 'b.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array([1, 2, 3])], 'c.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array([1, 2, 3, 4])], 'd.jpg', { type: 'image/jpeg' }),
  ]

  assert.deepEqual(buildOutgoingTransferOfferSummary(files), {
    fileCount: 4,
    totalSize: 10,
    sampleFiles: [
      { name: 'a.jpg', size: 1, type: 'image/jpeg' },
      { name: 'b.jpg', size: 2, type: 'image/jpeg' },
      { name: 'c.jpg', size: 3, type: 'image/jpeg' },
    ],
  })
})

test('buildOutgoingTransferOfferSummary carries executable risk beyond sampled files', async () => {
  const { buildOutgoingTransferOfferSummary } = await import('../lib/transfer-data.ts')

  const files = [
    new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array([1, 2])], 'b.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array([1, 2, 3])], 'c.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array([1, 2, 3, 4])], 'installer.dmg', { type: 'application/x-apple-diskimage' }),
  ]

  assert.deepEqual(buildOutgoingTransferOfferSummary(files), {
    fileCount: 4,
    totalSize: 10,
    sampleFiles: [
      { name: 'a.jpg', size: 1, type: 'image/jpeg' },
      { name: 'b.jpg', size: 2, type: 'image/jpeg' },
      { name: 'c.jpg', size: 3, type: 'image/jpeg' },
    ],
    riskFlags: ['executable'],
    requiresSecondaryConfirmation: true,
    executableFileName: 'installer.dmg',
  })
})

test('maximum encrypted file chunks validate and decrypt without dropping bytes', async () => {
  const { validateIncomingRawPeerPayload } = await import('../lib/transfer-protocol.ts')
  const { FILE_CHUNK_MAX_SIZE } = await import('../lib/peer-config.ts')
  const { SessionEncryptor } = await import('../lib/crypto.ts')
  const sender = new SessionEncryptor()
  const receiver = new SessionEncryptor()
  const secret = crypto.getRandomValues(new Uint8Array(32)).buffer
  await sender.deriveKeys(secret, 'initiator')
  await receiver.deriveKeys(secret, 'responder')
  const plain = new Uint8Array(FILE_CHUNK_MAX_SIZE).fill(37)
  const encrypted = await sender.encrypt(plain)
  const payload = { type: 'file-chunk', itemId: 'file-1', offset: 0, encrypted: true }
  const validated = validateIncomingRawPeerPayload({ ...payload, bytes: encrypted })
  assert.equal(validated?.type, 'file-chunk')
  assert.deepEqual(await receiver.decrypt(new Uint8Array(validated.bytes)), plain)
  assert.equal(validateIncomingRawPeerPayload({ ...payload, bytes: new Uint8Array(encrypted.length + 1) }), null)
  assert.equal(validateIncomingRawPeerPayload({ ...payload, encrypted: false, bytes: encrypted }), null)
})
