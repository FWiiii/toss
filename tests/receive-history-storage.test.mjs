/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

function createRequest() {
  return {
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: undefined,
  }
}

function queueSuccess(request, result, callback) {
  queueMicrotask(() => {
    request.result = result
    callback?.()
    request.onsuccess?.({ target: request })
  })
}

function queueFailure(request, error, callback) {
  queueMicrotask(() => {
    request.error = error
    callback?.()
    request.onerror?.({ target: request })
  })
}

function createFakeIndexedDb() {
  const databases = new Map()

  function createDatabase() {
    const state = {
      stores: new Map(),
    }

    return {
      objectStoreNames: {
        contains(storeName) {
          return state.stores.has(storeName)
        },
      },
      createObjectStore(storeName) {
        if (!state.stores.has(storeName)) {
          state.stores.set(storeName, new Map())
        }
        return {}
      },
      transaction(storeName) {
        const tx = {
          error: null,
          oncomplete: null,
          onerror: null,
          objectStore() {
            const store = state.stores.get(storeName)
            if (!store) {
              throw new Error(`Missing store: ${storeName}`)
            }

            return {
              getAll() {
                const request = createRequest()
                queueSuccess(request, [...store.values()], () => {
                  tx.oncomplete?.()
                })
                return request
              },
              put(entry) {
                const request = createRequest()
                queueSuccess(request, entry, () => {
                  store.set(entry.id, entry)
                  tx.oncomplete?.()
                })
                return request
              },
              delete(id) {
                const request = createRequest()
                queueSuccess(request, undefined, () => {
                  store.delete(id)
                  tx.oncomplete?.()
                })
                return request
              },
              clear() {
                const request = createRequest()
                queueSuccess(request, undefined, () => {
                  store.clear()
                  tx.oncomplete?.()
                })
                return request
              },
            }
          },
        }

        return tx
      },
    }
  }

  return {
    open(name) {
      const request = createRequest()
      const existing = databases.get(name)
      const database = existing ?? createDatabase()

      databases.set(name, database)
      queueSuccess(request, database, () => {
        if (!existing) {
          request.onupgradeneeded?.({ target: request })
        }
      })
      return request
    },
  }
}

test('appendReceiveHistoryEntry stores newest entries first and prunes expired rows', async () => {
  const {
    appendReceiveHistoryEntry,
    listReceiveHistoryEntries,
    clearReceiveHistoryEntries,
  } = await import('../lib/receive-history-storage.ts')

  const now = Date.now()
  const first = {
    id: 'entry-1',
    offerId: 'offer-1',
    deviceId: 'device-1',
    deviceName: 'Alice Mac',
    timestamp: now - 1000,
    outcome: 'completed',
    primaryFileName: 'photo-1.jpg',
    fileType: 'image/jpeg',
    failureReason: null,
    summary: {
      fileCount: 1,
      totalSize: 1024,
      sampleFiles: [{ name: 'photo-1.jpg', size: 1024, type: 'image/jpeg' }],
      riskFlags: [],
      requiresSecondaryConfirmation: false,
      executableFileName: null,
    },
  }
  const second = {
    ...first,
    id: 'entry-2',
    offerId: 'offer-2',
    timestamp: now - 100,
    primaryFileName: 'photo-2.jpg',
    summary: {
      ...first.summary,
      sampleFiles: [{ name: 'photo-2.jpg', size: 1024, type: 'image/jpeg' }],
    },
  }

  const expired = {
    ...first,
    id: 'entry-expired',
    offerId: 'offer-expired',
    timestamp: now - (181 * 24 * 60 * 60 * 1000),
  }

  await clearReceiveHistoryEntries({ now })
  await appendReceiveHistoryEntry(expired, { now })
  await appendReceiveHistoryEntry(first, { now })
  await appendReceiveHistoryEntry(second, { now })

  const entries = await listReceiveHistoryEntries({ now })
  assert.equal(entries.length, 2)
  assert.deepEqual(
    entries.map(entry => entry.id),
    ['entry-2', 'entry-1'],
  )
})

test('clearReceiveHistoryEntries removes all inbox rows', async () => {
  const {
    appendReceiveHistoryEntry,
    listReceiveHistoryEntries,
    clearReceiveHistoryEntries,
  } = await import('../lib/receive-history-storage.ts')

  const entry = {
    id: 'entry-2',
    offerId: 'offer-2',
    deviceId: null,
    deviceName: 'Bob PC',
    timestamp: Date.now(),
    outcome: 'rejected',
    primaryFileName: 'installer.dmg',
    fileType: 'application/x-apple-diskimage',
    failureReason: null,
    summary: {
      fileCount: 1,
      totalSize: 2048,
      sampleFiles: [{ name: 'installer.dmg', size: 2048, type: 'application/x-apple-diskimage' }],
      riskFlags: ['executable'],
      requiresSecondaryConfirmation: true,
      executableFileName: 'installer.dmg',
    },
  }

  await appendReceiveHistoryEntry(entry)
  await clearReceiveHistoryEntries()

  const entries = await listReceiveHistoryEntries()
  assert.deepEqual(entries, [])
})

test('receive history storage uses indexedDB path when available', async () => {
  const originalIndexedDb = globalThis.indexedDB
  globalThis.indexedDB = createFakeIndexedDb()

  try {
    const {
      appendReceiveHistoryEntry,
      listReceiveHistoryEntries,
      clearReceiveHistoryEntries,
    } = await import('../lib/receive-history-storage.ts')

    const now = Date.now()
    const older = {
      id: 'entry-db-1',
      offerId: 'offer-db-1',
      deviceId: 'device-db-1',
      deviceName: 'Carol Air',
      timestamp: now - 500,
      outcome: 'completed',
      primaryFileName: 'report.pdf',
      fileType: 'application/pdf',
      failureReason: null,
      summary: {
        fileCount: 1,
        totalSize: 4096,
        sampleFiles: [{ name: 'report.pdf', size: 4096, type: 'application/pdf' }],
        riskFlags: [],
        requiresSecondaryConfirmation: false,
        executableFileName: null,
      },
    }
    const newer = {
      ...older,
      id: 'entry-db-2',
      offerId: 'offer-db-2',
      timestamp: now - 50,
      primaryFileName: 'report-2.pdf',
      summary: {
        ...older.summary,
        sampleFiles: [{ name: 'report-2.pdf', size: 4096, type: 'application/pdf' }],
      },
    }

    await clearReceiveHistoryEntries({ now })
    await appendReceiveHistoryEntry(older, { now })
    await appendReceiveHistoryEntry(newer, { now })

    const entries = await listReceiveHistoryEntries({ now })
    assert.deepEqual(
      entries.map(entry => entry.id),
      ['entry-db-2', 'entry-db-1'],
    )

    await clearReceiveHistoryEntries({ now })
    assert.deepEqual(await listReceiveHistoryEntries({ now }), [])
  }
  finally {
    globalThis.indexedDB = originalIndexedDb
  }
})

test('listReceiveHistoryEntries returns empty array when indexedDB read fails', async () => {
  const originalIndexedDb = globalThis.indexedDB
  globalThis.indexedDB = {
    open() {
      const request = createRequest()
      queueFailure(request, new Error('boom'))
      return request
    },
  }

  try {
    const { listReceiveHistoryEntries } = await import('../lib/receive-history-storage.ts')
    assert.deepEqual(await listReceiveHistoryEntries(), [])
  }
  finally {
    globalThis.indexedDB = originalIndexedDb
  }
})
