import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { createSettlement, getBalances, getGroupMembers, getSuggestedSettlements } from '@/api/groups'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import type { GroupBalanceResponse, GroupMember, SuggestedSettlement } from '@/types/models'
import { formatCurrency } from '@/utils/currency'
import { getErrorMessage } from '@/utils/errors'

export function SettlePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()
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
      <div className="space-y-4">
        <Card className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pastel-mint/30">
            <svg className="h-8 w-8 text-pastel-mint-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-ink">All Settled Up!</h2>
          <p className="text-sm text-ink-secondary">There are no outstanding balances.</p>
          <Button onClick={() => navigate(`/groups/${id}`)} className="w-full">
            Back to Group
          </Button>
        </Card>
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
        <p className="text-sm text-ink-secondary">Invite someone to this group first.</p>
        <Button onClick={() => navigate(`/groups/${id}`)}>Back to group</Button>
      </Card>
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
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-ink">Settle Up</h2>
          <p className="mt-0.5 text-sm text-ink-secondary">Record a payment within the group</p>
        </div>

        {/* Your net position */}
        <Card className={`${myNet < 0 ? 'border-pastel-rose/30 bg-rose-50/50' : 'border-pastel-mint/30 bg-emerald-50/50'}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${myNet < 0 ? 'bg-pastel-rose/30' : 'bg-pastel-mint/30'}`}>
              {myNet < 0 ? (
                <svg className="h-5 w-5 text-pastel-rose-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-pastel-mint-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                </svg>
              )}
            </div>
            <div>
              <p className={`text-sm font-semibold ${myNet < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {myNet < 0 ? `You owe ${formatCurrency(Math.abs(myNet))} total` : `You are owed ${formatCurrency(myNet)} total`}
              </p>
            </div>
          </div>
        </Card>

        {/* Suggested settlements */}
        {mySettlements.length > 0 && (
          <Card className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-tertiary">Suggested settlements</h3>
            {mySettlements.map((s, i) => {
              const isFrom = s.from_user_id === user?.id
              const counterparty = isFrom ? s.to_user_id : s.from_user_id
              const isSelected = selectedCounterparty === counterparty
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onCounterpartyChange(counterparty)}
                  className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                    isSelected
                      ? 'border-pastel-purple bg-pastel-lavender/20'
                      : 'border-ink-faint/30 hover:border-ink-faint/60'
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
          </Card>
        )}

        <Card className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Settle with</label>
            <select
              value={selectedCounterparty}
              onChange={(e) => onCounterpartyChange(e.target.value)}
              className="w-full rounded-2xl border border-surface-tertiary bg-surface-primary px-3 py-2.5 text-base text-ink shadow-soft focus:border-pastel-purple focus:outline-none"
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
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Settlement amount</label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Note (optional)</label>
            <Input
              placeholder="e.g. Venmo, cash, etc."
              maxLength={200}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {selectedMember && directionValid && (
            <div className="rounded-2xl bg-surface-secondary p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">Summary</p>
              <p className="mt-1.5 text-sm text-ink-secondary">
                {myNet < 0 ? 'You' : selectedMember.display_name} will pay{' '}
                <span className="font-bold text-ink">{formatCurrency(Number(amount || 0))}</span>{' '}
                to {myNet < 0 ? selectedMember.display_name : 'you'}
              </p>
            </div>
          )}
          <Button
            onClick={onSubmit}
            className="w-full"
            disabled={isSubmitting || Number(amount) <= 0 || !selectedCounterparty || !directionValid}
          >
            {isSubmitting ? 'Recording...' : 'Record Settlement'}
          </Button>
        </Card>
      </div>
    )
  }

  // --- 2-user settle UI (unchanged) ---
  const outstandingAmt = Math.abs(myNet)
  const whoOwes = iOwe ? 'You' : partner!.display_name
  const owedTo = iOwe ? partner!.display_name : 'you'

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink">Settle Up</h2>
        <p className="mt-0.5 text-sm text-ink-secondary">Record a payment between you and {partner!.display_name}</p>
      </div>

      <Card className={`${iOwe ? 'border-pastel-rose/30 bg-rose-50/50' : 'border-pastel-mint/30 bg-emerald-50/50'}`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iOwe ? 'bg-pastel-rose/30' : 'bg-pastel-mint/30'}`}>
            {iOwe ? (
              <svg className="h-5 w-5 text-pastel-rose-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-pastel-mint-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
              </svg>
            )}
          </div>
          <div>
            <p className={`text-sm font-semibold ${iOwe ? 'text-rose-700' : 'text-emerald-700'}`}>
              {whoOwes} owe{iOwe ? '' : 's'} {owedTo}
            </p>
            <p className={`text-lg font-bold ${iOwe ? 'text-rose-800' : 'text-emerald-800'}`}>
              {formatCurrency(outstandingAmt)}
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Settlement amount</label>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Note (optional)</label>
          <Input
            placeholder="e.g. Venmo, cash, etc."
            maxLength={200}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="rounded-2xl bg-surface-secondary p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">Summary</p>
          <p className="mt-1.5 text-sm text-ink-secondary">
            {iOwe ? 'You' : partner!.display_name} will pay{' '}
            <span className="font-bold text-ink">{formatCurrency(Number(amount || 0))}</span>{' '}
            to {iOwe ? partner!.display_name : 'you'}
          </p>
        </div>
        <Button
          onClick={onSubmit}
          className="w-full"
          disabled={isSubmitting || Number(amount) <= 0}
        >
          {isSubmitting ? 'Recording...' : 'Record Settlement'}
        </Button>
      </Card>
    </div>
  )
}
