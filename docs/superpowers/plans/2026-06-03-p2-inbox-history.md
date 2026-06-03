# Toss P2 接收历史与收件箱实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Toss 增加接收历史持久化、传输面板内的收件箱入口，以及可展开的收件箱视图，让最近接收、拒绝、取消、失败记录可回看。

**Architecture:** 在现有实时 `TransferItem` 体系之外新增独立的 `ReceiveHistoryEntry` 持久层，使用 IndexedDB 记录接收侧最终结果，并在 `transfer-context` 的关键接收事件中直接写入历史。UI 侧采用“内嵌入口 + 可展开视图”的分层结构，入口区展示最近记录，展开区承载完整收件箱和筛选、清空交互。

**Tech Stack:** Next.js 16、React 19、TypeScript、浏览器 IndexedDB、Node 内置测试运行器、现有架构测试

---

## 文件结构

**创建：**

- `lib/receive-history-storage.ts`：接收历史的数据类型、IndexedDB 读写、过期清理与清空方法。
- `components/receive-history-panel.tsx`：收件箱展开视图与最近接收入口的 UI 组件。
- `tests/receive-history-storage.test.mjs`：存储层与过期清理测试。
- `tests/receive-history-behavior.test.mjs`：接收链路历史写入和上下文逻辑测试。
- `docs/superpowers/plans/2026-06-03-p2-inbox-history.md`：本计划文档。

**修改：**

- `lib/types.ts`：新增 `ReceiveHistoryEntry`、`ReceiveHistoryOutcome` 等共享类型。
- `lib/transfer-context.tsx`：接入接收历史存储、暴露收件箱数据与清空能力、在接收结果节点写入历史。
- `components/transfer-panel.tsx`：嵌入最近接收入口和独立收件箱展开交互。
- `tests/performance-architecture.test.mjs`：补收件箱入口、筛选、清空等结构断言。

---

## 任务 1：先建立接收历史类型与存储层

**文件：**

- 创建：`lib/receive-history-storage.ts`
- 修改：`lib/types.ts`
- 创建：`tests/receive-history-storage.test.mjs`

- [ ] **步骤 1：先写失败的存储层测试**

```js
import assert from 'node:assert/strict'
import test from 'node:test'

test('appendReceiveHistoryEntry stores newest entries first and prunes expired rows', async () => {
  const {
    appendReceiveHistoryEntry,
    listReceiveHistoryEntries,
    clearReceiveHistoryEntries,
  } = await import('../lib/receive-history-storage.ts')

  const now = Date.now()
  const first = {
    id: 'entry-1',
    offerId: 'offer-1',
    deviceId: 'device-1',
    deviceName: 'Alice Mac',
    timestamp: now - 1000,
    outcome: 'completed',
    primaryFileName: 'photo-1.jpg',
    fileType: 'image/jpeg',
    failureReason: null,
    summary: {
      fileCount: 1,
      totalSize: 1024,
      sampleFiles: [{ name: 'photo-1.jpg', size: 1024, type: 'image/jpeg' }],
      riskFlags: [],
      requiresSecondaryConfirmation: false,
      executableFileName: null,
    },
  }

  const expired = {
    ...first,
    id: 'entry-expired',
    offerId: 'offer-expired',
    timestamp: now - (181 * 24 * 60 * 60 * 1000),
  }

  await clearReceiveHistoryEntries({ now })
  await appendReceiveHistoryEntry(expired, { now })
  await appendReceiveHistoryEntry(first, { now })

  const entries = await listReceiveHistoryEntries({ now })
  assert.equal(entries.length, 1)
  assert.equal(entries[0].id, 'entry-1')
})

test('clearReceiveHistoryEntries removes all inbox rows', async () => {
  const {
    appendReceiveHistoryEntry,
    listReceiveHistoryEntries,
    clearReceiveHistoryEntries,
  } = await import('../lib/receive-history-storage.ts')

  const entry = {
    id: 'entry-2',
    offerId: 'offer-2',
    deviceId: null,
    deviceName: 'Bob PC',
    timestamp: Date.now(),
    outcome: 'rejected',
    primaryFileName: 'installer.dmg',
    fileType: 'application/x-apple-diskimage',
    failureReason: null,
    summary: {
      fileCount: 1,
      totalSize: 2048,
      sampleFiles: [{ name: 'installer.dmg', size: 2048, type: 'application/x-apple-diskimage' }],
      riskFlags: ['executable'],
      requiresSecondaryConfirmation: true,
      executableFileName: 'installer.dmg',
    },
  }

  await appendReceiveHistoryEntry(entry)
  await clearReceiveHistoryEntries()

  const entries = await listReceiveHistoryEntries()
  assert.deepEqual(entries, [])
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`node --import tsx --test tests/receive-history-storage.test.mjs`

预期：FAIL，提示 `receive-history-storage.ts` 不存在。

- [ ] **步骤 3：新增历史条目类型**

```ts
export type ReceiveHistoryOutcome = 'completed' | 'rejected' | 'cancelled' | 'failed'

export interface ReceiveHistoryEntry {
  id: string
  offerId: string | null
  deviceId: string | null
  deviceName: string
  timestamp: number
  outcome: ReceiveHistoryOutcome
  summary: IncomingTransferSummary
  primaryFileName: string
  fileType: string | null
  failureReason: string | null
}
```

- [ ] **步骤 4：实现最小 IndexedDB 存储 API**

```ts
const RECEIVE_HISTORY_DB_NAME = 'toss-receive-history-db'
const RECEIVE_HISTORY_STORE = 'receive-history'
export const RECEIVE_HISTORY_RETENTION_MS = 180 * 24 * 60 * 60 * 1000

export async function appendReceiveHistoryEntry(entry: ReceiveHistoryEntry, options?: { now?: number }) {
  const db = await openReceiveHistoryDb()
  await pruneExpiredReceiveHistoryEntries(db, options?.now ?? Date.now())
  await putReceiveHistoryEntry(db, entry)
}

export async function listReceiveHistoryEntries(options?: { now?: number }) {
  const db = await openReceiveHistoryDb()
  await pruneExpiredReceiveHistoryEntries(db, options?.now ?? Date.now())
  const entries = await getAllReceiveHistoryEntries(db)
  return entries.sort((left, right) => right.timestamp - left.timestamp)
}

export async function clearReceiveHistoryEntries(options?: { now?: number }) {
  const db = await openReceiveHistoryDb()
  await pruneExpiredReceiveHistoryEntries(db, options?.now ?? Date.now())
  await clearReceiveHistoryStore(db)
}
```

- [ ] **步骤 5：让测试通过并补读取失败降级**

```ts
export async function listReceiveHistoryEntries(options?: { now?: number }) {
  try {
    const db = await openReceiveHistoryDb()
    await pruneExpiredReceiveHistoryEntries(db, options?.now ?? Date.now())
    const entries = await getAllReceiveHistoryEntries(db)
    return entries.sort((left, right) => right.timestamp - left.timestamp)
  }
  catch {
    return []
  }
}
```

- [ ] **步骤 6：运行存储层测试**

运行：`node --import tsx --test tests/receive-history-storage.test.mjs`

预期：PASS。

- [ ] **步骤 7：提交存储层基线**

```bash
git add lib/types.ts lib/receive-history-storage.ts tests/receive-history-storage.test.mjs
git commit -m "feat(P2 存储): 增加接收历史持久化基线"
```

## 任务 2：把接收历史写入接到 transfer-context

**文件：**

- 修改：`lib/transfer-context.tsx`
- 创建：`tests/receive-history-behavior.test.mjs`

- [ ] **步骤 1：先写失败的行为测试**

```js
import assert from 'node:assert/strict'
import test from 'node:test'

test('recordReceiveHistoryEntry writes rejected outcome from file offer decision', async () => {
  const { buildReceiveHistoryEntryFromOffer } = await import('../lib/transfer-context.tsx')

  const entry = buildReceiveHistoryEntryFromOffer({
    offer: {
      offerId: 'offer-1',
      peerId: 'peer-1',
      deviceId: 'device-1',
      deviceName: 'Alice Mac',
      fileName: 'photo-1.jpg',
      fileType: 'image/jpeg',
      size: 1024,
      fingerprint: null,
      requestedAt: 123,
      summary: {
        fileCount: 1,
        totalSize: 1024,
        sampleFiles: [{ name: 'photo-1.jpg', size: 1024, type: 'image/jpeg' }],
        riskFlags: [],
        requiresSecondaryConfirmation: false,
        executableFileName: null,
      },
    },
    outcome: 'rejected',
    failureReason: null,
    now: 456,
  })

  assert.equal(entry.outcome, 'rejected')
  assert.equal(entry.deviceName, 'Alice Mac')
  assert.equal(entry.primaryFileName, 'photo-1.jpg')
  assert.equal(entry.timestamp, 456)
})

test('recordReceiveHistoryEntry prevents history failures from blocking transfer flow', async () => {
  const { safelyAppendReceiveHistoryEntry } = await import('../lib/transfer-context.tsx')

  let attempted = false
  await safelyAppendReceiveHistoryEntry({
    appendEntry: async () => {
      attempted = true
      throw new Error('boom')
    },
    entry: { id: 'entry-1' },
    onError: () => {},
  })

  assert.equal(attempted, true)
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`node --import tsx --test tests/receive-history-behavior.test.mjs`

预期：FAIL，提示 helper 尚不存在。

- [ ] **步骤 3：抽出接收历史条目构造 helper**

```ts
export function buildReceiveHistoryEntryFromOffer({
  offer,
  outcome,
  failureReason,
  now,
}: {
  offer: IncomingFileOffer
  outcome: ReceiveHistoryOutcome
  failureReason: string | null
  now?: number
}): ReceiveHistoryEntry {
  return {
    id: generateUUID(),
    offerId: offer.offerId,
    deviceId: offer.deviceId,
    deviceName: offer.deviceName,
    timestamp: now ?? Date.now(),
    outcome,
    summary: offer.summary,
    primaryFileName: offer.fileName,
    fileType: offer.fileType || null,
    failureReason,
  }
}
```

- [ ] **步骤 4：抽出安全写入 helper**

```ts
export async function safelyAppendReceiveHistoryEntry({
  appendEntry,
  entry,
  onError,
}: {
  appendEntry: () => Promise<void>
  entry: { id: string }
  onError: (error: unknown) => void
}) {
  try {
    await appendEntry()
  }
  catch (error) {
    onError(error)
  }
}
```

- [ ] **步骤 5：在关键接收结果节点写入历史**

```ts
if (!accepted) {
  void safelyAppendReceiveHistoryEntry({
    appendEntry: () => appendReceiveHistoryEntry(buildReceiveHistoryEntryFromOffer({
      offer,
      outcome: 'rejected',
      failureReason: null,
    })),
    entry: { id: offer.offerId },
    onError: error => console.error('Failed to persist rejected receive history:', error),
  })
}
```

```ts
void safelyAppendReceiveHistoryEntry({
  appendEntry: () => appendReceiveHistoryEntry(buildReceiveHistoryEntryFromOffer({
    offer,
    outcome: 'completed',
    failureReason: null,
  })),
  entry: { id: offer.offerId },
  onError: error => console.error('Failed to persist completed receive history:', error),
})
```

- [ ] **步骤 6：在 provider 中暴露收件箱状态与清空能力**

```ts
interface TransferContextType {
  receiveHistoryEntries: ReceiveHistoryEntry[]
  clearReceiveHistory: () => Promise<void>
  reloadReceiveHistory: () => Promise<void>
}
```

```ts
function useReceiveHistoryState() {
  const [receiveHistoryEntries, setReceiveHistoryEntries] = useState<ReceiveHistoryEntry[]>([])

  const reloadReceiveHistory = useCallback(async () => {
    const entries = await listReceiveHistoryEntries()
    setReceiveHistoryEntries(entries)
  }, [])

  return { receiveHistoryEntries, reloadReceiveHistory }
}
```

- [ ] **步骤 7：运行行为测试**

运行：`node --import tsx --test tests/receive-history-behavior.test.mjs`

预期：PASS。

- [ ] **步骤 8：提交接收链路与状态接入**

```bash
git add lib/transfer-context.tsx tests/receive-history-behavior.test.mjs
git commit -m "feat(P2 接收): 接入接收历史写入与上下文状态"
```

## 任务 3：实现收件箱入口区与展开视图

**文件：**

- 创建：`components/receive-history-panel.tsx`
- 修改：`components/transfer-panel.tsx`
- 修改：`tests/performance-architecture.test.mjs`

- [ ] **步骤 1：先写失败的结构测试**

```js
test('transfer panel exposes inbox entry point and expandable receive history view', async () => {
  const panelSource = await readProjectFile('components/transfer-panel.tsx')
  const historySource = await readProjectFile('components/receive-history-panel.tsx')

  assert.match(panelSource, /收件箱|最近接收/)
  assert.match(panelSource, /查看全部/)
  assert.match(historySource, /已接收|已拒绝|已取消|失败/)
  assert.match(historySource, /清空历史/)
  assert.match(historySource, /sampleFiles|riskFlags/)
})
```

- [ ] **步骤 2：运行架构测试确认失败**

运行：`node --import tsx --test tests/performance-architecture.test.mjs`

预期：FAIL，提示相关收件箱结构尚未出现。

- [ ] **步骤 3：实现独立收件箱面板组件**

```tsx
export function ReceiveHistoryPanel({
  entries,
  activeOutcome,
  onOutcomeChange,
  onClearHistory,
  onBack,
}: ReceiveHistoryPanelProps) {
  const filteredEntries = activeOutcome === 'all'
    ? entries
    : entries.filter(entry => entry.outcome === activeOutcome)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">收件箱</h3>
          <p className="text-xs text-muted-foreground">最近的接收记录会显示在这里</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>返回传输</Button>
          <Button variant="outline" size="sm" onClick={onClearHistory}>清空历史</Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **步骤 4：在传输面板加入最近接收入口区与展开态切换**

```tsx
function TransferPanelPreviewExample() {
  const [showReceiveHistory, setShowReceiveHistory] = useState(false)
  const recentReceiveEntries = receiveHistoryEntries.slice(0, 5)

  const recentReceiveSection = !showReceiveHistory && recentReceiveEntries.length > 0
    ? (
        <section className="border-b border-border/70 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-foreground">最近接收</h3>
              <p className="text-xs text-muted-foreground">最近的接收记录会显示在这里</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowReceiveHistory(true)}>查看全部</Button>
          </div>
        </section>
      )
    : null

  return recentReceiveSection
}
```

- [ ] **步骤 5：在面板中加入状态筛选与详情展开**

```tsx
const OUTCOME_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'completed', label: '已接收' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'cancelled', label: '已取消' },
  { value: 'failed', label: '失败' },
]
```

```tsx
const sampleFileItems = entry.summary.sampleFiles.map(file => (
  <p key={`${file.name}-${file.size}`} className="text-xs text-muted-foreground">{file.name}</p>
))
```

- [ ] **步骤 6：加入清空历史确认**

```tsx
function ClearReceiveHistoryDialogExample() {
  const [showClearReceiveHistoryConfirm, setShowClearReceiveHistoryConfirm] = useState(false)

  return (
    <Dialog open={showClearReceiveHistoryConfirm} onOpenChange={setShowClearReceiveHistoryConfirm}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>清空收件箱历史</DialogTitle>
          <DialogDescription>此操作不会影响实时传输，仅移除本地接收记录。</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **步骤 7：运行架构测试**

运行：`node --import tsx --test tests/performance-architecture.test.mjs`

预期：PASS。

- [ ] **步骤 8：提交收件箱 UI**

```bash
git add components/receive-history-panel.tsx components/transfer-panel.tsx tests/performance-architecture.test.mjs
git commit -m "feat(P2 收件箱): 增加最近接收入口与展开视图"
```

## 任务 4：补齐集成验证并准备执行

**文件：**

- 修改：`tests/receive-history-storage.test.mjs`
- 修改：`tests/receive-history-behavior.test.mjs`
- 修改：`tests/performance-architecture.test.mjs`

- [ ] **步骤 1：补最后一批覆盖项**

至少确认测试包含：

```js
assert.equal(entries[0].outcome, 'completed')
assert.equal(entries[0].deviceName, 'Alice Mac')
assert.match(historySource, /清空历史/)
assert.match(panelSource, /查看全部/)
```

- [ ] **步骤 2：运行针对性测试**

运行：`node --import tsx --test tests/receive-history-storage.test.mjs tests/receive-history-behavior.test.mjs tests/performance-architecture.test.mjs`

预期：PASS。

- [ ] **步骤 3：运行全量测试**

运行：`npm test`

预期：PASS。

- [ ] **步骤 4：运行 lint**

运行：`npm run lint`

预期：PASS。

- [ ] **步骤 5：运行生产构建**

运行：`npm run build`

预期：PASS。

- [ ] **步骤 6：提交最终测试收口**

```bash
git add tests/receive-history-storage.test.mjs tests/receive-history-behavior.test.mjs tests/performance-architecture.test.mjs
git commit -m "test(P2 收件箱): 补齐接收历史与收件箱回归"
```

## 计划自检

- 规格覆盖度：接收历史、收件箱入口、展开视图、状态筛选、180 天清理、手动清空、失败降级，均已映射到独立任务。
- 占位符扫描：计划中未使用 `TODO`、`TBD`、`待定`、`后续补上` 之类占位描述。
- 类型一致性：统一使用 `ReceiveHistoryEntry`、`ReceiveHistoryOutcome`、`IncomingTransferSummary` 作为数据面名称，避免后续任务切换命名。
