export interface PendingTransferFile {
  id: string
  name: string
  size: number
  type: string
  resolveFile: () => Promise<File>
}

interface RemotePendingTransferFileInput {
  id: string
  name: string
  size: number
  type: string
  resolveFile: () => Promise<File>
}

interface StoredPendingTransferFileInput {
  data: string
  name: string
  size: number
  type: string
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `file-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function base64ToPendingFile(base64: string, name: string, type: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new File([bytes], name, { type })
}

export function createLocalPendingTransferFile(file: File): PendingTransferFile {
  return {
    id: generateId(),
    name: file.name,
    resolveFile: async () => file,
    size: file.size,
    type: file.type,
  }
}

export function createRemotePendingTransferFile(input: RemotePendingTransferFileInput): PendingTransferFile {
  return {
    ...input,
  }
}

export function createStoredPendingTransferFile(
  input: StoredPendingTransferFileInput,
  decodeFile: (base64: string, name: string, type: string) => File = base64ToPendingFile,
): PendingTransferFile {
  return {
    id: generateId(),
    name: input.name,
    resolveFile: async () => decodeFile(input.data, input.name, input.type),
    size: input.size,
    type: input.type,
  }
}

export function isPendingTransferFile(value: File | PendingTransferFile): value is PendingTransferFile {
  return !(value instanceof File)
}

export async function resolvePendingTransferFile(file: File | PendingTransferFile): Promise<File> {
  if (!isPendingTransferFile(file)) {
    return file
  }

  return await file.resolveFile()
}
