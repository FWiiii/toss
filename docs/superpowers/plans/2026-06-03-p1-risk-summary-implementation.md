# P1 风险提醒与发送摘要实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 Toss 的接收确认补齐多文件摘要、批量/超大文件提醒，以及可执行文件二次确认和已信任设备保护。

**架构：** 将风险判定与摘要组装抽成独立 helper，避免把规则直接散落在 `transfer-connection` 和 `transfer-panel` 中。协议层为 `file-offer` 增加可选摘要元数据，接收侧在入队时统一生成 `IncomingTransferSummary`，UI 只消费结构化摘要，不直接拼业务规则。已信任设备的自动接收分支必须读取风险结果，确保可执行文件无法绕过二次确认。

**技术栈：** Next.js 16、React 19、TypeScript、Node 内置测试运行器、现有架构测试

---

## 文件结构

**创建：**

- `lib/incoming-transfer-risk.ts`：接收摘要与风险判定 helper，负责扩展名识别、阈值判断、样本文件截断和摘要文案输入。
- `tests/incoming-transfer-risk.test.mjs`：风险规则与摘要输出的单元测试。
- `docs/superpowers/plans/2026-06-03-p1-risk-summary-implementation.md`：本计划文档。

**修改：**

- `lib/types.ts`：新增 `IncomingTransferSummary`、风险标记类型，以及 `IncomingFileOffer` 上的摘要字段。
- `lib/transfer-protocol.ts`：扩展 `file-offer` 协议，允许携带文件数、总大小和样本文件。
- `lib/transfer-data.ts`：发送多文件时预先构造共享摘要，并把同一摘要带入每个 `file-offer`。
- `lib/transfer-connection.ts`：接收 `file-offer` 时生成/校验摘要，命中可执行风险时阻止已信任设备自动接收。
- `lib/transfer-context.tsx`：响应接收确认时支持二次确认状态和摘要展示所需数据。
- `components/transfer-panel.tsx`：把当前单文件确认框改成概览优先摘要 + 风险提醒 + 可执行文件二次确认。
- `tests/transfer-protocol.test.mjs`：补协议解析测试。
- `tests/performance-architecture.test.mjs`：补 UI/保护分支的结构化断言。

---

## 任务 1：锁定风险规则与摘要 helper

**文件：**

- 创建：`tests/incoming-transfer-risk.test.mjs`
- 创建：`lib/incoming-transfer-risk.ts`
- 修改：`lib/types.ts`

- [ ] **步骤 1：先写失败的风险判定测试**

```text
test('buildIncomingTransferSummary marks executable, large, and batch risks', async () => {
  const { buildIncomingTransferSummary } = await import('../lib/incoming-transfer-risk.ts')

  const summary = buildIncomingTransferSummary({
    files: [
      { name: 'RemoteHelper.dmg', size: 600 * 1024 * 1024, type: 'application/x-apple-diskimage' },
      { name: 'notes.txt', size: 128, type: 'text/plain' },
    ],
  })

  assert.equal(summary.fileCount, 2)
  assert.equal(summary.totalSize, 600 * 1024 * 1024 + 128)
  assert.deepEqual(summary.riskFlags, ['executable', 'large'])
  assert.equal(summary.requiresSecondaryConfirmation, true)
})

test('buildIncomingTransferSummary truncates sample files to the first three names', async () => {
  const { buildIncomingTransferSummary } = await import('../lib/incoming-transfer-risk.ts')

  const summary = buildIncomingTransferSummary({
    files: Array.from({ length: 5 }, (_, index) => ({
      name: `photo-${index + 1}.jpg`,
      size: 1024,
      type: 'image/jpeg',
    })),
  })

  assert.equal(summary.fileCount, 5)
  assert.deepEqual(summary.sampleFiles.map(file => file.name), [
    'photo-1.jpg',
    'photo-2.jpg',
    'photo-3.jpg',
  ])
  assert.deepEqual(summary.riskFlags, [])
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`node --import tsx --test tests/incoming-transfer-risk.test.mjs`

预期：FAIL，提示 `buildIncomingTransferSummary` 或 `incoming-transfer-risk.ts` 尚不存在。

- [ ] **步骤 3：实现最小风险判定 helper 与类型**

```text
export type IncomingTransferRiskFlag = 'batch' | 'executable' | 'large'

export interface IncomingTransferSampleFile {
  name: string
  size: number
  type: string
}

export interface IncomingTransferSummary {
  fileCount: number
  totalSize: number
  sampleFiles: IncomingTransferSampleFile[]
  riskFlags: IncomingTransferRiskFlag[]
  requiresSecondaryConfirmation: boolean
  executableFileName: string | null
}

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
```

- [ ] **步骤 4：回填共享类型**

```text
export interface IncomingFileOffer {
  offerId: string
  peerId: string
  deviceId: string | null
  deviceName: string
  fileName: string
  fileType: string
  size: number
  fingerprint: string | null
  requestedAt: number
  summary: IncomingTransferSummary
}
```

- [ ] **步骤 5：重新运行 helper 测试确认通过**

运行：`node --import tsx --test tests/incoming-transfer-risk.test.mjs`

预期：PASS。

- [ ] **步骤 6：提交 helper 基线**

```text
git add lib/incoming-transfer-risk.ts lib/types.ts tests/incoming-transfer-risk.test.mjs
git commit -m "feat(P1 风险): 增加接收摘要与风险判定 helper"
```

## 任务 2：扩展 file-offer 协议并传递多文件摘要

**文件：**

- 修改：`lib/transfer-protocol.ts`
- 修改：`lib/transfer-data.ts`
- 修改：`tests/transfer-protocol.test.mjs`

- [ ] **步骤 1：先写失败的协议测试**

```text
assert.deepEqual(
  validateIncomingTransferPayload({
    type: 'file-offer',
    offerId: 'offer-1',
    name: 'demo.txt',
    fileType: 'text/plain',
    size: 12,
    summary: {
      fileCount: 12,
      totalSize: 842 * 1024 * 1024,
      sampleFiles: [
        { name: 'a.jpg', size: 1, type: 'image/jpeg' },
        { name: 'b.jpg', size: 1, type: 'image/jpeg' },
        { name: 'c.jpg', size: 1, type: 'image/jpeg' },
      ],
    },
  }),
  {
    type: 'file-offer',
    offerId: 'offer-1',
    name: 'demo.txt',
    fileType: 'text/plain',
    size: 12,
    summary: {
      fileCount: 12,
      totalSize: 842 * 1024 * 1024,
      sampleFiles: [
        { name: 'a.jpg', size: 1, type: 'image/jpeg' },
        { name: 'b.jpg', size: 1, type: 'image/jpeg' },
        { name: 'c.jpg', size: 1, type: 'image/jpeg' },
      ],
    },
  },
)
```

- [ ] **步骤 2：运行协议测试确认失败**

运行：`node --import tsx --test tests/transfer-protocol.test.mjs`

预期：FAIL，提示 `summary` 字段不被接受或返回值不匹配。

- [ ] **步骤 3：扩展 `file-offer` payload 结构**

```text
export interface FileOfferPayload {
  type: 'file-offer'
  offerId: string
  fileType: string
  name: string
  size: number
  summary?: {
    fileCount: number
    totalSize: number
    sampleFiles: Array<{ name: string, size: number, type: string }>
  }
}
```

- [ ] **步骤 4：在 `validateIncomingTransferPayload` 中校验可选摘要**

```text
function isValidOfferSummary(summary: unknown) {
  if (!isPlainObject(summary)) return false
  if (!Number.isInteger(summary.fileCount) || summary.fileCount <= 0) return false
  if (typeof summary.totalSize !== 'number' || !Number.isFinite(summary.totalSize) || summary.totalSize < 0) return false
  if (!Array.isArray(summary.sampleFiles) || summary.sampleFiles.length > 3) return false
  return summary.sampleFiles.every(file =>
    isPlainObject(file)
    && isValidBoundedString(file.name, MAX_TRANSFER_FILE_NAME_LENGTH)
    && typeof file.type === 'string'
    && typeof file.size === 'number'
    && Number.isFinite(file.size)
    && file.size >= 0,
  )
}
```

- [ ] **步骤 5：发送多文件时构造共享摘要**

```text
const sendFiles = useCallback(async (files: PendingTransferInput[]) => {
  const resolvedFiles = await Promise.all(files.map(resolvePendingTransferFile))
  const offerSummary = buildOutgoingTransferOfferSummary(resolvedFiles)

  for (const file of resolvedFiles) {
    await sendFile(file, offerSummary)
  }
}, [sendFile])
```

```text
const offered = await sendControlToPeer(peerId, {
  type: 'file-offer',
  offerId: itemId,
  fileType: file.type,
  name: file.name,
  size: totalSize,
  summary: offerSummary,
})
```

- [ ] **步骤 6：复跑协议测试确认通过**

运行：`node --import tsx --test tests/transfer-protocol.test.mjs`

预期：PASS。

- [ ] **步骤 7：提交协议与发送侧改动**

```text
git add lib/transfer-protocol.ts lib/transfer-data.ts tests/transfer-protocol.test.mjs
git commit -m "feat(P1 协议): 为文件 offer 增加发送摘要元数据"
```

## 任务 3：接收侧接入摘要与已信任设备保护

**文件：**

- 修改：`lib/transfer-connection.ts`
- 修改：`lib/transfer-context.tsx`
- 修改：`tests/performance-architecture.test.mjs`

- [ ] **步骤 1：先写失败的架构测试**

```text
test('trusted devices do not auto-accept executable file offers', async () => {
  const receiveSource = await readProjectFile('lib/transfer-connection.ts')

  assert.match(receiveSource, /requiresSecondaryConfirmation/)
  assert.match(receiveSource, /trustedDevicesRef\.current\.has\(trustedDeviceId\)/)
  assert.match(receiveSource, /!offer\.summary\.requiresSecondaryConfirmation/)
})
```

- [ ] **步骤 2：运行架构测试确认失败**

运行：`node --import tsx --test tests/performance-architecture.test.mjs`

预期：FAIL，提示接收分支中尚未出现 `requiresSecondaryConfirmation` 保护。

- [ ] **步骤 3：在接收 `file-offer` 时统一组装摘要**

```text
const summary = buildIncomingTransferSummary({
  files: decryptedData.summary?.sampleFiles?.length
    ? decryptedData.summary.sampleFiles
    : [{ name: decryptedData.name, size: decryptedData.size, type: decryptedData.fileType || '' }],
  declaredFileCount: decryptedData.summary?.fileCount,
  declaredTotalSize: decryptedData.summary?.totalSize,
})

const offer: IncomingFileOffer = {
  offerId: decryptedData.offerId,
  peerId: conn.peer,
  deviceId: trustedDeviceId ?? null,
  deviceName: peerDevice?.deviceName || '对方设备',
  fileName: decryptedData.name,
  fileType: decryptedData.fileType || '',
  size: decryptedData.size,
  fingerprint: encryptionFingerprintsRef.current.get(conn.peer) ?? null,
  requestedAt: Date.now(),
  summary,
}
```

- [ ] **步骤 4：阻止已信任设备绕过可执行文件保护**

```text
const canAutoAccept = trustedDeviceId
  && trustedDevicesRef.current.has(trustedDeviceId)
  && !offer.summary.requiresSecondaryConfirmation

if (canAutoAccept) {
  approvedIncomingFileOffersRef.current.set(decryptedData.offerId, conn.peer)
  ...
}
else {
  pendingIncomingFileOffersRef.current.set(decryptedData.offerId, offer)
  queueIncomingFileOffer?.(offer)
}
```

- [ ] **步骤 5：在 `respondToIncomingFileOffer` 中保留二次确认口子**

```text
respondToIncomingFileOffer: (
  offerId: string,
  accepted: boolean,
  trustDevice?: boolean,
  secondaryConfirmed?: boolean,
) => Promise<void>
```

如果 `offer.summary.requiresSecondaryConfirmation` 为真且未确认，则不得发送 `accepted: true` 的响应。

- [ ] **步骤 6：复跑架构测试确认通过**

运行：`node --import tsx --test tests/performance-architecture.test.mjs`

预期：PASS。

- [ ] **步骤 7：提交接收链路保护**

```text
git add lib/transfer-connection.ts lib/transfer-context.tsx tests/performance-architecture.test.mjs
git commit -m "feat(P1 接收): 增加高风险文件自动接收保护"
```

## 任务 4：更新确认弹窗为概览优先摘要

**文件：**

- 修改：`components/transfer-panel.tsx`
- 修改：`tests/performance-architecture.test.mjs`

- [ ] **步骤 1：先写失败的 UI 结构测试**

```text
test('transfer panel shows summary-first approval states for risky incoming files', async () => {
  const panelSource = await readProjectFile('components/transfer-panel.tsx')

  assert.match(panelSource, /summary\.fileCount/)
  assert.match(panelSource, /summary\.totalSize/)
  assert.match(panelSource, /sampleFiles/)
  assert.match(panelSource, /二次确认|确认后接收/)
  assert.match(panelSource, /批量文件提醒|超大文件提醒|高风险文件确认/)
})
```

- [ ] **步骤 2：运行架构测试确认失败**

运行：`node --import tsx --test tests/performance-architecture.test.mjs`

预期：FAIL，提示确认框仍然只显示 `fileName` / `size` 之类的单文件信息。

- [ ] **步骤 3：在确认框中渲染摘要与风险标签**

```textx
const summary = activeIncomingFileOffer.summary
const isHighRisk = summary.requiresSecondaryConfirmation
const riskFlags = new Set(summary.riskFlags)

<DialogTitle>{isHighRisk ? '高风险文件确认' : '接收文件确认'}</DialogTitle>
<DialogDescription>
  {summary.fileCount > 1
    ? `${activeIncomingFileOffer.deviceName} 想发送 ${summary.fileCount} 个文件`
    : `${activeIncomingFileOffer.deviceName} 想发送 ${activeIncomingFileOffer.fileName}`}
</DialogDescription>
```

- [ ] **步骤 4：加入二次确认勾选与按钮禁用状态**

```textx
const [secondaryConfirmed, setSecondaryConfirmed] = useState(false)

<Button
  disabled={isHighRisk && !secondaryConfirmed}
  onClick={() => {
    void respondToIncomingFileOffer(
      activeIncomingFileOffer.offerId,
      true,
      trustIncomingDevice,
      secondaryConfirmed,
    )
  }}
>
  {isHighRisk ? '确认后接收' : '接受'}
</Button>
```

- [ ] **步骤 5：默认展示前 3 个文件，其余折叠提示**

```textx
{summary.sampleFiles.map(file => (
  <p key={file.name} className="text-xs text-muted-foreground">{file.name}</p>
))}
{summary.fileCount > summary.sampleFiles.length && (
  <p className="text-xs text-muted-foreground">
    其余 {summary.fileCount - summary.sampleFiles.length} 个文件已折叠
  </p>
)}
```

- [ ] **步骤 6：复跑架构测试确认通过**

运行：`node --import tsx --test tests/performance-architecture.test.mjs`

预期：PASS。

- [ ] **步骤 7：提交确认框 UI 更新**

```text
git add components/transfer-panel.tsx tests/performance-architecture.test.mjs
git commit -m "feat(P1 交互): 增加风险提醒与摘要优先确认框"
```

## 任务 5：全量验证并准备切换到 P2

**文件：**

- 修改：`tests/performance-architecture.test.mjs`
- 修改：`tests/incoming-transfer-risk.test.mjs`
- 修改：`tests/transfer-protocol.test.mjs`

- [ ] **步骤 1：补最后一批覆盖项**

至少确认测试包含：

```text
assert.deepEqual(summary.riskFlags, ['batch'])
assert.equal(summary.requiresSecondaryConfirmation, true)
assert.match(panelSource, /其余 .* 个文件已折叠/)
assert.match(receiveSource, /!offer\.summary\.requiresSecondaryConfirmation/)
```

- [ ] **步骤 2：运行针对性测试**

运行：`node --import tsx --test tests/incoming-transfer-risk.test.mjs tests/transfer-protocol.test.mjs tests/performance-architecture.test.mjs`

预期：PASS。

- [ ] **步骤 3：运行全量测试**

运行：`npm test`

预期：PASS，所有测试通过。

- [ ] **步骤 4：运行 lint**

运行：`npm run lint`

预期：PASS，无 error。

- [ ] **步骤 5：运行生产构建**

运行：`npm run build`

预期：PASS，TypeScript 检查和 Next.js 构建通过。

- [ ] **步骤 6：提交最终收口**

```text
git add tests/incoming-transfer-risk.test.mjs tests/transfer-protocol.test.mjs tests/performance-architecture.test.mjs
git commit -m "test(P1 风险): 补齐接收摘要与高风险保护回归"
```

## 计划自检

- 规格覆盖度：风险分层、摘要优先、可执行文件二次确认、已信任设备保护、测试要求，均已映射到独立任务。
- 占位符扫描：计划中未使用 `TODO`、`待定`、`后续实现` 之类占位描述。
- 类型一致性：统一使用 `IncomingTransferSummary`、`riskFlags`、`requiresSecondaryConfirmation` 作为数据面名称，避免在不同任务中切换命名。
