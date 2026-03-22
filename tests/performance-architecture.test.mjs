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

test('file chunk transport stays binary and avoids base64 conversion in hot paths', async () => {
  const sendSource = await readProjectFile('lib/transfer-data.ts')
  const receiveSource = await readProjectFile('lib/transfer-connection.ts')

  assert.doesNotMatch(sendSource, /uint8ToBase64/)
  assert.doesNotMatch(receiveSource, /base64ToUint8/)
})

test('receive buffers do not retain whole file chunks in memory', async () => {
  const receiveSource = await readProjectFile('lib/transfer-context.tsx')

  assert.doesNotMatch(receiveSource, /chunks:\s*Uint8Array\[\]/)
})

test('share target avoids eager remote file hydration', async () => {
  const source = await readProjectFile('hooks/use-share-target.ts')

  assert.doesNotMatch(source, /Promise\.all\(/)
  assert.doesNotMatch(source, /fetchRemoteFiles/)
})

test('transfer panel uses localized render controls instead of DOM queries', async () => {
  const panelSource = await readProjectFile('components/transfer-panel.tsx')
  const itemSource = await readProjectFile('components/transfer-item.tsx')
  const pageSource = await readProjectFile('app/page.tsx')

  assert.doesNotMatch(panelSource, /querySelector/)
  assert.match(panelSource, /useMemo\(/)
  assert.match(itemSource, /memo\(/)
  assert.doesNotMatch(pageSource, /import\s+\{\s*memo\s*\}\s+from\s+'react'/)
})

test('connection recovery uses relaxed timeouts and single-flight reconnect guards', async () => {
  const peerConfigSource = await readProjectFile('lib/peer-config.ts')
  const connectionSource = await readProjectFile('lib/transfer-connection.ts')
  const roomSource = await readProjectFile('lib/transfer-room.ts')

  assert.match(peerConfigSource, /export const CONNECTION_TIMEOUT = (3[5-9]\d{3}|[4-9]\d{4,})/)
  assert.match(peerConfigSource, /export const ICE_DISCONNECTED_GRACE_PERIOD_MS = ([5-9]\d{3}|\d{5,})/)
  assert.match(connectionSource, /HEARTBEAT_TIMEOUT_MS/)
  assert.match(connectionSource, /connectingPeersRef/)
  assert.match(roomSource, /connectingPeersRef/)
})
