import { Button } from '@/components/ui/Button'
import type { GroupHistoryEntrySplitLine, GroupMember, ManualEntryDetail } from '@/types/models'
import { formatCurrency } from '@/utils/currency'

export function displayNameFor(userId: string, members: GroupMember[]) {
  return members.find((member) => member.user_id === userId)?.display_name ?? 'Unknown'
}

export function splitTypeCaption(splitType: string | null | undefined) {
  if (splitType === 'equal') {
    return 'Split equally'
  }
  if (splitType === 'full') {
    return 'Full amount to one person'
  }
  if (splitType === 'percentage') {
    return 'Custom percentage split'
  }
  return 'Split'
}

export function SplitLineRow({
  line,
  currency,
  currentUserId,
}: {
  line: GroupHistoryEntrySplitLine
  currency?: string
  currentUserId?: string
}) {
  const isMe = line.user_id && currentUserId && line.user_id === currentUserId
  return (
    <li className="flex items-center justify-between gap-3 text-sm text-ink-secondary">
      <span>{line.display_name}{isMe ? ' (you)' : ''}</span>
      <span className="shrink-0 font-semibold tabular-nums text-ink">
        {formatCurrency(Number(line.amount), currency)}
      </span>
    </li>
  )
}

export function MarkPaidButtons({
  canMarkPaid,
  canUndo,
  isLoading,
  onMark,
  onUndo,
}: {
  canMarkPaid?: boolean
  canUndo?: boolean
  isLoading?: boolean
  onMark: () => void
  onUndo: () => void
}) {
  if (!canMarkPaid && !canUndo) {
    return null
  }
  return (
    <>
      {canMarkPaid && (
        <Button
          variant="secondary"
          className="h-10 rounded-xl px-4 text-xs"
          disabled={isLoading}
          onClick={onMark}
        >
          {isLoading ? 'Saving...' : 'Mark as paid'}
        </Button>
      )}
      {canUndo && (
        <Button
          variant="secondary"
          className="h-10 rounded-xl px-4 text-xs"
          disabled={isLoading}
          onClick={onUndo}
        >
          {isLoading ? 'Saving...' : 'Undo paid'}
        </Button>
      )}
    </>
  )
}

export function entryHasPaidSplits(entry: ManualEntryDetail | null): boolean {
  return Boolean(entry?.splits.some((split) => split.is_paid === true))
}
