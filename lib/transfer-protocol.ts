import type { BinaryFileChunkPayload } from './transfer-chunk'
import type { IncomingTransferRiskFlag } from './types'
import { FILE_CHUNK_MAX_SIZE } from './peer-config'

export const MAX_TRANSFER_TEXT_LENGTH = 256 * 1024
const MAX_PROTOCOL_ID_LENGTH = 128
const MAX_TRANSFER_FILE_NAME_LENGTH = 512
const MAX_DEVICE_NAME_LENGTH = 64

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
  itemId: string
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

export interface DeviceIntroPayload {
  type: 'device-intro'
  deviceId: string
  deviceName: string
}

export interface FileOfferSummarySample {
  name: string
  size: number
  type: string
}

export interface FileOfferSummary {
  fileCount: number
  totalSize: number
  sampleFiles: FileOfferSummarySample[]
  riskFlags?: IncomingTransferRiskFlag[]
  requiresSecondaryConfirmation?: boolean
  executableFileName?: string | null
}

export interface FileOfferPayload {
  type: 'file-offer'
  offerId: string
  fileType: string
  name: string
  size: number
  summary?: FileOfferSummary
}

export interface FileOfferResponsePayload {
  type: 'file-offer-response'
  offerId: string
  accepted: boolean
}

export type TransferPayload
  = | TextTransferPayload
    | FileStartPayload
    | FileEndPayload
    | FileCancelPayload
    | RoomDissolvedPayload
    | PingPayload
    | DeviceIntroPayload
    | FileOfferPayload
    | FileOfferResponsePayload

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

function isValidOfferSummary(summary: unknown): summary is FileOfferSummary {
  if (!isPlainObject(summary)) {
    return false
  }

  const fileCount = summary.fileCount
  if (typeof fileCount !== 'number' || !Number.isInteger(fileCount) || fileCount <= 0) {
    return false
  }

  const totalSize = summary.totalSize
  if (typeof totalSize !== 'number' || !Number.isFinite(totalSize) || totalSize < 0) {
    return false
  }

  const sampleFiles = summary.sampleFiles
  if (!Array.isArray(sampleFiles) || sampleFiles.length > 3) {
    return false
  }

  if (summary.riskFlags !== undefined) {
    if (!Array.isArray(summary.riskFlags)) {
      return false
    }
    if (!summary.riskFlags.every(flag => flag === 'batch' || flag === 'executable' || flag === 'large')) {
      return false
    }
  }

  if (summary.requiresSecondaryConfirmation !== undefined && typeof summary.requiresSecondaryConfirmation !== 'boolean') {
    return false
  }

  if (
    summary.executableFileName !== undefined
    && summary.executableFileName !== null
    && !isValidBoundedString(summary.executableFileName, MAX_TRANSFER_FILE_NAME_LENGTH)
  ) {
    return false
  }

  return sampleFiles.every(file =>
    isPlainObject(file)
    && isValidBoundedString(file.name, MAX_TRANSFER_FILE_NAME_LENGTH)
    && typeof file.type === 'string'
    && typeof file.size === 'number'
    && Number.isFinite(file.size)
    && file.size >= 0,
  )
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
      if (!isValidBoundedString(data.itemId)) {
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
        itemId: data.itemId,
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

    case 'device-intro':
      if (!isValidBoundedString(data.deviceId) || !isValidBoundedString(data.deviceName, MAX_DEVICE_NAME_LENGTH)) {
        return null
      }
      return {
        type: 'device-intro',
        deviceId: data.deviceId,
        deviceName: data.deviceName,
      }

    case 'file-offer':
      if (!isValidBoundedString(data.offerId) || !isValidBoundedString(data.name, MAX_TRANSFER_FILE_NAME_LENGTH) || typeof data.size !== 'number' || !Number.isFinite(data.size) || data.size < 0) {
        return null
      }
      if (data.fileType !== undefined && typeof data.fileType !== 'string') {
        return null
      }
      if (data.summary !== undefined && !isValidOfferSummary(data.summary)) {
        return null
      }
      return {
        type: 'file-offer',
        offerId: data.offerId,
        name: data.name,
        fileType: typeof data.fileType === 'string' ? data.fileType : '',
        size: Math.trunc(data.size),
        summary: data.summary,
      }

    case 'file-offer-response':
      if (!isValidBoundedString(data.offerId) || typeof data.accepted !== 'boolean') {
        return null
      }
      return {
        type: 'file-offer-response',
        offerId: data.offerId,
        accepted: data.accepted,
      }

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
      // 单块大小上限：发送端最大只发 FILE_CHUNK_MAX_SIZE，超限的块视为恶意或损坏，直接丢弃，
      // 防止对端一次投递超大块耗尽内存（toOwnedArrayBuffer 还会再复制一份）。
      if (data.bytes.byteLength > FILE_CHUNK_MAX_SIZE) {
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

export function getFileOfferResponseKey(peerId: string, offerId: string) {
  return `${peerId}:${offerId}`
}

/**
 * 与某个对端之间的握手状态
 *
 * - `pending`: 已发起 ECDH 密钥交换，等待对端公钥
 * - `ready`: 密钥交换完成，会话加密器就绪
 * - `unknown`: 未跟踪到握手状态（兼容保留，正常流程中不应出现）
 */
export type PeerHandshakeState = 'unknown' | 'pending' | 'ready'

/**
 * 入站消息门控：决定一个外层消息是否允许进入处理流程。
 *
 * 安全模型：发送端在加密器就绪后只会发送 `encrypted` 信封（控制消息）、
 * 逐块加密的 `file-chunk`（`encrypted: true`）、`key-exchange` 与明文心跳。
 * 因此一旦握手完成（`ready`），任何明文控制消息都只可能来自攻击者或
 * 被篡改的流量，必须丢弃；握手进行中（`pending`）时，对端尚无合法理由
 * 发送控制消息（device-intro 等都在握手完成后才发出），同样丢弃。
 *
 * `key-exchange` / `ping` / `pong` 在任何状态下放行：前者是握手本身，
 * 后两者是无敏感内容的心跳（pong 的处理仍在下游按是否加密分别对待）。
 * `encrypted` 信封始终放行——没有解密器时下游解密会自然失败并丢弃。
 */
export function isInboundPeerPayloadAllowed(
  handshake: PeerHandshakeState,
  outerType: string,
  chunkEncrypted = false,
): boolean {
  if (outerType === 'key-exchange' || outerType === 'ping' || outerType === 'pong') {
    return true
  }

  if (outerType === 'encrypted') {
    return true
  }

  if (outerType === 'file-chunk') {
    return handshake === 'ready' && chunkEncrypted
  }

  // 其余明文控制消息（text / device-intro / file-offer / file-start / …）：
  // 仅在握手尚未开始的兼容状态下接受，握手进行中或已完成时一律拒绝，
  // 防止未做密钥交换的攻击者冒充受信设备触发自动接受等逻辑。
  return handshake === 'unknown'
}
