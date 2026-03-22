/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

async function loadShareStorage() {
  try {
    return await import('../lib/share-storage.ts')
  }
  catch (error) {
    assert.fail(`Expected lib/share-storage.ts to exist: ${String(error)}`)
  }
}

test('share payloads round-trip through manifest and file reads', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'toss-share-storage-'))
  const {
    deleteSharePayload,
    persistSharePayload,
    readSharePayloadFile,
    readSharePayloadManifest,
  } = await loadShareStorage()

  await persistSharePayload({
    shareId: 'share-test',
    title: 'hello',
    text: 'world',
    url: 'https://example.com',
    files: [
      {
        name: 'note.txt',
        type: 'text/plain',
        data: new Uint8Array(Buffer.from('payload', 'utf8')),
      },
    ],
  }, {
    now: 100,
    rootDir,
  })

  const manifest = await readSharePayloadManifest('share-test', { now: 100, rootDir })
  assert.ok(manifest)
  assert.equal(manifest.title, 'hello')
  assert.equal(manifest.text, 'world')
  assert.equal(manifest.url, 'https://example.com')
  assert.equal(manifest.files.length, 1)
  assert.equal(manifest.files[0].name, 'note.txt')
  assert.equal(manifest.files[0].type, 'text/plain')

  const file = await readSharePayloadFile('share-test', manifest.files[0].fileId, { now: 100, rootDir })
  assert.ok(file)
  assert.equal(file.name, 'note.txt')
  assert.equal(file.type, 'text/plain')
  assert.equal(Buffer.from(file.data).toString('utf8'), 'payload')

  await deleteSharePayload('share-test', { rootDir })
  assert.equal(await readSharePayloadManifest('share-test', { now: 100, rootDir }), null)

  await rm(rootDir, { force: true, recursive: true })
})

test('expired share payloads are cleaned up from disk', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'toss-share-storage-'))
  const {
    SHARE_PAYLOAD_TTL_MS,
    cleanupExpiredSharePayloads,
    persistSharePayload,
    readSharePayloadManifest,
  } = await loadShareStorage()

  await persistSharePayload({
    shareId: 'expired-share',
    title: '',
    text: 'stale',
    url: '',
    files: [],
  }, {
    now: 10,
    rootDir,
  })

  await cleanupExpiredSharePayloads({
    now: 10 + SHARE_PAYLOAD_TTL_MS + 1,
    rootDir,
  })

  assert.equal(await readSharePayloadManifest('expired-share', { rootDir }), null)

  await rm(rootDir, { force: true, recursive: true })
})
