import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { createManualEntry, getGroupMembers } from '@/api/groups'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { UsersIcon } from '@/components/ui/icons'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { PageContent, PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/Select'
import { StickyFooter } from '@/components/ui/StickyFooter'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { groupTheme } from '@/lib/theme'
import type { GroupMember } from '@/types/models'
import { formatCurrency } from '@/utils/currency'
import { getErrorMessage } from '@/utils/errors'

type SplitMode = 'equal' | 'full' | 'percentage'
type MultiSplitMode = 'equal' | 'custom'

const MANUAL_ENTRY_FORM_ID = 'manual-entry-form'

export function ManualEntryPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()
  const theme = groupTheme(id)

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

  function onFormSubmit(event: FormEvent) {
    event.preventDefault()
    void onSubmit()
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
      <>
        <PageHeader theme={theme} back={`/groups/${id}`} title="New expense" />
        <PageContent>
          <EmptyState
            icon={<UsersIcon className="h-8 w-8" />}
            title="Not enough members"
            description="Invite someone to this group before adding expenses."
            action={
              <Button size="lg" className="w-full" onClick={() => navigate(`/groups/${id}`)}>
                Back to group
              </Button>
            }
          />
        </PageContent>
      </>
    )
  }

  const parsedAmount = Number(amount) || 0
  const saveDisabled = isSubmitting || parsedAmount <= 0 || !description.trim()

  // --- 3+ user UI ---
  if (isMultiUser) {
    const splitCount = multiSplitMode === 'equal' ? members.length : selectedMembers.size
    const perPerson = splitCount > 0 ? parsedAmount / splitCount : 0

    return (
      <>
        <PageHeader theme={theme} back={`/groups/${id}`} title="New expense" />
        <PageContent className="pb-4">
          <form id={MANUAL_ENTRY_FORM_ID} className="space-y-4" onSubmit={onFormSubmit}>
            <div>
              <Field label="Amount" htmlFor="manual-amount">
                <Input
                  id="manual-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-16 text-center text-4xl font-extrabold tabular-nums"
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="manual-description">
              <Input
                id="manual-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={200}
                placeholder="What was it for?"
              />
            </Field>

            <Field label="Who paid?" htmlFor="manual-paid-by">
              <Select
                id="manual-paid-by"
                value={paidByUserId}
                onChange={(e) => setPaidByUserId(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name}{m.user_id === user?.id ? ' (you)' : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="How to split?">
              <SegmentedControl
                value={multiSplitMode}
                onChange={(key) => {
                  setMultiSplitMode(key)
                  if (key === 'custom') {
                    setSelectedMembers(new Set(members.map((m) => m.user_id)))
                  }
                }}
                options={[
                  { value: 'equal', label: 'Equal' },
                  { value: 'custom', label: 'Custom' },
                ]}
                aria-label="How to split"
              />
            </Field>

            {multiSplitMode === 'custom' && (
              <Field label="Split between">
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const active = selectedMembers.has(m.user_id)
                    return (
                      <button
                        key={m.user_id}
                        type="button"
                        onClick={() => toggleMember(m.user_id)}
                        className={`flex min-h-[44px] items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5 text-xs font-bold transition ${
                          active
                            ? 'border-violet-400 bg-violet-50 text-violet-700'
                            : 'border-line bg-white text-ink-secondary'
                        }`}
                      >
                        <Avatar
                          name={m.display_name}
                          src={m.profile_picture}
                          colorKey={m.user_id}
                          size="xs"
                        />
                        {m.display_name}{m.user_id === user?.id ? ' (you)' : ''}
                      </button>
                    )
                  })}
                </div>
              </Field>
            )}

            {parsedAmount > 0 && (
              <div className={`space-y-1 rounded-3xl border-[1.5px] p-4 ${theme.soft} ${theme.softBorder}`}>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">Split preview</p>
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
            )}
          </form>
        </PageContent>

        <StickyFooter>
          <Button
            type="submit"
            form={MANUAL_ENTRY_FORM_ID}
            variant="accent"
            theme={theme}
            size="lg"
            className="w-full"
            disabled={saveDisabled}
          >
            {isSubmitting ? 'Saving...' : 'Save Expense'}
          </Button>
        </StickyFooter>
      </>
    )
  }

  // --- 2-user UI ---
  const me = members.find((m) => m.user_id === user?.id)

  return (
    <>
      <PageHeader theme={theme} back={`/groups/${id}`} title="New expense" />
      <PageContent className="pb-4">
        <form id={MANUAL_ENTRY_FORM_ID} className="space-y-4" onSubmit={onFormSubmit}>
          <div>
            <Field label="Amount" htmlFor="manual-amount-2u">
              <Input
                id="manual-amount-2u"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-16 text-center text-4xl font-extrabold tabular-nums"
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="manual-description-2u">
            <Input
              id="manual-description-2u"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="What was it for?"
            />
          </Field>

          <Field label="Who paid?">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaidBySelf(true)}
                className={`flex min-h-[44px] flex-1 items-center gap-2 rounded-[18px] border-2 p-3 transition ${
                  paidBySelf
                    ? 'border-violet-500 bg-violet-50'
                    : 'border-line bg-white text-ink-secondary'
                }`}
              >
                {me && (
                  <Avatar
                    name={me.display_name}
                    src={me.profile_picture}
                    colorKey={me.user_id}
                    size="xs"
                  />
                )}
                <span className="text-sm font-bold text-ink">I paid</span>
              </button>
              <button
                type="button"
                onClick={() => setPaidBySelf(false)}
                className={`flex min-h-[44px] flex-1 items-center gap-2 rounded-[18px] border-2 p-3 transition ${
                  !paidBySelf
                    ? 'border-violet-500 bg-violet-50'
                    : 'border-line bg-white text-ink-secondary'
                }`}
              >
                <Avatar
                  name={partner!.display_name}
                  src={partner!.profile_picture}
                  colorKey={partner!.user_id}
                  size="xs"
                />
                <span className="text-sm font-bold text-ink">{partner!.display_name} paid</span>
              </button>
            </div>
          </Field>

          <Field label="How to split?">
            <SegmentedControl
              value={splitMode}
              onChange={setSplitMode}
              options={[
                { value: 'equal', label: 'Equal' },
                { value: 'full', label: 'Full' },
                { value: 'percentage', label: 'Custom %' },
              ]}
              aria-label="How to split"
            />
          </Field>

          {splitMode === 'percentage' && (
            <Field label={`Your share: ${selfPercent}%`}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={selfPercent}
                onChange={(e) => setSelfPercent(Number(e.target.value))}
                className="w-full accent-violet-500"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={selfPercent}
              />
              <div className="mt-2 flex justify-between text-sm">
                <span className="font-medium text-violet-700">You: {selfPercent}%</span>
                <span className="font-medium text-ink-secondary">{partner!.display_name}: {100 - selfPercent}%</span>
              </div>
            </Field>
          )}

          {parsedAmount > 0 && (
            <div className={`space-y-1 rounded-3xl border-[1.5px] p-4 ${theme.soft} ${theme.softBorder}`}>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">Split preview</p>
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
          )}
        </form>
      </PageContent>

      <StickyFooter>
        <Button
          type="submit"
          form={MANUAL_ENTRY_FORM_ID}
          variant="accent"
          theme={theme}
          size="lg"
          className="w-full"
          disabled={saveDisabled}
        >
          {isSubmitting ? 'Saving...' : 'Save Expense'}
        </Button>
      </StickyFooter>
    </>
  )
}
