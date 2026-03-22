export interface FinalizedReceiveFile {
  cleanup?: () => Promise<void> | void
  file: File
}

export interface ReceiveStorageHandle {
  abort: () => Promise<void>
  appendChunk: (chunk: Uint8Array) => Promise<void>
  finalize: () => Promise<FinalizedReceiveFile>
}

interface ReceiveStorageOptions {
  fileName: string
  mimeType: string
  transferId: string
}

interface ReceiveChunkRecord {
  data: ArrayBuffer
  index: number
  transferId: string
}

const OPFS_DIRECTORY = 'toss-received'
const RECEIVE_DB_NAME = 'toss-receive-db'
const RECEIVE_STORE_NAME = 'chunks'
const RECEIVE_TRANSFER_INDEX = 'by-transfer-id'

function toOwnedBuffer(chunk: Uint8Array) {
  const owned = new Uint8Array(chunk.byteLength)
  owned.set(chunk)
  return owned.buffer
}

function supportsOPFS() {
  return typeof navigator !== 'undefined'
    && typeof navigator.storage?.getDirectory === 'function'
}

async function openReceiveDatabase(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(RECEIVE_DB_NAME, 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(RECEIVE_STORE_NAME)) {
        const store = db.createObjectStore(RECEIVE_STORE_NAME, {
          autoIncrement: true,
        })
        store.createIndex(RECEIVE_TRANSFER_INDEX, 'transferId', { unique: false })
      }
    }
  })
}

async function deleteIndexedDbTransferChunks(transferId: string) {
  const db = await openReceiveDatabase()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECEIVE_STORE_NAME, 'readwrite')
    const store = tx.objectStore(RECEIVE_STORE_NAME)
    const index = store.index(RECEIVE_TRANSFER_INDEX)
    const request = index.openKeyCursor(IDBKeyRange.only(transferId))

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }

      store.delete(cursor.primaryKey)
      cursor.continue()
    }
  })
}

async function readIndexedDbTransferChunks(transferId: string) {
  const db = await openReceiveDatabase()

  return await new Promise<ReceiveChunkRecord[]>((resolve, reject) => {
    const tx = db.transaction(RECEIVE_STORE_NAME, 'readonly')
    const store = tx.objectStore(RECEIVE_STORE_NAME)
    const index = store.index(RECEIVE_TRANSFER_INDEX)
    const request = index.getAll(IDBKeyRange.only(transferId))

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const records = (request.result as ReceiveChunkRecord[]).toSorted((left, right) => left.index - right.index)
      resolve(records)
    }
  })
}

async function createIndexedDbReceiveStorage(
  options: ReceiveStorageOptions,
): Promise<ReceiveStorageHandle> {
  const db = await openReceiveDatabase()
  let index = 0
  let closed = false

  const appendChunk = async (chunk: Uint8Array) => {
    if (closed) {
      throw new Error('Receive storage is already closed')
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(RECEIVE_STORE_NAME, 'readwrite')
      const store = tx.objectStore(RECEIVE_STORE_NAME)
      const request = store.add({
        data: toOwnedBuffer(chunk),
        index,
        transferId: options.transferId,
      } satisfies ReceiveChunkRecord)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })

    index += 1
  }

  const abort = async () => {
    if (closed) {
      return
    }

    closed = true
    await deleteIndexedDbTransferChunks(options.transferId)
    db.close()
  }

  const finalize = async (): Promise<FinalizedReceiveFile> => {
    if (closed) {
      throw new Error('Receive storage is already closed')
    }

    closed = true
    const records = await readIndexedDbTransferChunks(options.transferId)
    const blob = new Blob(records.map(record => record.data), {
      type: options.mimeType || 'application/octet-stream',
    })
    await deleteIndexedDbTransferChunks(options.transferId)
    db.close()

    return {
      file: new File([blob], options.fileName, {
        type: blob.type || options.mimeType,
      }),
    }
  }

  return {
    abort,
    appendChunk,
    finalize,
  }
}

async function createOpfsReceiveStorage(
  options: ReceiveStorageOptions,
): Promise<ReceiveStorageHandle> {
  const rootHandle = await navigator.storage.getDirectory()
  const directoryHandle = await rootHandle.getDirectoryHandle(OPFS_DIRECTORY, {
    create: true,
  })
  const fileHandle = await directoryHandle.getFileHandle(options.transferId, {
    create: true,
  })
  const writable = await fileHandle.createWritable()
  let closed = false

  const removeEntry = async () => {
    try {
      await directoryHandle.removeEntry(options.transferId)
    }
    catch {}
  }

  const abort = async () => {
    if (closed) {
      return
    }

    closed = true
    try {
      await writable.abort()
    }
    catch {
      try {
        await writable.close()
      }
      catch {}
    }
    await removeEntry()
  }

  const appendChunk = async (chunk: Uint8Array) => {
    if (closed) {
      throw new Error('Receive storage is already closed')
    }

    await writable.write(toOwnedBuffer(chunk))
  }

  const finalize = async (): Promise<FinalizedReceiveFile> => {
    if (closed) {
      throw new Error('Receive storage is already closed')
    }

    closed = true
    await writable.close()
    const file = await fileHandle.getFile()

    return {
      cleanup: removeEntry,
      file: new File([file], options.fileName, {
        type: file.type || options.mimeType,
      }),
    }
  }

  return {
    abort,
    appendChunk,
    finalize,
  }
}

function createInMemoryReceiveStorage(
  options: ReceiveStorageOptions,
): ReceiveStorageHandle {
  let chunks: ArrayBuffer[] = []
  let closed = false

  return {
    async abort() {
      closed = true
      chunks = []
    },

    async appendChunk(chunk: Uint8Array) {
      if (closed) {
        throw new Error('Receive storage is already closed')
      }

      chunks.push(toOwnedBuffer(chunk))
    },

    async finalize() {
      if (closed) {
        throw new Error('Receive storage is already closed')
      }

      closed = true
      const blob = new Blob(chunks, {
        type: options.mimeType || 'application/octet-stream',
      })
      chunks = []

      return {
        file: new File([blob], options.fileName, {
          type: blob.type || options.mimeType,
        }),
      }
    },
  }
}

export async function createReceiveStorage(
  options: ReceiveStorageOptions,
): Promise<ReceiveStorageHandle> {
  if (supportsOPFS()) {
    try {
      return await createOpfsReceiveStorage(options)
    }
    catch {}
  }

  if (typeof indexedDB !== 'undefined') {
    try {
      return await createIndexedDbReceiveStorage(options)
    }
    catch {}
  }

  return createInMemoryReceiveStorage(options)
}
