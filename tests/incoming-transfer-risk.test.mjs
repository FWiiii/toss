import assert from 'node:assert/strict'
import test from 'node:test'

test('buildIncomingTransferSummary marks executable, large, and batch risks', async () => {
  const { buildIncomingTransferSummary } = await import('../lib/incoming-transfer-risk.ts')

  const summary = buildIncomingTransferSummary({
    files: [
      { name: 'RemoteHelper.dmg', size: 600 * 1024 * 1024, type: 'application/x-apple-diskimage' },
      { name: 'notes.txt', size: 128, type: 'text/plain' },
    ],
  })

  assert.equal(summary.fileCount, 2)
  assert.equal(summary.totalSize, 600 * 1024 * 1024 + 128)
  assert.deepEqual(summary.riskFlags, ['executable', 'large'])
  assert.equal(summary.requiresSecondaryConfirmation, true)
})

test('buildIncomingTransferSummary truncates sample files to the first three names', async () => {
  const { buildIncomingTransferSummary } = await import('../lib/incoming-transfer-risk.ts')

  const summary = buildIncomingTransferSummary({
    files: Array.from({ length: 5 }, (_, index) => ({
      name: `photo-${index + 1}.jpg`,
      size: 1024,
      type: 'image/jpeg',
    })),
  })

  assert.equal(summary.fileCount, 5)
  assert.deepEqual(summary.sampleFiles.map(file => file.name), [
    'photo-1.jpg',
    'photo-2.jpg',
    'photo-3.jpg',
  ])
  assert.deepEqual(summary.riskFlags, [])
})
