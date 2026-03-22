/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const ROOT = new URL('../', import.meta.url)

async function readProjectFile(path) {
  return readFile(new URL(path, ROOT), 'utf8')
}

test('room panel lazy-loads QR dialogs instead of statically importing them', async () => {
  const source = await readProjectFile('components/room-panel.tsx')

  assert.match(source, /from 'next\/dynamic'/)
  assert.doesNotMatch(source, /from ['"]@\/components\/qr-code-display['"]/)
  assert.doesNotMatch(source, /from ['"]@\/components\/qr-code-scanner['"]/)
})

test('transfer items are exposed through a dedicated hook', async () => {
  const contextSource = await readProjectFile('lib/transfer-context.tsx')
  const panelSource = await readProjectFile('components/transfer-panel.tsx')

  assert.match(contextSource, /export function useTransferItems\(/)
  assert.match(panelSource, /useTransferItems\(/)
})
