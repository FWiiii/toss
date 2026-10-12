import type { FinalizedReceiveFile, NativeReceiveFile, ReceiveStorageHandle, ReceiveStorageOptions } from './receive-storage'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { registerNativeReceiveStorage } from './receive-storage'

/**
 * 原生接收存储：收到的文件按块写入 App 私有目录，WebView 只保留
 * 单块大小的数据，不把整文件聚合成 Blob。
 *
 * 暂存目录必须是用户不可见的私有位置，否则文件会在用户尚未确认保存时
 * 就出现在系统「文件」App 中。iOS 的 `Directory.Data` 实际是 Documents
 * 目录（会被文件共享暴露），因此这里使用 Library：iOS 为 Library，
 * Android 为应用内部 files 目录。
 */
export const RECEIVED_DIRECTORY = 'toss-received'
export const STAGING_DIRECTORY = Directory.Library

const MAX_FILE_NAME_LENGTH = 128
// 控制字符与文件系统保留字符：出现在对端文件名中时替换为下划线。
const UNSAFE_FILE_NAME_PATTERN = /[\p{Cc}<>:"|?*]/gu
const PATH_SEPARATOR_PATTERN = /[\\/]/
const LEADING_DOTS_PATTERN = /^\.+/

export interface NativeFilesystemApi {
  appendFile: (options: { path: string, directory: Directory, data: string }) => Promise<void>
  writeFile: (options: { path: string, directory: Directory, data: string, recursive: boolean }) => Promise<unknown>
  deleteFile: (options: { path: string, directory: Directory }) => Promise<void>
  rename: (options: { from: string, to: string, directory: Directory }) => Promise<void>
  getUri: (options: { path: string, directory: Directory }) => Promise<{ uri: string }>
  stat: (options: { path: string, directory: Directory }) => Promise<unknown>
}

interface NativeReceiveStorageOptions extends ReceiveStorageOptions {
  convertFileSrc?: (uri: string) => string
  filesystem?: NativeFilesystemApi
}

/**
 * 只保留最后一个路径段并去掉控制字符，避免对端文件名造成路径穿越或非法路径。
 */
export function sanitizeReceivedFileName(name: string): string {
  const segments = name.split(PATH_SEPARATOR_PATTERN)
  const base = segments.at(-1) ?? ''
  const cleaned = base
    .replace(UNSAFE_FILE_NAME_PATTERN, '_')
    .replace(LEADING_DOTS_PATTERN, '')
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH)

  return cleaned.length > 0 ? cleaned : 'received-file'
}

async function resolveAvailableName(
  filesystem: NativeFilesystemApi,
  fileName: string,
): Promise<string> {
  const dotIndex = fileName.lastIndexOf('.')
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : ''

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? fileName : `${stem} (${attempt})${extension}`
    try {
      await filesystem.stat({ path: `${RECEIVED_DIRECTORY}/${candidate}`, directory: STAGING_DIRECTORY })
    }
    catch {
      return candidate
    }
  }

  return `${stem} (${Date.now()})${extension}`
}

export async function createNativeReceiveStorage(
  options: NativeReceiveStorageOptions,
): Promise<ReceiveStorageHandle> {
  const filesystem = options.filesystem ?? Filesystem
  const convertFileSrc = options.convertFileSrc ?? Capacitor.convertFileSrc
  const partPath = `${RECEIVED_DIRECTORY}/${options.transferId}.part`
  const safeName = sanitizeReceivedFileName(options.fileName)
  const mimeType = options.mimeType || 'application/octet-stream'

  let index = 0
  let bytesWritten = 0
  let closed = false

  const removePartFile = async () => {
    try {
      await filesystem.deleteFile({ path: partPath, directory: STAGING_DIRECTORY })
    }
    catch {}
  }

  const abort = async () => {
    if (closed) {
      return
    }
    closed = true
    await removePartFile()
  }

  const appendChunk = async (chunk: Uint8Array) => {
    if (closed) {
      throw new Error('Receive storage is already closed')
    }

    // 单块 Base64 桥接：块上限由 FILE_CHUNK_MAX_SIZE 约束，不会整档转换。
    const data = bytesToBase64(chunk)

    if (index === 0) {
      await filesystem.writeFile({
        path: partPath,
        directory: STAGING_DIRECTORY,
        data,
        recursive: true,
      })
    }
    else {
      await filesystem.appendFile({
        path: partPath,
        directory: STAGING_DIRECTORY,
        data,
      })
    }

    index += 1
    bytesWritten += chunk.byteLength
  }

  const finalize = async (): Promise<FinalizedReceiveFile> => {
    if (closed) {
      throw new Error('Receive storage is already closed')
    }
    closed = true

    if (index === 0) {
      throw new Error('No data was written for this transfer')
    }

    const finalName = await resolveAvailableName(filesystem, safeName)
    const finalPath = `${RECEIVED_DIRECTORY}/${finalName}`

    try {
      await filesystem.rename({
        from: partPath,
        to: finalPath,
        directory: STAGING_DIRECTORY,
      })
    }
    catch (error) {
      await removePartFile()
      throw error
    }

    const { uri } = await filesystem.getUri({
      path: finalPath,
      directory: STAGING_DIRECTORY,
    })

    const native: NativeReceiveFile = {
      mimeType,
      name: finalName,
      path: finalPath,
      size: bytesWritten,
      src: convertFileSrc(uri),
      uri,
    }

    return {
      kind: 'native',
      native,
    }
  }

  return {
    abort,
    appendChunk,
    finalize,
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step))
  }
  return btoa(binary)
}

export function registerNativeFileStorage() {
  registerNativeReceiveStorage(createNativeReceiveStorage)
}
