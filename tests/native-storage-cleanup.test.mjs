/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'

const DAY = 24 * 60 * 60 * 1000

function createFakeFilesystem(entries) {
  const files = new Map(entries)
  const deleted = []

  return {
    deleted,
    files,
    async readdir({ path }) {
      const prefix = `${path}/`
      const names = [...files.keys()]
        .filter(key => key.startsWith(prefix))
        .map(key => key.slice(prefix.length))
        .filter(name => !name.includes('/'))
        .map(name => ({ name, mtime: files.get(prefix + name).mtime, type: 'file' }))

      if (names.length === 0) {
        throw new Error('Directory does not exist')
      }
      return { files: names }
    },
    async deleteFile({ path }) {
      if (!files.has(path)) {
        throw new Error('File does not exist')
      }
      files.delete(path)
      deleted.push(path)
    },
    async appendFile() {},
    async writeFile() {},
    async rename() {},
    async getUri({ path }) { return { uri: `file:///data/${path}` } },
    async stat() { return {} },
    async rmdir() {},
  }
}

test('cleanup removes interrupted .part fragments but keeps completed files', async () => {
  const { cleanupNativeStorage } = await import('../lib/native-storage-cleanup.ts')
  const filesystem = createFakeFilesystem(new Map([
    ['toss-received/photo.jpg', { mtime: Date.now() }],
    ['toss-received/transfer-1.part', { mtime: Date.now() }],
    ['toss-received/transfer-2.part', { mtime: Date.now() }],
  ]))

  const result = await cleanupNativeStorage({ filesystem })

  assert.equal(result.partRemoved, 2)
  assert.equal(filesystem.files.has('toss-received/photo.jpg'), true)
  assert.equal(filesystem.files.has('toss-received/transfer-1.part'), false)
  assert.equal(filesystem.files.has('toss-received/transfer-2.part'), false)
})

test('cleanup keeps recent inbox shares and removes expired ones', async () => {
  const { cleanupNativeStorage } = await import('../lib/native-storage-cleanup.ts')
  const now = 10 * DAY
  const filesystem = createFakeFilesystem(new Map([
    ['toss-inbox/fresh.txt', { mtime: now - 1000 }],
    ['toss-inbox/stale.txt', { mtime: now - 2 * DAY }],
    ['toss-inbox/boundary.txt', { mtime: now - DAY + 1 }],
  ]))

  const result = await cleanupNativeStorage({ filesystem, now })

  assert.equal(result.inboxRemoved, 1)
  assert.equal(filesystem.files.has('toss-inbox/fresh.txt'), true)
  assert.equal(filesystem.files.has('toss-inbox/boundary.txt'), true)
  assert.equal(filesystem.files.has('toss-inbox/stale.txt'), false)
})

test('cleanup treats missing directories as empty instead of failing', async () => {
  const { cleanupNativeStorage } = await import('../lib/native-storage-cleanup.ts')
  const filesystem = createFakeFilesystem(new Map())

  const result = await cleanupNativeStorage({ filesystem })
  assert.deepEqual(result, { inboxRemoved: 0, partRemoved: 0 })
})

test('cleanup never touches files outside the staging directories', async () => {
  const { cleanupNativeStorage } = await import('../lib/native-storage-cleanup.ts')
  const now = 10 * DAY
  const filesystem = createFakeFilesystem(new Map([
    ['toss-received/keep.bin', { mtime: now - 5 * DAY }],
    ['toss-inbox/expired.txt', { mtime: now - 5 * DAY }],
  ]))

  await cleanupNativeStorage({ filesystem, now })

  assert.equal(filesystem.files.has('toss-received/keep.bin'), true)
  assert.deepEqual(filesystem.deleted, ['toss-inbox/expired.txt'])
})
