/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'

function createFakeFilesystem(initial = new Map()) {
  const files = new Map(initial)
  const calls = []

  const key = path => path

  return {
    calls,
    files,
    async appendFile({ path, data }) {
      calls.push(['appendFile', path])
      const existing = files.get(key(path))
      if (existing === undefined) {
        throw new Error('File does not exist')
      }
      files.set(key(path), Buffer.concat([existing, Buffer.from(data, 'base64')]))
    },
    async writeFile({ path, data }) {
      calls.push(['writeFile', path])
      files.set(key(path), Buffer.from(data, 'base64'))
    },
    async deleteFile({ path }) {
      calls.push(['deleteFile', path])
      if (!files.has(key(path))) {
        throw new Error('File does not exist')
      }
      files.delete(key(path))
    },
    async rename({ from, to }) {
      calls.push(['rename', from, to])
      const content = files.get(key(from))
      if (content === undefined) {
        throw new Error('File does not exist')
      }
      files.delete(key(from))
      files.set(key(to), content)
    },
    async getUri({ path }) {
      return { uri: `file:///data/${path}` }
    },
    async stat({ path }) {
      if (!files.has(key(path))) {
        throw new Error('File does not exist')
      }
      return { size: files.get(key(path)).length }
    },
  }
}

test('native receive storage writes chunks to a private part file and commits on finalize', async () => {
  const { createNativeReceiveStorage } = await import('../lib/native-receive-storage.ts')
  const filesystem = createFakeFilesystem()

  const storage = await createNativeReceiveStorage({
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    transferId: 'transfer-1',
    filesystem,
    convertFileSrc: uri => `capacitor://localhost/_capacitor_file_${uri}`,
  })

  await storage.appendChunk(new Uint8Array([1, 2, 3]))
  await storage.appendChunk(new Uint8Array([4, 5]))

  assert.equal(filesystem.files.has('toss-received/transfer-1.part'), true)
  assert.equal(filesystem.files.has('toss-received/report.pdf'), false)

  const finalized = await storage.finalize()

  assert.equal(finalized.kind, 'native')
  assert.equal(finalized.native.name, 'report.pdf')
  assert.equal(finalized.native.mimeType, 'application/pdf')
  assert.equal(finalized.native.size, 5)
  assert.equal(finalized.native.path, 'toss-received/report.pdf')
  assert.equal(finalized.native.uri, 'file:///data/toss-received/report.pdf')
  assert.match(finalized.native.src, /^capacitor:\/\/localhost\/_capacitor_file_/)
  assert.deepEqual([...filesystem.files.get('toss-received/report.pdf')], [1, 2, 3, 4, 5])
  assert.equal(filesystem.files.has('toss-received/transfer-1.part'), false)
})

test('aborting a native receive leaves no part or final file behind', async () => {
  const { createNativeReceiveStorage } = await import('../lib/native-receive-storage.ts')
  const filesystem = createFakeFilesystem()

  const storage = await createNativeReceiveStorage({
    fileName: 'video.mp4',
    mimeType: 'video/mp4',
    transferId: 'transfer-2',
    filesystem,
  })

  await storage.appendChunk(new Uint8Array(1024))
  await storage.abort()

  assert.equal(filesystem.files.size, 0)
  await assert.rejects(() => storage.appendChunk(new Uint8Array([9])))
})

test('finalizing without any chunk fails instead of creating an empty file', async () => {
  const { createNativeReceiveStorage } = await import('../lib/native-receive-storage.ts')
  const filesystem = createFakeFilesystem()

  const storage = await createNativeReceiveStorage({
    fileName: 'empty.bin',
    mimeType: 'application/octet-stream',
    transferId: 'transfer-3',
    filesystem,
  })

  await assert.rejects(() => storage.finalize(), /No data was written/)
  assert.equal(filesystem.files.size, 0)
})

test('hostile file names cannot escape the received directory or collide', async () => {
  const { createNativeReceiveStorage, sanitizeReceivedFileName } = await import('../lib/native-receive-storage.ts')

  assert.equal(sanitizeReceivedFileName('../../etc/passwd'), 'passwd')
  assert.equal(sanitizeReceivedFileName('..\\..\\Windows\\system32\\cmd.exe'), 'cmd.exe')
  assert.equal(sanitizeReceivedFileName(''), 'received-file')
  assert.equal(sanitizeReceivedFileName('..'), 'received-file')
  assert.equal(sanitizeReceivedFileName('bad\u0000name.txt'), 'bad_name.txt')

  const filesystem = createFakeFilesystem(new Map([
    ['toss-received/photo.jpg', Buffer.from([0])],
  ]))

  const first = await createNativeReceiveStorage({
    fileName: '../../photo.jpg',
    mimeType: 'image/jpeg',
    transferId: 'transfer-4',
    filesystem,
  })
  await first.appendChunk(new Uint8Array([7]))
  const finalized = await first.finalize()

  assert.equal(finalized.native.path, 'toss-received/photo (1).jpg')
  assert.equal(filesystem.files.has('toss-received/photo.jpg'), true)
  assert.deepEqual([...filesystem.files.get('toss-received/photo (1).jpg')], [7])
  assert.equal([...filesystem.files.keys()].every(path => path.startsWith('toss-received/')), true)
})

test('a failing native write surfaces an error and leaves no completed file', async () => {
  const { createNativeReceiveStorage } = await import('../lib/native-receive-storage.ts')

  const files = new Map()
  let writes = 0
  const filesystem = {
    async appendFile() {
      throw new Error('No space left on device')
    },
    async writeFile({ path, data }) {
      writes += 1
      // 首块写入成功，模拟磁盘在传输中途写满。
      if (writes > 1) {
        throw new Error('No space left on device')
      }
      files.set(path, Buffer.from(data, 'base64'))
    },
    async deleteFile({ path }) {
      files.delete(path)
    },
    async rename({ from, to }) {
      files.set(to, files.get(from))
      files.delete(from)
    },
    async getUri({ path }) { return { uri: `file:///data/${path}` } },
    async stat({ path }) {
      if (!files.has(path)) {
        throw new Error('File does not exist')
      }
      return { size: files.get(path).length }
    },
  }

  const storage = await createNativeReceiveStorage({
    fileName: 'big.iso',
    mimeType: 'application/octet-stream',
    transferId: 'transfer-6',
    filesystem,
  })

  await storage.appendChunk(new Uint8Array([1, 2, 3]))
  await assert.rejects(() => storage.appendChunk(new Uint8Array([4, 5, 6])))

  await storage.abort()
  assert.equal(files.size, 0)
})

test('native storage bypasses the WebView quota heuristic', async () => {
  const { hasStorageQuotaFor, registerNativeReceiveStorage } = await import('../lib/receive-storage.ts')

  // 未注册原生实现时使用 StorageManager 启发式（此处环境无 estimate，返回 true）。
  assert.equal(await hasStorageQuotaFor(1024), true)

  registerNativeReceiveStorage(async () => ({
    async abort() {},
    async appendChunk() {},
    async finalize() { throw new Error('unused') },
  }))

  // 注册后不再用 WebView 源配额判断，交由真实写入结果决定。
  assert.equal(await hasStorageQuotaFor(1024 * 1024 * 1024), true)
})

test('receive storage selects the registered native implementation when present', async () => {
  const { createReceiveStorage, registerNativeReceiveStorage } = await import('../lib/receive-storage.ts')

  const calls = []
  registerNativeReceiveStorage(async (options) => {
    calls.push(options.fileName)
    return {
      async abort() {},
      async appendChunk() {},
      async finalize() {
        return {
          kind: 'native',
          native: { mimeType: options.mimeType, name: options.fileName, path: `toss-received/${options.fileName}`, size: 0, src: 'capacitor://x', uri: 'file:///x' },
        }
      },
    }
  })

  const storage = await createReceiveStorage({
    fileName: 'native.txt',
    mimeType: 'text/plain',
    transferId: 'transfer-5',
  })

  assert.deepEqual(calls, ['native.txt'])
  const finalized = await storage.finalize()
  assert.equal(finalized.kind, 'native')
})
