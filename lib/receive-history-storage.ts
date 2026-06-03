import type { ReceiveHistoryEntry } from './types'

const RECEIVE_HISTORY_DB_NAME = 'toss-receive-history-db'
const RECEIVE_HISTORY_STORE = 'receive-history'

export const RECEIVE_HISTORY_RETENTION_MS = 180 * 24 * 60 * 60 * 1000

interface ReceiveHistoryStorageOptions {
  now?: number
}

let fallbackReceiveHistoryEntries: ReceiveHistoryEntry[] = []

function isIndexedDbAvailable() {
  return typeof indexedDB !== 'undefined'
}

function isExpiredEntry(entry: ReceiveHistoryEntry, now: number) {
  return now - entry.timestamp > RECEIVE_HISTORY_RETENTION_MS
}

function sortEntries(entries: ReceiveHistoryEntry[]) {
  return [...entries].sort((left, right) => right.timestamp - left.timestamp)
}

function pruneFallbackEntries(now: number) {
  fallbackReceiveHistoryEntries = fallbackReceiveHistoryEntries.filter(entry => !isExpiredEntry(entry, now))
}

function openReceiveHistoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RECEIVE_HISTORY_DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(RECEIVE_HISTORY_STORE)) {
        db.createObjectStore(RECEIVE_HISTORY_STORE, { keyPath: 'id' })
      }
    }
  })
}

function getAllEntriesFromDb(db: IDBDatabase): Promise<ReceiveHistoryEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECEIVE_HISTORY_STORE, 'readonly')
    const store = tx.objectStore(RECEIVE_HISTORY_STORE)
    const request = store.getAll()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      resolve((request.result as ReceiveHistoryEntry[]) ?? [])
    }
  })
}

function putEntryIntoDb(db: IDBDatabase, entry: ReceiveHistoryEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECEIVE_HISTORY_STORE, 'readwrite')
    const store = tx.objectStore(RECEIVE_HISTORY_STORE)
    const request = store.put(entry)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function deleteEntryFromDb(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECEIVE_HISTORY_STORE, 'readwrite')
    const store = tx.objectStore(RECEIVE_HISTORY_STORE)
    const request = store.delete(id)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function clearReceiveHistoryStore(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECEIVE_HISTORY_STORE, 'readwrite')
    const store = tx.objectStore(RECEIVE_HISTORY_STORE)
    const request = store.clear()
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function pruneExpiredReceiveHistoryEntries(db: IDBDatabase, now: number) {
  const entries = await getAllEntriesFromDb(db)
  const expiredEntries = entries.filter(entry => isExpiredEntry(entry, now))

  await Promise.all(expiredEntries.map(entry => deleteEntryFromDb(db, entry.id)))
}

export async function appendReceiveHistoryEntry(
  entry: ReceiveHistoryEntry,
  options: ReceiveHistoryStorageOptions = {},
) {
  const now = options.now ?? Date.now()

  if (!isIndexedDbAvailable()) {
    pruneFallbackEntries(now)
    fallbackReceiveHistoryEntries = [
      ...fallbackReceiveHistoryEntries.filter(item => item.id !== entry.id),
      entry,
    ]
    return
  }

  const db = await openReceiveHistoryDb()
  await pruneExpiredReceiveHistoryEntries(db, now)
  await putEntryIntoDb(db, entry)
}

// History reads back a UI surface, so we intentionally degrade to [] if storage is
// unavailable or the browser refuses the request. Mutations keep surfacing errors so
// the caller can decide whether to retry, log, or show feedback.
export async function listReceiveHistoryEntries(options: ReceiveHistoryStorageOptions = {}) {
  const now = options.now ?? Date.now()

  try {
    if (!isIndexedDbAvailable()) {
      pruneFallbackEntries(now)
      return sortEntries(fallbackReceiveHistoryEntries)
    }

    const db = await openReceiveHistoryDb()
    await pruneExpiredReceiveHistoryEntries(db, now)
    return sortEntries(await getAllEntriesFromDb(db))
  }
  catch {
    return []
  }
}

export async function clearReceiveHistoryEntries(options: ReceiveHistoryStorageOptions = {}) {
  const now = options.now ?? Date.now()

  if (!isIndexedDbAvailable()) {
    pruneFallbackEntries(now)
    fallbackReceiveHistoryEntries = []
    return
  }

  const db = await openReceiveHistoryDb()
  await pruneExpiredReceiveHistoryEntries(db, now)
  await clearReceiveHistoryStore(db)
}
