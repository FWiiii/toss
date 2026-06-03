/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

test('buildReceiveHistoryEntryFromOffer writes rejected receive history fields', async () => {
  const { buildReceiveHistoryEntryFromOffer } = await import('../lib/transfer-context.tsx')

  const entry = buildReceiveHistoryEntryFromOffer({
    offer: {
      offerId: 'offer-1',
      peerId: 'peer-1',
      deviceId: 'device-1',
      deviceName: 'Alice Mac',
      fileName: 'photo-1.jpg',
      fileType: 'image/jpeg',
      size: 1024,
      fingerprint: null,
      requestedAt: 123,
      summary: {
        fileCount: 1,
        totalSize: 1024,
        sampleFiles: [{ name: 'photo-1.jpg', size: 1024, type: 'image/jpeg' }],
        riskFlags: [],
        requiresSecondaryConfirmation: false,
        executableFileName: null,
      },
    },
    outcome: 'rejected',
    failureReason: null,
    now: 456,
  })

  assert.equal(entry.outcome, 'rejected')
  assert.equal(entry.offerId, 'offer-1')
  assert.equal(entry.deviceName, 'Alice Mac')
  assert.equal(entry.primaryFileName, 'photo-1.jpg')
  assert.equal(entry.fileType, 'image/jpeg')
  assert.equal(entry.timestamp, 456)
  assert.equal(typeof entry.id, 'string')
  assert.equal(entry.id.length > 0, true)
})

test('safelyAppendReceiveHistoryEntry prevents history failures from blocking transfer flow', async () => {
  const { safelyAppendReceiveHistoryEntry } = await import('../lib/transfer-context.tsx')

  let attempted = false
  let capturedError = null

  await safelyAppendReceiveHistoryEntry({
    appendEntry: async () => {
      attempted = true
      throw new Error('boom')
    },
    entry: { id: 'entry-1' },
    onError: (error) => {
      capturedError = error
    },
  })

  assert.equal(attempted, true)
  assert.equal(capturedError instanceof Error, true)
  assert.equal(capturedError?.message, 'boom')
})
