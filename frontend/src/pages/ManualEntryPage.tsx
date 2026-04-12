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
type MultiSplitMode = 'equal' | 'custom'

export function ManualEntryPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()

  const [members, setMembers] = useState<GroupMember[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  // 2-user state
  const [splitMode, setSplitMode] = useState<SplitMode>('equal')
  const [paidBySelf, setPaidBySelf] = useState(true)
  const [selfPercent, setSelfPercent] = useState(50)
  // 3+ user state
  const [multiSplitMode, setMultiSplitMode] = useState<MultiSplitMode>('equal')
  const [paidByUserId, setPaidByUserId] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isMultiUser = members.length > 2
  const partner = members.find((m) => m.user_id !== user?.id)

  useEffect(() => {
    async function loadMembers() {
      try {
        const data = await getGroupMembers(id)
        setMembers(data)
        if (data.length > 0) {
          setPaidByUserId(data.find((m) => m.user_id === user?.id)?.user_id ?? data[0].user_id)
          setSelectedMembers(new Set(data.map((m) => m.user_id)))
        }
      } catch (error) {
        addToast('error', getErrorMessage(error, 'Unable to load group members'))
      } finally {
        setMembersLoading(false)
      }
    }
    void loadMembers()
  }, [id, addToast, user?.id])

  function toggleMember(userId: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) {
        if (next.size > 1) next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  async function onSubmit() {
    if (!user) return
    const parsed = Number(amount)
    if (parsed <= 0 || !description.trim()) return
    setIsSubmitting(true)
    try {
      let payload: unknown

      if (isMultiUser) {
        const paidBy = paidByUserId
        if (multiSplitMode === 'equal') {
          payload = { description, total_amount: parsed, split_type: 'equal', paid_by: paidBy, splits: [] }
        } else {
          // Custom: equal split among selected members
          // If only 1 selected, backend handles as equal-among-1 (functionally like full)
          payload = {
            description,
            total_amount: parsed,
            split_type: 'equal',
            paid_by: paidBy,
            splits: Array.from(selectedMembers).map((uid) => ({ user_id: uid })),
          }
        }
      } else {
        // 2-user path — identical to original
        if (!partner) return
        const paidBy = paidBySelf ? user.id : partner.user_id
        payload =
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

  if (members.length < 2) {
    return (
      <Card className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pastel-lavender/30">
          <svg className="h-7 w-7 text-pastel-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-ink">Not enough members</h2>
        <p className="text-sm text-ink-secondary">
          Invite someone to this group before adding expenses.
        </p>
        <Button onClick={() => navigate(`/groups/${id}`)}>Back to group</Button>
      </Card>
    )
  }

  const parsedAmount = Number(amount) || 0

  // --- 3+ user UI ---
  if (isMultiUser) {
    const splitCount = multiSplitMode === 'equal' ? members.length : selectedMembers.size
    const perPerson = splitCount > 0 ? parsedAmount / splitCount : 0

    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-ink">Add Expense</h2>
          <p className="mt-0.5 text-sm text-ink-secondary">Split a cost with the group</p>
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
            <select
              value={paidByUserId}
              onChange={(e) => setPaidByUserId(e.target.value)}
              className="w-full rounded-2xl border border-surface-tertiary bg-surface-primary px-3 py-2.5 text-base text-ink shadow-soft focus:border-pastel-purple focus:outline-none"
            >
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}{m.user_id === user?.id ? ' (you)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">How to split?</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'equal' as const, label: 'Equal' },
                { key: 'custom' as const, label: 'Custom' },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setMultiSplitMode(key)
                    if (key === 'custom') {
                      setSelectedMembers(new Set(members.map((m) => m.user_id)))
                    }
                  }}
                  className={`rounded-2xl border-2 px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    multiSplitMode === key
                      ? 'border-pastel-purple bg-pastel-lavender/20 text-pastel-purple-deep'
                      : 'border-ink-faint/30 bg-surface-secondary text-ink-secondary hover:border-ink-faint/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {multiSplitMode === 'custom' && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">Split between</label>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => toggleMember(m.user_id)}
                    className={`rounded-2xl border-2 px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                      selectedMembers.has(m.user_id)
                        ? 'border-pastel-purple bg-pastel-lavender/20 text-pastel-purple-deep'
                        : 'border-ink-faint/30 bg-surface-secondary text-ink-secondary hover:border-ink-faint/60'
                    }`}
                  >
                    {m.display_name}{m.user_id === user?.id ? ' (you)' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {parsedAmount > 0 && (
            <div className="rounded-2xl bg-surface-secondary p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">Split preview</p>
              <div className="mt-2 space-y-1">
                {multiSplitMode === 'equal' ? (
                  <p className="text-sm text-ink-secondary">
                    <span className="font-semibold text-ink">{formatCurrency(perPerson)}</span> each ({members.length} people)
                  </p>
                ) : (
                  <>
                    {members.map((m) => (
                      selectedMembers.has(m.user_id) && (
                        <p key={m.user_id} className="text-sm text-ink-secondary">
                          {m.display_name}{m.user_id === user?.id ? ' (you)' : ''}:{' '}
                          <span className="font-semibold text-ink">{formatCurrency(perPerson)}</span>
                        </p>
                      )
                    ))}
                    {selectedMembers.size < members.length && (
                      <p className="mt-1 text-xs text-ink-tertiary">
                        {members.filter((m) => !selectedMembers.has(m.user_id)).map((m) => m.display_name).join(', ')} — not included
                      </p>
                    )}
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

  // --- 2-user UI (unchanged) ---
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink">Add Expense</h2>
        <p className="mt-0.5 text-sm text-ink-secondary">Split a cost with {partner!.display_name}</p>
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
              {partner!.display_name} paid
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
              <span className="font-medium text-ink-secondary">{partner!.display_name}: {100 - selfPercent}%</span>
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
                  {paidBySelf ? partner!.display_name : 'You'} owe{paidBySelf ? 's' : ''}{' '}
                  <span className="font-semibold text-ink">{formatCurrency(parsedAmount)}</span>
                </p>
              )}
              {splitMode === 'percentage' && (
                <>
                  <p className="text-sm text-ink-secondary">
                    You: <span className="font-semibold text-ink">{formatCurrency((parsedAmount * selfPercent) / 100)}</span>
                  </p>
                  <p className="text-sm text-ink-secondary">
                    {partner!.display_name}: <span className="font-semibold text-ink">{formatCurrency((parsedAmount * (100 - selfPercent)) / 100)}</span>
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
