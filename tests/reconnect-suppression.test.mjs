/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const ROOT = new URL('../', import.meta.url)

async function readProjectFile(path) {
  return readFile(new URL(path, ROOT), 'utf8')
}

test('attemptReconnect respects reconnect suppression and hidden-document deferral', async () => {
  const source = await readProjectFile('lib/transfer-connection.ts')

  assert.match(source, /suppressReconnectUntilRef/)
  assert.match(source, /pendingReconnectRef/)
  assert.match(source, /document\.visibilityState === 'hidden'/)
})

test('visibility recovery clears deferred reconnect suppression after file picking', async () => {
  const source = await readProjectFile('lib/transfer-context.tsx')

  assert.match(source, /pendingReconnectRef/)
  assert.match(source, /suppressReconnectUntilRef\.current = 0/)
  assert.match(source, /pendingReconnectRef\.current = false/)
})
