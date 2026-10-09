import type {
  IncomingTransferRiskFlag,
  IncomingTransferSampleFile,
  IncomingTransferSummary,
} from './types'

const LARGE_FILE_THRESHOLD = 500 * 1024 * 1024
const BATCH_FILE_THRESHOLD = 10
// 注意：这只是基于扩展名的启发式（发送方可伪造），作用是提醒接收方二次确认，
// 不能作为唯一防线。html/htm/svg 也纳入——它们在磁盘上被双击打开时可在本地执行脚本。
const EXECUTABLE_EXTENSIONS = new Set([
  'app',
  'apk',
  'bat',
  'cmd',
  'com',
  'cpl',
  'dmg',
  'exe',
  'gadget',
  'hta',
  'htm',
  'html',
  'jar',
  'js',
  'jse',
  'lnk',
  'msc',
  'msi',
  'msp',
  'pif',
  'pkg',
  'ps1',
  'run',
  'scr',
  'sh',
  'svg',
  'vbs',
  'wsf',
])

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
