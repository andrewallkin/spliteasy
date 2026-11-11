import type { GroupBalanceResponse, GroupMember } from '@/types/models'
import { formatCurrency } from '@/utils/currency'

export type BalanceTone = 'owe' | 'owed' | 'settled'

export type BalanceSummary = {
  tone: BalanceTone
  /** Short label above a big amount, e.g. "Sam owes you". */
  label: string
  /** Absolute amount (0 when settled). */
  amount: number
  /** Full sentence, identical to the current GroupDetailPage copy. */
  sentence: string
  isMultiUser: boolean
}

export function describeBalance(
  members: GroupMember[],
  balance: GroupBalanceResponse,
  userId: string | undefined,
): BalanceSummary | null {
  if (members.length < 2) return null
  const isMultiUser = members.length > 2
  const settled: BalanceSummary = { tone: 'settled', label: 'All settled up', amount: 0, sentence: 'All settled up', isMultiUser }
  if (balance.is_settled) return settled

  const myNet = Number(balance.balances.find((b) => b.user_id === userId)?.net_amount ?? 0)
  if (myNet === 0) return settled
  const amount = Math.abs(myNet)
  const formatted = formatCurrency(amount)

  if (isMultiUser) {
    return myNet < 0
      ? { tone: 'owe', label: 'You owe in total', amount, sentence: `You owe ${formatted} total`, isMultiUser }
      : { tone: 'owed', label: 'You are owed in total', amount, sentence: `You are owed ${formatted} total`, isMultiUser }
  }

  const partnerName = members.find((m) => m.user_id !== userId)?.display_name ?? 'partner'
  return myNet < 0
    ? { tone: 'owe', label: `You owe ${partnerName}`, amount, sentence: `You owe ${partnerName} ${formatted}`, isMultiUser }
    : { tone: 'owed', label: `${partnerName} owes you`, amount, sentence: `${partnerName} owes you ${formatted}`, isMultiUser }
}
