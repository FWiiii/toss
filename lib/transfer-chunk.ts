export interface BinaryFileChunkPayload {
  type: 'file-chunk'
  itemId: string
  offset: number
  bytes: ArrayBuffer
  encrypted?: boolean
}

function cloneArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer
  }

  const owned = new Uint8Array(bytes.byteLength)
  owned.set(bytes)
  return owned.buffer
}

export function createBinaryFileChunkPayload(input: {
  bytes: Uint8Array
  encrypted?: boolean
  itemId: string
  offset: number
}): BinaryFileChunkPayload {
  return {
    bytes: cloneArrayBuffer(input.bytes),
    encrypted: input.encrypted,
    itemId: input.itemId,
    offset: input.offset,
    type: 'file-chunk',
  }
}

export function readBinaryChunkPayload(payload: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload)
  }

  return new Uint8Array(
    payload.buffer.slice(
      payload.byteOffset,
      payload.byteOffset + payload.byteLength,
    ),
  )
}
