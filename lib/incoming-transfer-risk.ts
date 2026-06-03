import type {
  IncomingTransferRiskFlag,
  IncomingTransferSampleFile,
  IncomingTransferSummary,
} from './types'

const LARGE_FILE_THRESHOLD = 500 * 1024 * 1024
const BATCH_FILE_THRESHOLD = 10
const EXECUTABLE_EXTENSIONS = new Set(['app', 'bat', 'cmd', 'dmg', 'exe', 'msi', 'pkg', 'run', 'sh'])

export function buildIncomingTransferSummary({ files }: { files: IncomingTransferSampleFile[] }): IncomingTransferSummary {
  const sampleFiles = files.slice(0, 3)
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  const executableFile = files.find((file) => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    return EXECUTABLE_EXTENSIONS.has(extension)
  })
  const riskFlags: IncomingTransferRiskFlag[] = []

  if (executableFile) riskFlags.push('executable')
  if (files.some(file => file.size >= LARGE_FILE_THRESHOLD)) riskFlags.push('large')
  if (files.length >= BATCH_FILE_THRESHOLD) riskFlags.push('batch')

  return {
    fileCount: files.length,
    totalSize,
    sampleFiles,
    riskFlags,
    requiresSecondaryConfirmation: Boolean(executableFile),
    executableFileName: executableFile?.name ?? null,
  }
}
