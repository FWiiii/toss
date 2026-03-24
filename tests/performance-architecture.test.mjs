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

test('incoming connection data is processed sequentially to avoid receive races', async () => {
  const connectionSource = await readProjectFile('lib/transfer-connection.ts')

  assert.match(connectionSource, /createSequentialAsyncProcessor/)
  assert.match(connectionSource, /conn\.on\('data',\s*\(data: any\) => \{/)
  assert.match(connectionSource, /processIncomingData\(\s*async\s*\(\)\s*=>/)
})

test('service worker does not intercept share target posts and avoids caching share payload endpoints', async () => {
  const swSource = await readProjectFile('public/sw.js')

  assert.doesNotMatch(swSource, /handleShareTarget/)
  assert.doesNotMatch(swSource, /url\.pathname === '\/share' && event\.request\.method === 'POST'/)
  assert.doesNotMatch(swSource, /cache\.put\(event\.request/)
  assert.match(swSource, /requestUrl\.pathname\.startsWith\('\/share'\)/)
})

test('share storage keeps payloads long enough for delayed peer connection flows', async () => {
  const shareStorageSource = await readProjectFile('lib/share-storage.ts')

  assert.match(shareStorageSource, /SHARE_PAYLOAD_TTL_MS = 15 \* 60 \* 1000/)
})

test('share payload is deleted after the client consumes the remote manifest', async () => {
  const shareTargetSource = await readProjectFile('hooks/use-share-target.ts')

  assert.match(shareTargetSource, /fetch\(`\/share\?id=\$\{shareId\}`\s*,\s*\{\s*method:\s*'DELETE'\s*\}\)/)
})

test('pwa install prompt remembers dismissal and has ios fallback instructions', async () => {
  const registerSource = await readProjectFile('components/pwa-register.tsx')

  assert.match(registerSource, /INSTALL_PROMPT_DISMISSED_AT_KEY/)
  assert.match(registerSource, /INSTALL_PROMPT_COOLDOWN_MS = 7 \* 24 \* 60 \* 60 \* 1000/)
  assert.match(registerSource, /isIos/)
  assert.match(registerSource, /isStandalone/)
})

test('room code copy announcement is only exposed to screen readers when state changes', async () => {
  const roomSource = await readProjectFile('components/room-panel.tsx')

  assert.match(roomSource, /const copyAnnouncement =/)
  assert.match(roomSource, /aria-live=\{copyAnnouncement \? 'polite' : 'off'\}/)
})

test('transfer panel keeps composer available while disconnected and queues text for later send', async () => {
  const panelSource = await readProjectFile('components/transfer-panel.tsx')
  const inputSource = await readProjectFile('components/transfer-input.tsx')

  assert.match(panelSource, /dispatchPendingShare\(\{ type: 'append-text'/)
  assert.doesNotMatch(panelSource, /\{isConnected && \(\s*<TransferInput/)
  assert.match(inputSource, /allowQueueWithoutConnection/)
})

test('host leave action requires confirmation before dissolving room', async () => {
  const roomSource = await readProjectFile('components/room-panel.tsx')

  assert.match(roomSource, /showLeaveConfirm/)
  assert.match(roomSource, /setShowLeaveConfirm\(true\)/)
  assert.match(roomSource, /<Dialog open=\{showLeaveConfirm\}/)
  assert.match(roomSource, /onClick=\{handleConfirmLeaveRoom\}/)
  assert.doesNotMatch(roomSource, /window\.confirm\(/)
  assert.match(roomSource, /onClick=\{handleLeaveRoom\}/)
})
