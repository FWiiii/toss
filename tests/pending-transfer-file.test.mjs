/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'

test('remote pending transfer files stay lazy until explicitly resolved', async () => {
  const {
    createRemotePendingTransferFile,
    resolvePendingTransferFile,
  } = await import('../lib/pending-transfer-file.ts')

  let fetchCalls = 0
  const entry = createRemotePendingTransferFile({
    id: 'remote-1',
    name: 'shared.txt',
    size: 7,
    type: 'text/plain',
    resolveFile: async () => {
      fetchCalls++
      return new File(['payload'], 'shared.txt', { type: 'text/plain' })
    },
  })

  assert.equal(fetchCalls, 0)
  const file = await resolvePendingTransferFile(entry)

  assert.equal(fetchCalls, 1)
  assert.equal(file.name, 'shared.txt')
  assert.equal(await file.text(), 'payload')
})

test('stored pending transfer files defer base64 conversion until resolution', async () => {
  const {
    createStoredPendingTransferFile,
    resolvePendingTransferFile,
  } = await import('../lib/pending-transfer-file.ts')

  let decodeCalls = 0
  const entry = createStoredPendingTransferFile(
    {
      data: 'SGVsbG8=',
      name: 'hello.txt',
      type: 'text/plain',
    },
    (base64, name, type) => {
      decodeCalls++
      return new File([Buffer.from(base64, 'base64')], name, { type })
    },
  )

  assert.equal(decodeCalls, 0)
  const file = await resolvePendingTransferFile(entry)

  assert.equal(decodeCalls, 1)
  assert.equal(await file.text(), 'Hello')
})
