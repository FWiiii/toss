import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const SHARE_PAYLOAD_TTL_MS = 15 * 60 * 1000
export const SHARE_STORAGE_ROOT = join(tmpdir(), 'toss-share-target')

interface ShareStorageOptions {
  now?: number
  rootDir?: string
}

export interface SharePayloadFileInput {
  data: Uint8Array
  name: string
  type: string
}

export interface PersistSharePayloadInput {
  files: SharePayloadFileInput[]
  shareId: string
  text: string
  title: string
  url: string
}

export interface SharePayloadManifestFile {
  fileId: string
  name: string
  size: number
  type: string
}

export interface SharePayloadManifest {
  files: SharePayloadManifestFile[]
  text: string
  timestamp: number
  title: string
  url: string
}

export interface SharePayloadFile extends SharePayloadManifestFile {
  data: Uint8Array
}

function getRootDir(rootDir?: string) {
  return rootDir ?? SHARE_STORAGE_ROOT
}

function getShareDir(shareId: string, rootDir?: string) {
  return join(getRootDir(rootDir), shareId)
}

function getManifestPath(shareId: string, rootDir?: string) {
  return join(getShareDir(shareId, rootDir), 'manifest.json')
}

function getFilesDir(shareId: string, rootDir?: string) {
  return join(getShareDir(shareId, rootDir), 'files')
}

function getFilePath(shareId: string, fileId: string, rootDir?: string) {
  return join(getFilesDir(shareId, rootDir), fileId)
}

function isExpired(manifest: SharePayloadManifest, now: number) {
  return now - manifest.timestamp > SHARE_PAYLOAD_TTL_MS
}

async function ensureRootDir(rootDir?: string) {
  await mkdir(getRootDir(rootDir), { recursive: true })
}

async function readManifestInternal(shareId: string, options: ShareStorageOptions = {}) {
  try {
    const manifestRaw = await readFile(getManifestPath(shareId, options.rootDir), 'utf8')
    const manifest = JSON.parse(manifestRaw) as SharePayloadManifest
    const now = options.now ?? Date.now()

    if (isExpired(manifest, now)) {
      await deleteSharePayload(shareId, options)
      return null
    }

    return manifest
  }
  catch {
    return null
  }
}

export async function persistSharePayload(
  input: PersistSharePayloadInput,
  options: ShareStorageOptions = {},
) {
  const now = options.now ?? Date.now()
  const rootDir = getRootDir(options.rootDir)
  const shareDir = getShareDir(input.shareId, rootDir)

  await cleanupExpiredSharePayloads({ now, rootDir })
  await rm(shareDir, { force: true, recursive: true })
  await mkdir(getFilesDir(input.shareId, rootDir), { recursive: true })

  const manifest: SharePayloadManifest = {
    files: [],
    text: input.text,
    timestamp: now,
    title: input.title,
    url: input.url,
  }

  for (const file of input.files) {
    const fileId = randomUUID()

    await writeFile(getFilePath(input.shareId, fileId, rootDir), file.data)
    manifest.files.push({
      fileId,
      name: file.name,
      size: file.data.byteLength,
      type: file.type,
    })
  }

  await writeFile(getManifestPath(input.shareId, rootDir), JSON.stringify(manifest))
}

export async function readSharePayloadManifest(
  shareId: string,
  options: ShareStorageOptions = {},
) {
  return readManifestInternal(shareId, options)
}

export async function readSharePayloadFile(
  shareId: string,
  fileId: string,
  options: ShareStorageOptions = {},
): Promise<SharePayloadFile | null> {
  const manifest = await readManifestInternal(shareId, options)
  if (!manifest) {
    return null
  }

  const fileMeta = manifest.files.find(file => file.fileId === fileId)
  if (!fileMeta) {
    return null
  }

  try {
    const data = new Uint8Array(await readFile(getFilePath(shareId, fileId, options.rootDir)))

    return {
      ...fileMeta,
      data,
    }
  }
  catch {
    return null
  }
}

export async function deleteSharePayload(
  shareId: string,
  options: ShareStorageOptions = {},
) {
  await rm(getShareDir(shareId, options.rootDir), { force: true, recursive: true })
}

export async function cleanupExpiredSharePayloads(options: ShareStorageOptions = {}) {
  const rootDir = getRootDir(options.rootDir)
  const now = options.now ?? Date.now()

  await ensureRootDir(rootDir)

  const entries = await readdir(rootDir, { withFileTypes: true })
  await Promise.all(
    entries
      .filter(entry => entry.isDirectory())
      .map(async (entry) => {
        const shareDir = join(rootDir, entry.name)
        const manifestPath = join(shareDir, 'manifest.json')

        try {
          const manifestRaw = await readFile(manifestPath, 'utf8')
          const manifest = JSON.parse(manifestRaw) as SharePayloadManifest

          if (isExpired(manifest, now)) {
            await rm(shareDir, { force: true, recursive: true })
          }
        }
        catch {
          await rm(shareDir, { force: true, recursive: true })
        }
      }),
  )
}
