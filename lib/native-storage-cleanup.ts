import type { Directory } from '@capacitor/filesystem'
import type { NativeFilesystemApi } from './native-receive-storage'
import { Filesystem } from '@capacitor/filesystem'
import { RECEIVED_DIRECTORY, STAGING_DIRECTORY } from './native-receive-storage'

/**
 * 私有暂存清理。
 *
 * 只删除可安全重建的临时数据：
 * - 中断传输留下的 `*.part` 分片；
 * - 超过保留期的分享收件目录内容。
 *
 * 不删除已完成接收的文件：那是用户尚未导出的内容，静默删除等于数据丢失。
 * 用户可见的删除与容量管理属于后续步骤。
 */
export const INBOX_DIRECTORY = 'toss-inbox'
export const INBOX_RETENTION_MS = 24 * 60 * 60 * 1000
const PART_FILE_PATTERN = /\.part$/

export interface CleanupResult {
  inboxRemoved: number
  partRemoved: number
}

export interface CleanupFilesystemApi extends NativeFilesystemApi {
  readdir: (options: { path: string, directory: Directory }) => Promise<{ files: Array<{ name: string, mtime?: number, type?: string }> }>
  rmdir: (options: { path: string, directory: Directory, recursive: boolean }) => Promise<void>
}

/**
 * 列出目录；目录不存在时返回空列表而不是抛错。
 */
async function listDirectory(
  filesystem: CleanupFilesystemApi,
  path: string,
): Promise<Array<{ name: string, mtime?: number, type?: string }>> {
  try {
    const result = await filesystem.readdir({ path, directory: STAGING_DIRECTORY })
    return result.files ?? []
  }
  catch {
    return []
  }
}

export async function cleanupNativeStorage(
  options: {
    filesystem?: CleanupFilesystemApi
    now?: number
    inboxRetentionMs?: number
  } = {},
): Promise<CleanupResult> {
  const filesystem = (options.filesystem ?? Filesystem) as CleanupFilesystemApi
  const now = options.now ?? Date.now()
  const retention = options.inboxRetentionMs ?? INBOX_RETENTION_MS

  const result: CleanupResult = { inboxRemoved: 0, partRemoved: 0 }

  // 1. 中断传输的分片：进程被杀或取消后可能残留，直接清除。
  const receivedEntries = await listDirectory(filesystem, RECEIVED_DIRECTORY)
  for (const entry of receivedEntries) {
    if (!PART_FILE_PATTERN.test(entry.name)) {
      continue
    }

    try {
      await filesystem.deleteFile({
        path: `${RECEIVED_DIRECTORY}/${entry.name}`,
        directory: STAGING_DIRECTORY,
      })
      result.partRemoved += 1
    }
    catch {}
  }

  // 2. 分享收件目录：外部应用分享进来的暂存内容，过期后清理。
  const inboxEntries = await listDirectory(filesystem, INBOX_DIRECTORY)
  for (const entry of inboxEntries) {
    const modified = typeof entry.mtime === 'number' ? entry.mtime : null
    if (modified !== null && now - modified < retention) {
      continue
    }

    try {
      await filesystem.deleteFile({
        path: `${INBOX_DIRECTORY}/${entry.name}`,
        directory: STAGING_DIRECTORY,
      })
      result.inboxRemoved += 1
    }
    catch {}
  }

  return result
}
