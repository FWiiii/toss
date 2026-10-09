/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

test('buildIncomingTransferSummary marks executable and large risks', async () => {
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

test('buildIncomingTransferSummary marks batch risk and truncates sample files to the first three names', async () => {
  const { buildIncomingTransferSummary } = await import('../lib/incoming-transfer-risk.ts')

  const summary = buildIncomingTransferSummary({
    files: Array.from({ length: 10 }, (_, index) => ({
      name: `photo-${index + 1}.jpg`,
      size: 1024,
      type: 'image/jpeg',
    })),
  })

  assert.equal(summary.fileCount, 10)
  assert.deepEqual(summary.sampleFiles.map(file => file.name), [
    'photo-1.jpg',
    'photo-2.jpg',
    'photo-3.jpg',
  ])
  assert.deepEqual(summary.riskFlags, ['batch'])
})

test('buildIncomingTransferSummary keeps declared counts as safe lower bounds', async () => {
  const { buildIncomingTransferSummary } = await import('../lib/incoming-transfer-risk.ts')

  const summary = buildIncomingTransferSummary({
    files: [
      { name: 'photo-1.jpg', size: 1024, type: 'image/jpeg' },
      { name: 'photo-2.jpg', size: 2048, type: 'image/jpeg' },
      { name: 'photo-3.jpg', size: 4096, type: 'image/jpeg' },
    ],
    declaredFileCount: 12,
    declaredTotalSize: 16 * 1024,
  })

  assert.equal(summary.fileCount, 12)
  assert.equal(summary.totalSize, 16 * 1024)
  assert.deepEqual(summary.riskFlags, ['batch'])
})

test('buildIncomingTransferSummary never under-reports observed files or sizes', async () => {
  const { buildIncomingTransferSummary } = await import('../lib/incoming-transfer-risk.ts')

  const summary = buildIncomingTransferSummary({
    files: [
      { name: 'RemoteHelper.dmg', size: 600 * 1024 * 1024, type: 'application/x-apple-diskimage' },
      { name: 'notes.txt', size: 128, type: 'text/plain' },
    ],
    declaredFileCount: 1,
    declaredTotalSize: 64,
  })

  assert.equal(summary.fileCount, 2)
  assert.equal(summary.totalSize, 600 * 1024 * 1024 + 128)
  assert.deepEqual(summary.riskFlags, ['executable', 'large'])
  assert.equal(summary.requiresSecondaryConfirmation, true)
})

test('buildIncomingTransferSummary flags common script and installer extensions as executable', async () => {
  const { buildIncomingTransferSummary } = await import('../lib/incoming-transfer-risk.ts')

  const risky = [
    'update.ps1',
    'runme.js',
    'payload.hta',
    'doc.html',
    'image.svg',
    'setup.apk',
    'macro.vbs',
    'shortcut.lnk',
  ]

  for (const name of risky) {
    const summary = buildIncomingTransferSummary({
      files: [{ name, size: 128, type: 'application/octet-stream' }],
    })
    assert.deepEqual(summary.riskFlags, ['executable'], name)
    assert.equal(summary.requiresSecondaryConfirmation, true, name)
    assert.equal(summary.executableFileName, name, name)
  }

  // 大小写不敏感
  const upper = buildIncomingTransferSummary({
    files: [{ name: 'INSTALLER.EXE', size: 128, type: 'application/octet-stream' }],
  })
  assert.deepEqual(upper.riskFlags, ['executable'])
})
