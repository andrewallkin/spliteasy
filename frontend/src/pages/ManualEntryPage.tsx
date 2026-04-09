import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { createManualEntry, getGroupMembers } from '@/api/groups'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import type { GroupMember } from '@/types/models'
import { formatCurrency } from '@/utils/currency'
import { getErrorMessage } from '@/utils/errors'

type SplitMode = 'equal' | 'full' | 'percentage'

export function ManualEntryPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()

  const [members, setMembers] = useState<GroupMember[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [splitMode, setSplitMode] = useState<SplitMode>('equal')
  const [paidBySelf, setPaidBySelf] = useState(true)
  const [selfPercent, setSelfPercent] = useState(50)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const partner = members.find((m) => m.user_id !== user?.id)

  useEffect(() => {
    async function loadMembers() {
      try {
        const data = await getGroupMembers(id)
        setMembers(data)
      } catch (error) {
        addToast('error', getErrorMessage(error, 'Unable to load group members'))
      } finally {
        setMembersLoading(false)
      }
    }
    void loadMembers()
  }, [id, addToast])

  async function onSubmit() {
    if (!user || !partner) return
    const parsed = Number(amount)
    if (parsed <= 0 || !description.trim()) return
    setIsSubmitting(true)
    try {
      const paidBy = paidBySelf ? user.id : partner.user_id
      const payload =
        splitMode === 'equal'
          ? { description, total_amount: parsed, split_type: 'equal', paid_by: paidBy, splits: [] }
          : splitMode === 'full'
            ? {
                description,
                total_amount: parsed,
                split_type: 'full',
                paid_by: paidBy,
                splits: [{ user_id: paidBySelf ? partner.user_id : user.id }],
              }
            : {
                description,
                total_amount: parsed,
                split_type: 'percentage',
                paid_by: paidBy,
                splits: [
                  { user_id: user.id, percentage: selfPercent },
                  { user_id: partner.user_id, percentage: 100 - selfPercent },
                ],
              }
      await createManualEntry(id, payload)
      addToast('success', 'Expense added')
      navigate(`/groups/${id}`)
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to create entry'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (membersLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    )
  }

  if (!partner) {
    return (
      <Card className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pastel-lavender/30">
          <svg className="h-7 w-7 text-pastel-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-ink">No partner yet</h2>
        <p className="text-sm text-ink-secondary">
          Invite someone to this group before adding expenses.
        </p>
        <Button onClick={() => navigate(`/groups/${id}`)}>Back to group</Button>
      </Card>
    )
  }

  const parsedAmount = Number(amount) || 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink">Add Expense</h2>
        <p className="mt-0.5 text-sm text-ink-secondary">Split a cost with {partner.display_name}</p>
      </div>

      <Card className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Amount</label>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Description</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            placeholder="What was it for?"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-ink">Who paid?</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaidBySelf(true)}
              className={`flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                paidBySelf
                  ? 'border-pastel-purple bg-pastel-lavender/20 text-pastel-purple-deep'
                  : 'border-ink-faint/30 bg-surface-secondary text-ink-secondary hover:border-ink-faint/60'
              }`}
            >
              <div className={`h-2 w-2 rounded-full ${paidBySelf ? 'bg-pastel-purple-deep' : 'bg-ink-faint'}`} />
              I paid
            </button>
            <button
              type="button"
              onClick={() => setPaidBySelf(false)}
              className={`flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                !paidBySelf
                  ? 'border-pastel-purple bg-pastel-lavender/20 text-pastel-purple-deep'
                  : 'border-ink-faint/30 bg-surface-secondary text-ink-secondary hover:border-ink-faint/60'
              }`}
            >
              <div className={`h-2 w-2 rounded-full ${!paidBySelf ? 'bg-pastel-purple-deep' : 'bg-ink-faint'}`} />
              {partner.display_name} paid
            </button>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-ink">How to split?</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: 'equal' as const, label: 'Equal' },
              { key: 'full' as const, label: 'Full' },
              { key: 'percentage' as const, label: 'Custom %' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSplitMode(key)}
                className={`rounded-2xl border-2 px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  splitMode === key
                    ? 'border-pastel-purple bg-pastel-lavender/20 text-pastel-purple-deep'
                    : 'border-ink-faint/30 bg-surface-secondary text-ink-secondary hover:border-ink-faint/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {splitMode === 'percentage' && (
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Your share: {selfPercent}%</label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={selfPercent}
              onChange={(e) => setSelfPercent(Number(e.target.value))}
              className="w-full accent-pastel-purple-deep"
            />
            <div className="mt-2 flex justify-between text-sm">
              <span className="font-medium text-pastel-purple-deep">You: {selfPercent}%</span>
              <span className="font-medium text-ink-secondary">{partner.display_name}: {100 - selfPercent}%</span>
            </div>
          </div>
        )}

        {parsedAmount > 0 && (
          <div className="rounded-2xl bg-surface-secondary p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">Split preview</p>
            <div className="mt-2 space-y-1">
              {splitMode === 'equal' && (
                <p className="text-sm text-ink-secondary">
                  <span className="font-semibold text-ink">{formatCurrency(parsedAmount / 2)}</span> each
                </p>
              )}
              {splitMode === 'full' && (
                <p className="text-sm text-ink-secondary">
                  {paidBySelf ? partner.display_name : 'You'} owe{paidBySelf ? 's' : ''}{' '}
                  <span className="font-semibold text-ink">{formatCurrency(parsedAmount)}</span>
                </p>
              )}
              {splitMode === 'percentage' && (
                <>
                  <p className="text-sm text-ink-secondary">
                    You: <span className="font-semibold text-ink">{formatCurrency((parsedAmount * selfPercent) / 100)}</span>
                  </p>
                  <p className="text-sm text-ink-secondary">
                    {partner.display_name}: <span className="font-semibold text-ink">{formatCurrency((parsedAmount * (100 - selfPercent)) / 100)}</span>
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        <Button
          onClick={onSubmit}
          className="w-full"
          disabled={isSubmitting || parsedAmount <= 0 || !description.trim()}
        >
          {isSubmitting ? 'Saving...' : 'Save Expense'}
        </Button>
      </Card>
    </div>
  )
}
