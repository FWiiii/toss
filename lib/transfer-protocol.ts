import type { BinaryFileChunkPayload } from './transfer-chunk'

export const MAX_TRANSFER_TEXT_LENGTH = 256 * 1024
const MAX_PROTOCOL_ID_LENGTH = 128
const MAX_TRANSFER_FILE_NAME_LENGTH = 512

type RawProtocolObject = Record<string, unknown>

export interface EncryptedEnvelopePayload {
  type: 'encrypted'
  encrypted: string
}

export interface KeyExchangePayload {
  type: 'key-exchange'
  publicKey: string
}

export interface TextTransferPayload {
  type: 'text'
  content: string
}

export interface FileStartPayload {
  type: 'file-start'
  fileType: string
  name: string
  size: number
  itemId?: string
  offset?: number
  resume?: boolean
}

export interface FileEndPayload {
  type: 'file-end'
  itemId?: string
}

export interface FileCancelPayload {
  type: 'file-cancel'
  itemId?: string
}

export interface RoomDissolvedPayload {
  type: 'room-dissolved'
}

export interface PingPayload {
  type: 'ping' | 'pong'
  id: string
}

export type TransferPayload
  = | TextTransferPayload
    | FileStartPayload
    | FileEndPayload
    | FileCancelPayload
    | RoomDissolvedPayload
    | PingPayload

export type RawIncomingPeerPayload
  = | BinaryFileChunkPayload
    | EncryptedEnvelopePayload
    | KeyExchangePayload
    | TransferPayload

function isPlainObject(value: unknown): value is RawProtocolObject {
  return typeof value === 'object' && value !== null
}

function isValidBoundedString(value: unknown, maxLength = MAX_PROTOCOL_ID_LENGTH): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
}

function isValidOffset(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0
}

function isValidBinaryPayload(value: unknown): value is ArrayBuffer | ArrayBufferView {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value)
}

function toOwnedArrayBuffer(value: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value
  }

  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer
}

export function validateIncomingTransferPayload(data: unknown): TransferPayload | null {
  if (!isPlainObject(data) || typeof data.type !== 'string') {
    return null
  }

  switch (data.type) {
    case 'text':
      if (typeof data.content !== 'string' || data.content.length > MAX_TRANSFER_TEXT_LENGTH) {
        return null
      }
      return { type: 'text', content: data.content }

    case 'file-start': {
      if (!isValidBoundedString(data.name, MAX_TRANSFER_FILE_NAME_LENGTH) || typeof data.size !== 'number' || !Number.isFinite(data.size) || data.size < 0) {
        return null
      }
      const size = Math.trunc(data.size)
      if (data.fileType !== undefined && typeof data.fileType !== 'string') {
        return null
      }
      if (data.itemId !== undefined && !isValidBoundedString(data.itemId)) {
        return null
      }
      if (data.offset !== undefined && !isValidOffset(data.offset)) {
        return null
      }
      if (data.resume !== undefined && typeof data.resume !== 'boolean') {
        return null
      }
      return {
        type: 'file-start',
        fileType: typeof data.fileType === 'string' ? data.fileType : '',
        name: data.name,
        size,
        itemId: typeof data.itemId === 'string' ? data.itemId : undefined,
        offset: typeof data.offset === 'number' ? Math.trunc(data.offset) : undefined,
        resume: typeof data.resume === 'boolean' ? data.resume : undefined,
      }
    }

    case 'file-end':
    case 'file-cancel':
      if (data.itemId !== undefined && !isValidBoundedString(data.itemId)) {
        return null
      }
      return {
        type: data.type,
        itemId: typeof data.itemId === 'string' ? data.itemId : undefined,
      }

    case 'room-dissolved':
      return { type: 'room-dissolved' }

    case 'ping':
    case 'pong':
      if (!isValidBoundedString(data.id)) {
        return null
      }
      return { type: data.type, id: data.id }

    default:
      return null
  }
}

export function validateIncomingRawPeerPayload(data: unknown): RawIncomingPeerPayload | null {
  const transferPayload = validateIncomingTransferPayload(data)
  if (transferPayload) {
    return transferPayload
  }

  if (!isPlainObject(data) || typeof data.type !== 'string') {
    return null
  }

  switch (data.type) {
    case 'encrypted':
      if (!isValidBoundedString(data.encrypted, MAX_TRANSFER_TEXT_LENGTH * 2)) {
        return null
      }
      return {
        type: 'encrypted',
        encrypted: data.encrypted,
      }

    case 'key-exchange':
      if (!isValidBoundedString(data.publicKey, 4096)) {
        return null
      }
      return {
        type: 'key-exchange',
        publicKey: data.publicKey,
      }

    case 'file-chunk': {
      if (!isValidBoundedString(data.itemId) || !isValidOffset(data.offset) || !isValidBinaryPayload(data.bytes)) {
        return null
      }
      if (data.encrypted !== undefined && typeof data.encrypted !== 'boolean') {
        return null
      }
      if (typeof data.offset !== 'number') {
        return null
      }
      const offset = Math.trunc(data.offset)
      const bytes = data.bytes
      return {
        type: 'file-chunk',
        itemId: data.itemId,
        offset,
        bytes: toOwnedArrayBuffer(bytes),
        encrypted: data.encrypted === true,
      }
    }

    default:
      return null
  }
}
