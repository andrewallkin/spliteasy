import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { createSettlement, getBalances, getGroupMembers, getSuggestedSettlements } from '@/api/groups'
import { AmountText } from '@/components/ui/AmountText'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { ArrowRightIcon, CheckIcon, UsersIcon } from '@/components/ui/icons'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { FloatCard, PageContent, PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/Select'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { groupTheme } from '@/lib/theme'
import type { GroupBalanceResponse, GroupMember, SuggestedSettlement } from '@/types/models'
import { formatCurrency } from '@/utils/currency'
import { getErrorMessage } from '@/utils/errors'

export function SettlePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()
  const theme = groupTheme(id)
  const [balance, setBalance] = useState<GroupBalanceResponse | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [suggested, setSuggested] = useState<SuggestedSettlement[]>([])
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Multi-user state
  const [selectedCounterparty, setSelectedCounterparty] = useState('')

  const isMultiUser = members.length > 2
  const partner = members.find((m) => m.user_id !== user?.id)

  const myBalance = balance?.balances.find((b) => b.user_id === user?.id)
  const myNet = Number(myBalance?.net_amount ?? 0)
  const iOwe = myNet < 0

  useEffect(() => {
    async function load() {
      try {
        const [balanceData, membersData] = await Promise.all([
          getBalances(id),
          getGroupMembers(id),
        ])
        setBalance(balanceData)
        setMembers(membersData)

        if (membersData.length > 2) {
          // Multi-user: fetch suggested settlements
          const sugData = await getSuggestedSettlements(id)
          setSuggested(sugData)
          // Auto-select the first suggested settlement involving the current user
          const mySettlement = sugData.find(
            (s) => s.from_user_id === user?.id || s.to_user_id === user?.id,
          )
          if (mySettlement) {
            const counterparty = mySettlement.from_user_id === user?.id
              ? mySettlement.to_user_id
              : mySettlement.from_user_id
            setSelectedCounterparty(counterparty)
            setAmount(Number(mySettlement.amount).toFixed(2))
          }
        } else {
          // 2-user: pre-fill amount
          const myBal = balanceData.balances.find((b) => b.user_id === user?.id)
          const net = Number(myBal?.net_amount ?? 0)
          if (net < 0) {
            setAmount(Math.abs(net).toFixed(2))
          } else {
            const partnerBal = balanceData.balances.find((b) => b.user_id !== user?.id)
            const partnerNet = Number(partnerBal?.net_amount ?? 0)
            if (partnerNet < 0) {
              setAmount(Math.abs(partnerNet).toFixed(2))
            }
          }
        }
      } catch (error) {
        addToast('error', getErrorMessage(error, 'Unable to load balances'))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [id, user?.id, addToast])

  // Update amount when counterparty changes (multi-user)
  function onCounterpartyChange(counterpartyId: string) {
    setSelectedCounterparty(counterpartyId)
    const match = suggested.find(
      (s) =>
        (s.from_user_id === user?.id && s.to_user_id === counterpartyId) ||
        (s.to_user_id === user?.id && s.from_user_id === counterpartyId),
    )
    if (match) {
      setAmount(Number(match.amount).toFixed(2))
    }
  }

  async function onSubmit() {
    if (!user) return
    const parsed = Number(amount)
    if (parsed <= 0) return
    setIsSubmitting(true)
    try {
      let paidBy: string
      let paidTo: string

      if (isMultiUser) {
        if (!selectedCounterparty) return
        // Determine direction from balances
        const myBal = Number(balance?.balances.find((b) => b.user_id === user.id)?.net_amount ?? 0)
        const counterBal = Number(balance?.balances.find((b) => b.user_id === selectedCounterparty)?.net_amount ?? 0)
        if (myBal < 0 && counterBal > 0) {
          paidBy = user.id
          paidTo = selectedCounterparty
        } else if (myBal > 0 && counterBal < 0) {
          paidBy = selectedCounterparty
          paidTo = user.id
        } else {
          addToast('error', 'No outstanding balance with this person')
          setIsSubmitting(false)
          return
        }
      } else {
        if (!partner) return
        paidBy = iOwe ? user.id : partner.user_id
        paidTo = iOwe ? partner.user_id : user.id
      }

      await createSettlement(id, {
        paid_by: paidBy,
        paid_to: paidTo,
        amount: parsed,
        notes: notes || null,
      })
      addToast('success', 'Settlement recorded')
      navigate(`/groups/${id}`)
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to record settlement'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    )
  }

  if (balance?.is_settled) {
    return (
      <>
        <PageHeader theme={theme} tall back={`/groups/${id}`} title="Settle up" />
        <PageContent>
          <EmptyState
            tone="success"
            icon={<CheckIcon className="h-8 w-8" />}
            title="All Settled Up!"
            description="There are no outstanding balances."
            action={
              <Button variant="dark" size="lg" className="w-full" onClick={() => navigate(`/groups/${id}`)}>
                Back to Group
              </Button>
            }
          />
        </PageContent>
      </>
    )
  }

  if (members.length < 2) {
    return (
      <>
        <PageHeader theme={theme} tall back={`/groups/${id}`} title="Settle up" />
        <PageContent>
          <EmptyState
            icon={<UsersIcon className="h-8 w-8" />}
            title="Not enough members"
            description="Invite someone to this group first."
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

  // --- 3+ user settle UI ---
  if (isMultiUser) {
    // Build list of counterparties the current user can settle with
    const mySettlements = suggested.filter(
      (s) => s.from_user_id === user?.id || s.to_user_id === user?.id,
    )
    const counterpartyIds = mySettlements.map((s) =>
      s.from_user_id === user?.id ? s.to_user_id : s.from_user_id,
    )
    // Also allow manual selection of any member with opposing balance
    const otherMembers = members.filter((m) => m.user_id !== user?.id)

    const selectedMember = members.find((m) => m.user_id === selectedCounterparty)
    const counterBalance = Number(balance?.balances.find((b) => b.user_id === selectedCounterparty)?.net_amount ?? 0)
    const directionValid = (myNet < 0 && counterBalance > 0) || (myNet > 0 && counterBalance < 0)

    return (
      <>
        <PageHeader
          theme={theme}
          tall
          back={`/groups/${id}`}
          title="Settle up"
          subtitle="Record a payment within the group"
        />
        <FloatCard className="text-center">
          <p className={`text-sm font-semibold ${myNet < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            {myNet < 0 ? `You owe ${formatCurrency(Math.abs(myNet))} total` : `You are owed ${formatCurrency(myNet)} total`}
          </p>
          <AmountText amount={Math.abs(myNet)} tone={myNet < 0 ? 'owe' : 'owed'} size="xl" className="mt-1" />
        </FloatCard>

        <PageContent>
          {mySettlements.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-tertiary">Suggested settlements</p>
              {mySettlements.map((s, i) => {
                const isFrom = s.from_user_id === user?.id
                const counterparty = isFrom ? s.to_user_id : s.from_user_id
                const isSelected = selectedCounterparty === counterparty
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onCounterpartyChange(counterparty)}
                    className={`flex min-h-[44px] w-full items-center justify-between rounded-2xl border-[1.5px] p-3 text-left transition ${
                      isSelected
                        ? 'border-violet-400 bg-violet-50'
                        : 'border-line bg-white hover:border-ink-faint/60'
                    }`}
                  >
                    <span className="text-sm text-ink-secondary">
                      {isFrom ? 'You pay' : `${s.from_display_name} pays you`}
                      {isFrom && ` ${s.to_display_name}`}
                    </span>
                    <span className={`font-bold tabular-nums ${isFrom ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {formatCurrency(Number(s.amount))}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <Card className="space-y-4">
            <Field label="Settle with" htmlFor="settle-counterparty">
              <Select
                id="settle-counterparty"
                value={selectedCounterparty}
                onChange={(e) => onCounterpartyChange(e.target.value)}
              >
                <option value="">Select a person</option>
                {otherMembers.map((m) => {
                  const isSuggested = counterpartyIds.includes(m.user_id)
                  return (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name}{isSuggested ? ' (suggested)' : ''}
                    </option>
                  )
                })}
              </Select>
            </Field>
            <Field label="Settlement amount" htmlFor="settle-amount">
              <Input
                id="settle-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </Field>
            <Field label="Note (optional)" htmlFor="settle-note">
              <Input
                id="settle-note"
                placeholder="e.g. Venmo, cash, etc."
                maxLength={200}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            {selectedMember && directionValid && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">Summary</p>
                <p className="mt-1.5 text-sm text-ink-secondary">
                  {myNet < 0 ? 'You' : selectedMember.display_name} will pay{' '}
                  <span className="font-bold text-ink">{formatCurrency(Number(amount || 0))}</span>{' '}
                  to {myNet < 0 ? selectedMember.display_name : 'you'}
                </p>
              </div>
            )}
            <Button
              variant="accent"
              theme={theme}
              size="lg"
              className="w-full"
              onClick={onSubmit}
              disabled={isSubmitting || Number(amount) <= 0 || !selectedCounterparty || !directionValid}
            >
              {isSubmitting ? 'Recording...' : 'Record Settlement'}
            </Button>
          </Card>
        </PageContent>
      </>
    )
  }

  // --- 2-user settle UI ---
  const outstandingAmt = Math.abs(myNet)
  const whoOwes = iOwe ? 'You' : partner!.display_name
  const owedTo = iOwe ? partner!.display_name : 'you'
  const payerMember = iOwe ? members.find((m) => m.user_id === user?.id) : partner
  const payeeMember = iOwe ? partner : members.find((m) => m.user_id === user?.id)

  return (
    <>
      <PageHeader
        theme={theme}
        tall
        back={`/groups/${id}`}
        title="Settle up"
        subtitle={`with ${partner!.display_name}`}
      />
      <FloatCard className="text-center">
        <div className="mb-3 flex items-center justify-center gap-3.5">
          {payerMember && (
            <Avatar
              name={payerMember.display_name}
              src={payerMember.profile_picture}
              colorKey={payerMember.user_id}
              size="lg"
            />
          )}
          <ArrowRightIcon className="h-5 w-5 text-ink-faint" aria-hidden />
          {payeeMember && (
            <Avatar
              name={payeeMember.display_name}
              src={payeeMember.profile_picture}
              colorKey={payeeMember.user_id}
              size="lg"
            />
          )}
        </div>
        <p className="text-sm font-semibold text-ink-secondary">
          {whoOwes} owe{iOwe ? '' : 's'} {owedTo}
        </p>
        <AmountText amount={outstandingAmt} tone={iOwe ? 'owe' : 'owed'} size="xl" className="mt-1" />
      </FloatCard>

      <PageContent>
        <Card className="space-y-4">
          <Field label="Settlement amount" htmlFor="settle-amount-2u">
            <Input
              id="settle-amount-2u"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </Field>
          <Field label="Note (optional)" htmlFor="settle-note-2u">
            <Input
              id="settle-note-2u"
              placeholder="e.g. Venmo, cash, etc."
              maxLength={200}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">Summary</p>
            <p className="mt-1.5 text-sm text-ink-secondary">
              {iOwe ? 'You' : partner!.display_name} will pay{' '}
              <span className="font-bold text-ink">{formatCurrency(Number(amount || 0))}</span>{' '}
              to {iOwe ? partner!.display_name : 'you'}
            </p>
          </div>
          <Button
            variant="accent"
            theme={theme}
            size="lg"
            className="w-full"
            onClick={onSubmit}
            disabled={isSubmitting || Number(amount) <= 0}
          >
            {isSubmitting ? 'Recording...' : 'Record Settlement'}
          </Button>
        </Card>
      </PageContent>
    </>
  )
}
