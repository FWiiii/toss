'use client'

import type { ReceiveHistoryEntry, ReceiveHistoryOutcome } from '@/lib/types'
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheckBig, CircleX, Clock3, Inbox } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn, formatFileSize } from '@/lib/utils'

export type ReceiveHistoryFilter = 'all' | ReceiveHistoryOutcome

const OUTCOME_OPTIONS: Array<{ value: ReceiveHistoryFilter, label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'completed', label: '已接收' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'cancelled', label: '已取消' },
  { value: 'failed', label: '失败' },
]

function formatReceiveHistoryTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getOutcomeCopy(outcome: ReceiveHistoryOutcome) {
  switch (outcome) {
    case 'completed':
      return {
        icon: CircleCheckBig,
        label: '已接收',
        tone: 'text-emerald-600 dark:text-emerald-400',
      }
    case 'rejected':
      return {
        icon: CircleX,
        label: '已拒绝',
        tone: 'text-muted-foreground',
      }
    case 'cancelled':
      return {
        icon: CircleAlert,
        label: '已取消',
        tone: 'text-amber-600 dark:text-amber-400',
      }
    case 'failed':
      return {
        icon: CircleAlert,
        label: '失败',
        tone: 'text-destructive',
      }
  }
}

function buildEntrySummary(entry: ReceiveHistoryEntry) {
  if (entry.summary.fileCount > 1) {
    return `${entry.summary.fileCount} 个文件 · ${formatFileSize(entry.summary.totalSize)}`
  }
  return `${entry.primaryFileName} · ${formatFileSize(entry.summary.totalSize)}`
}

function ReceiveHistoryRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: ReceiveHistoryEntry
  expanded: boolean
  onToggle: () => void
}) {
  const outcome = getOutcomeCopy(entry.outcome)
  const OutcomeIcon = outcome.icon

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={`${entry.id}-details`}
      className="w-full rounded-lg border border-border/70 bg-background/60 px-3 py-3 text-left transition-colors hover:bg-muted/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <OutcomeIcon className={cn('h-4 w-4 shrink-0', outcome.tone)} />
            <span className="text-sm font-medium text-foreground">{entry.deviceName}</span>
            <span className={cn('text-xs', outcome.tone)}>{outcome.label}</span>
          </div>
          <p className="truncate text-sm text-foreground">{buildEntrySummary(entry)}</p>
          <p className="text-xs text-muted-foreground">{formatReceiveHistoryTime(entry.timestamp)}</p>
        </div>
        <ChevronRight className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
      </div>

      {expanded && (
        <div id={`${entry.id}-details`} className="mt-3 space-y-3 border-t border-border/70 pt-3">
          <div className="flex flex-wrap gap-2">
            {entry.summary.riskFlags.map(flag => (
              <span key={flag} className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                {flag}
              </span>
            ))}
            {entry.summary.riskFlags.length === 0 && (
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                无风险标记
              </span>
            )}
          </div>

          <div className="space-y-1">
            {entry.summary.sampleFiles.map(file => (
              <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-foreground">{file.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
              </div>
            ))}
          </div>

          {entry.failureReason && (
            <p className="text-xs text-destructive">{entry.failureReason}</p>
          )}
        </div>
      )}
    </button>
  )
}

export function ReceiveHistoryPanel({
  entries,
  isExpanded,
  activeOutcome,
  showAllLabel = '查看全部',
  onOutcomeChange,
  onShowAll,
  onBack,
  onClearHistory,
}: {
  entries: ReceiveHistoryEntry[]
  isExpanded: boolean
  activeOutcome: ReceiveHistoryFilter
  showAllLabel?: string
  onOutcomeChange: (outcome: ReceiveHistoryFilter) => void
  onShowAll: () => void
  onBack: () => void
  onClearHistory: () => void
}) {
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)
  const [visibleEntryLimit, setVisibleEntryLimit] = useState(50)

  const filteredEntries = useMemo(() => {
    if (activeOutcome === 'all') {
      return entries
    }
    return entries.filter(entry => entry.outcome === activeOutcome)
  }, [activeOutcome, entries])
  const visibleEntries = filteredEntries.slice(0, visibleEntryLimit)
  const outcomeCounts = useMemo(() => ({
    all: entries.length,
    completed: entries.filter(entry => entry.outcome === 'completed').length,
    rejected: entries.filter(entry => entry.outcome === 'rejected').length,
    cancelled: entries.filter(entry => entry.outcome === 'cancelled').length,
    failed: entries.filter(entry => entry.outcome === 'failed').length,
  }), [entries])

  const handleOutcomeChange = (outcome: ReceiveHistoryFilter) => {
    setVisibleEntryLimit(50)
    onOutcomeChange(outcome)
  }

  if (!isExpanded) {
    const recentEntries = entries.slice(0, 5)

    if (recentEntries.length === 0) {
      return (
        <section className="border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Inbox className="h-4 w-4" />
            <span>暂无接收记录</span>
          </div>
        </section>
      )
    }

    return (
      <section className="border-b border-border/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-foreground">最近接收</h3>
            <p className="text-xs text-muted-foreground">收件箱会保留最近 180 天的接收记录</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onShowAll}>
            {showAllLabel}
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {recentEntries.map((entry) => {
            const outcome = getOutcomeCopy(entry.outcome)
            const OutcomeIcon = outcome.icon

            return (
              <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <OutcomeIcon className={cn('h-4 w-4 shrink-0', outcome.tone)} />
                    <p className="truncate text-sm text-foreground">{entry.primaryFileName}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.deviceName}
                    {' · '}
                    {formatReceiveHistoryTime(entry.timestamp)}
                  </p>
                </div>
                <span className={cn('shrink-0 text-xs', outcome.tone)}>{outcome.label}</span>
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">收件箱</h3>
          </div>
          <p className="text-xs text-muted-foreground">按时间倒序查看接收、拒绝、取消和失败记录</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
            返回传输
          </Button>
          <Button variant="outline" size="sm" onClick={onClearHistory} disabled={entries.length === 0}>
            清空历史
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="筛选收件记录">
        {OUTCOME_OPTIONS.map(option => (
          <Button
            key={option.value}
            variant={activeOutcome === option.value ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => handleOutcomeChange(option.value)}
            aria-pressed={activeOutcome === option.value}
            className="gap-1.5 rounded-full"
          >
            {option.label}
            <span className="text-[11px] tabular-nums opacity-70">
              {outcomeCounts[option.value]}
            </span>
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {filteredEntries.length === 0
          ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-border/70 text-center">
                <Clock3 className="mb-3 h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-foreground">当前筛选下暂无记录</p>
                <p className="mt-1 text-xs text-muted-foreground">新的接收结果会显示在这里</p>
              </div>
            )
          : (
              visibleEntries.map(entry => (
                <ReceiveHistoryRow
                  key={entry.id}
                  entry={entry}
                  expanded={expandedEntryId === entry.id}
                  onToggle={() => {
                    setExpandedEntryId(current => current === entry.id ? null : entry.id)
                  }}
                />
              ))
            )}
      </div>

      {visibleEntryLimit < filteredEntries.length && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" size="sm" onClick={() => setVisibleEntryLimit(limit => limit + 50)}>
            加载更多记录
            {' · '}
            {filteredEntries.length - visibleEntryLimit}
          </Button>
        </div>
      )}
    </div>
  )
}
