import type {
  IncomingTransferRiskFlag,
  IncomingTransferSampleFile,
  IncomingTransferSummary,
} from './types'

const LARGE_FILE_THRESHOLD = 500 * 1024 * 1024
const BATCH_FILE_THRESHOLD = 10
const EXECUTABLE_EXTENSIONS = new Set(['app', 'bat', 'cmd', 'dmg', 'exe', 'msi', 'pkg', 'run', 'sh'])

interface BuildIncomingTransferSummaryOptions {
  files: IncomingTransferSampleFile[]
  declaredFileCount?: number
  declaredTotalSize?: number
}

export function buildIncomingTransferSummary({
  files,
  declaredFileCount,
  declaredTotalSize,
}: BuildIncomingTransferSummaryOptions): IncomingTransferSummary {
  const sampleFiles = files.slice(0, 3)
  const observedFileCount = files.length
  const observedTotalSize = files.reduce((sum, file) => sum + file.size, 0)
  const safeDeclaredFileCount = Number.isInteger(declaredFileCount) && Number(declaredFileCount) > 0
    ? Number(declaredFileCount)
    : null
  const safeDeclaredTotalSize = typeof declaredTotalSize === 'number' && Number.isFinite(declaredTotalSize) && declaredTotalSize >= 0
    ? declaredTotalSize
    : null
  const fileCount = safeDeclaredFileCount !== null
    ? Math.max(observedFileCount, safeDeclaredFileCount)
    : observedFileCount
  const totalSize = safeDeclaredTotalSize !== null
    ? Math.max(observedTotalSize, safeDeclaredTotalSize)
    : observedTotalSize
  const executableFile = files.find((file) => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    return EXECUTABLE_EXTENSIONS.has(extension)
  })
  const riskFlags: IncomingTransferRiskFlag[] = []

  if (executableFile) {
    riskFlags.push('executable')
  }
  if (files.some(file => file.size >= LARGE_FILE_THRESHOLD)) {
    riskFlags.push('large')
  }
  if (fileCount >= BATCH_FILE_THRESHOLD) {
    riskFlags.push('batch')
  }

  return {
    fileCount,
    totalSize,
    sampleFiles,
    riskFlags,
    requiresSecondaryConfirmation: Boolean(executableFile),
    executableFileName: executableFile?.name ?? null,
  }
}
