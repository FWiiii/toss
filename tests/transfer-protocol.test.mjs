/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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

test('transfer panel sends multi-file offers through the typed sendFile boundary', async () => {
  const panelSource = await readFile(new URL('../components/transfer-panel.tsx', import.meta.url), 'utf8')
  const contextSource = await readFile(new URL('../lib/transfer-context.tsx', import.meta.url), 'utf8')

  assert.match(panelSource, /buildOutgoingTransferOfferSummary/)
  assert.match(panelSource, /await sendFile\(file, offerSummary\)/)
  assert.doesNotMatch(panelSource, /sendFileWithSummary/)
  assert.match(contextSource, /sendFile:\s*\(file: File,\s*offerSummary\?: FileOfferSummary\)\s*=> Promise<void>/)
})
