/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'

const SAMPLE = {
  mimeType: 'application/pdf',
  name: 'report.pdf',
  path: 'toss-received/report.pdf',
  size: 5,
  src: 'capacitor://localhost/_capacitor_file_/data/toss-received/report.pdf',
  uri: 'file:///data/toss-received/report.pdf',
}

test('native save hands the private file URI to the system share sheet', async () => {
  const { saveNativeFile } = await import('../lib/native-file-save.ts')

  const calls = []
  const share = {
    async canShare() { return { value: true } },
    async share(options) {
      calls.push(options)
      return { activityType: 'com.apple.DocumentsApp' }
    },
  }

  await saveNativeFile(SAMPLE, share)

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].files, ['file:///data/toss-received/report.pdf'])
  assert.equal(calls[0].title, 'report.pdf')
})

test('native save reports unsupported devices and missing paths instead of silently doing nothing', async () => {
  const { saveNativeFile } = await import('../lib/native-file-save.ts')

  const unavailable = {
    async canShare() { return { value: false } },
    async share() { throw new Error('should not be called') },
  }
  await assert.rejects(() => saveNativeFile(SAMPLE, unavailable), /不支持系统分享/)

  const noUri = {
    async canShare() { return { value: true } },
    async share() { throw new Error('should not be called') },
  }
  await assert.rejects(
    () => saveNativeFile({ ...SAMPLE, uri: '' }, noUri),
    /文件路径不可用/,
  )
})

test('native save surfaces share failures to the caller', async () => {
  const { saveNativeFile } = await import('../lib/native-file-save.ts')

  const failing = {
    async canShare() { return { value: true } },
    async share() { throw new Error('Share canceled') },
  }

  await assert.rejects(() => saveNativeFile(SAMPLE, failing), /Share canceled/)
})

test('file saver registry is empty until a native entry registers one', async () => {
  const { getNativeFileSaver, registerNativeFileSaver } = await import('../lib/file-save.ts')

  assert.equal(getNativeFileSaver(), null)

  const saved = []
  registerNativeFileSaver(async (file) => {
    saved.push(file.path)
  })

  await getNativeFileSaver()({ mimeType: 'text/plain', path: 'toss-received/a.txt', uri: 'file:///a.txt' })
  assert.deepEqual(saved, ['toss-received/a.txt'])
})
