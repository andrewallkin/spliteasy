import type { ConfirmDialogOptions } from '@/hooks/useConfirmDialog'

export const historyFilters: Array<'all' | 'receipt' | 'entry' | 'settlement'> = [
  'all',
  'receipt',
  'entry',
  'settlement',
]

export const historyFilterLabels: Record<string, string> = {
  all: 'All',
  receipt: 'Receipts',
  entry: 'Expenses',
  settlement: 'Settlements',
}

export function formatHistoryDate(ts: string) {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatHistoryTime(ts: string) {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export type SplitMode = 'equal' | 'full' | 'percentage'
export type RequestConfirm = (options: ConfirmDialogOptions) => Promise<boolean>

export function toSplitMode(value: string): SplitMode {
  if (value === 'equal' || value === 'full' || value === 'percentage') {
    return value
  }
  return 'equal'
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function calendarDayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function dayLabel(iso: string): string {
  const target = startOfLocalDay(new Date(iso))
  const today = startOfLocalDay(new Date())
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
}
