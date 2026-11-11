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
