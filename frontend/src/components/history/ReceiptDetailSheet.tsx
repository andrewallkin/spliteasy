import { useEffect, useMemo, useState } from 'react'

import {
  deleteReceipt,
  getGroupMembers,
  getReceiptItems,
  markReceiptPaid,
  patchReceipt,
  unmarkReceiptPaid,
  updateReceiptItems,
} from '@/api/groups'
import { api } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import type {
  GroupHistoryEntrySplitLine,
  GroupHistoryItem,
  GroupHistoryReceiptData,
  GroupMember,
  OCRLineItem,
} from '@/types/models'
import { DEFAULT_CURRENCY, formatCurrency } from '@/utils/currency'
import { getErrorMessage } from '@/utils/errors'

import type { RequestConfirm } from './historyFormat'
import { MarkPaidButtons, SplitLineRow } from './historyShared'

type ReceiptItemDraft = {
  key: string
  description: string
  quantity: string
  price_per_unit: string
  line_subtotal: string
  line_discount: string
  final_line_total: string
  confidence: number
  assignee: string
  isManual: boolean
}

function itemDraftFromOCR(item: OCRLineItem, index: number): ReceiptItemDraft {
  return {
    key: item.id || String(index),
    description: item.description,
    quantity: String(item.quantity ?? 1),
    price_per_unit: item.price_per_unit ?? item.amount,
    line_subtotal: item.line_subtotal ?? item.amount,
    line_discount: item.line_discount ?? '0.00',
    final_line_total: item.final_line_total ?? item.amount,
    confidence: item.confidence ?? 1,
    assignee: item.assignee ?? 'split',
    isManual: false,
  }
}

function blankReceiptItem(key: string): ReceiptItemDraft {
  return {
    key,
    description: '',
    quantity: '1',
    price_per_unit: '0.00',
    line_subtotal: '0.00',
    line_discount: '0.00',
    final_line_total: '0.00',
    confidence: 1,
    assignee: 'split',
    isManual: true,
  }
}

// ---------------------------------------------------------------------------
// ReceiptDetailModal
// ---------------------------------------------------------------------------

export function ReceiptDetailModal({
  isOpen,
  nickname,
  merchantName,
  totalAmount,
  currency,
  paidBy,
  items,
  members,
  isLoading,
  isSaving,
  isDeleting,
  onClose,
  onNicknameChange,
  onMerchantNameChange,
  onTotalAmountChange,
  onCurrencyChange,
  onPaidByChange,
  onItemChange,
  onItemDelete,
  onItemAdd,
  onSave,
  onDelete,
  receiptSplits,
  canMarkPaid,
  canUndoMarkPaid,
  hasPaidSplits,
  isMarkPaidLoading,
  onMarkPaid,
  onUnmarkPaid,
}: {
  isOpen: boolean
  nickname: string
  merchantName: string
  totalAmount: string
  currency: string
  paidBy: string
  items: ReceiptItemDraft[]
  members: GroupMember[]
  isLoading: boolean
  isSaving: boolean
  isDeleting: boolean
  onClose: () => void
  onNicknameChange: (v: string) => void
  onMerchantNameChange: (v: string) => void
  onTotalAmountChange: (v: string) => void
  onCurrencyChange: (v: string) => void
  onPaidByChange: (v: string) => void
  onItemChange: (key: string, patch: Partial<ReceiptItemDraft>) => void
  onItemDelete: (key: string) => void
  onItemAdd: () => void
  onSave: () => void
  onDelete: () => void
  receiptSplits?: GroupHistoryEntrySplitLine[]
  canMarkPaid?: boolean
  canUndoMarkPaid?: boolean
  hasPaidSplits?: boolean
  isMarkPaidLoading?: boolean
  onMarkPaid?: () => void
  onUnmarkPaid?: () => void
}) {
  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving && !isDeleting) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, isSaving, isDeleting, onClose])

  const me = members[0]
  const partner = members[1]

  const splitSummary = useMemo(() => {
    if (!me || !partner) return null
    let meShare = 0
    let partnerShare = 0
    for (const item of items) {
      const total = parseFloat(item.final_line_total) || 0
      if (item.assignee === me.user_id) {
        meShare += total
      } else if (item.assignee === partner.user_id) {
        partnerShare += total
      } else {
        meShare += total / 2
        partnerShare += total / 2
      }
    }

    let meOwes = meShare
    let partnerOwes = partnerShare
    if (paidBy === me.user_id) {
      meOwes = 0
    } else if (paidBy === partner.user_id) {
      partnerOwes = 0
    }

    return {
      meShare,
      partnerShare,
      meOwes,
      partnerOwes,
    }
  }, [items, me, paidBy, partner])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={() => { if (!isSaving && !isDeleting) onClose() }}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-surface-tertiary bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading ? (
          <div className="flex justify-center py-12"><LoadingSpinner /></div>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink">Receipt details</h3>
              </div>
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={isSaving || isDeleting}
                className="h-9 gap-1 rounded-xl px-3 text-xs"
              >
                <span aria-hidden="true" className="text-sm leading-none">×</span>
                <span>Close</span>
              </Button>
            </div>

            {/* Receipt-level fields */}
            <div className="space-y-3 rounded-3xl border border-surface-tertiary p-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Nickname</label>
                <Input value={nickname} onChange={(e) => onNicknameChange(e.target.value)} placeholder="e.g. Groceries" disabled={isSaving || isDeleting} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Merchant</label>
                <Input value={merchantName} onChange={(e) => onMerchantNameChange(e.target.value)} disabled={isSaving || isDeleting} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Total Amount</label>
                  <Input inputMode="decimal" value={totalAmount} onChange={(e) => onTotalAmountChange(e.target.value)} disabled={isSaving || isDeleting || hasPaidSplits} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Currency</label>
                  <Input value={currency} onChange={(e) => onCurrencyChange(e.target.value)} maxLength={6} disabled={isSaving || isDeleting} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Paid by</label>
                <select
                  value={paidBy}
                  onChange={(e) => onPaidByChange(e.target.value)}
                  disabled={isSaving || isDeleting || hasPaidSplits}
                  className="w-full rounded-2xl border border-surface-tertiary bg-surface-primary px-3 py-2 text-base text-ink shadow-soft focus:border-pastel-purple focus:outline-none disabled:opacity-60"
                >
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Line items */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-ink-tertiary">Line Items</h4>
              {items.map((item) => (
                <div
                  key={item.key}
                  className={`space-y-2 rounded-2xl border p-3 ${item.confidence > 0 && item.confidence < 0.85 ? 'border-pastel-peach/60 bg-orange-50/50' : 'border-ink-faint/30'}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => onItemChange(item.key, { description: e.target.value })}
                        disabled={isSaving || isDeleting}
                      />
                    </div>
                    {item.confidence > 0 && item.confidence < 0.85 && (
                      <span className="shrink-0 rounded-xl bg-orange-100 px-2 py-1 text-[10px] font-bold uppercase text-orange-600">?</span>
                    )}
                    <button
                      type="button"
                      onClick={() => onItemDelete(item.key)}
                      disabled={isSaving || isDeleting}
                      className="shrink-0 rounded-xl p-1.5 text-ink-faint transition hover:bg-surface-secondary hover:text-ink-secondary disabled:opacity-40"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Qty</label>
                      <Input inputMode="numeric" value={item.quantity} onChange={(e) => onItemChange(item.key, { quantity: e.target.value })} disabled={isSaving || isDeleting} />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Price/unit</label>
                      <Input inputMode="decimal" value={item.price_per_unit} onChange={(e) => onItemChange(item.key, { price_per_unit: e.target.value })} disabled={isSaving || isDeleting} />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Pre-Discount</label>
                      <Input inputMode="decimal" value={item.line_subtotal} onChange={(e) => onItemChange(item.key, { line_subtotal: e.target.value })} disabled={isSaving || isDeleting} readOnly={item.isManual} className={item.isManual ? 'bg-surface-secondary text-ink-tertiary' : ''} />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Discount</label>
                      <Input inputMode="decimal" value={item.line_discount} onChange={(e) => onItemChange(item.key, { line_discount: e.target.value })} disabled={isSaving || isDeleting} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">After Discount</label>
                      <Input inputMode="decimal" value={item.final_line_total} onChange={(e) => onItemChange(item.key, { final_line_total: e.target.value })} disabled={isSaving || isDeleting} readOnly={item.isManual} className={item.isManual ? 'bg-surface-secondary text-ink-tertiary' : ''} />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Assign to</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: me?.display_name ?? 'Me', value: me?.user_id ?? 'me' },
                        { label: 'Split', value: 'split' },
                        { label: partner?.display_name ?? 'Partner', value: partner?.user_id ?? 'partner' },
                      ].map(({ label, value }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => onItemChange(item.key, { assignee: value })}
                          disabled={isSaving || isDeleting}
                          className={`rounded-xl px-2 py-1.5 text-xs font-semibold transition-all disabled:opacity-60 ${
                            item.assignee === value
                              ? 'bg-pastel-purple-deep text-white'
                              : 'bg-surface-secondary text-ink-secondary hover:bg-surface-tertiary'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={onItemAdd}
                disabled={isSaving || isDeleting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-faint/30 py-2.5 text-sm font-medium text-ink-tertiary transition hover:border-pastel-purple/40 hover:text-ink-secondary disabled:opacity-40"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add item
              </button>
            </div>

            {/* Split summary */}
            {splitSummary && me && partner && (
              <div className="rounded-2xl bg-surface-secondary p-3 text-sm text-ink-secondary">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">Split Summary</p>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">Allocation</p>
                <div className="flex justify-between">
                  <span>{partner.display_name} share</span>
                  <span className="font-semibold tabular-nums text-ink">{formatCurrency(splitSummary.partnerShare, currency || DEFAULT_CURRENCY)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{me.display_name} share</span>
                  <span className="font-semibold tabular-nums text-ink">{formatCurrency(splitSummary.meShare, currency || DEFAULT_CURRENCY)}</span>
                </div>
                <p className="mb-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">Owes</p>
                <div className="flex justify-between">
                  <span>{partner.display_name} owes</span>
                  <span className="font-semibold tabular-nums text-ink">{formatCurrency(splitSummary.partnerOwes, currency || DEFAULT_CURRENCY)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{me.display_name} owes</span>
                  <span className="font-semibold tabular-nums text-ink">{formatCurrency(splitSummary.meOwes, currency || DEFAULT_CURRENCY)}</span>
                </div>
              </div>
            )}

            {receiptSplits && receiptSplits.length > 0 && (
              <div className="space-y-1 rounded-2xl bg-surface-secondary p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">Split</p>
                <ul className="space-y-0.5">
                  {receiptSplits.map((line) => (
                    <SplitLineRow
                      key={`${line.user_id ?? line.display_name}-${line.amount}`}
                      line={line}
                      currency={currency || undefined}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap justify-end gap-2">
              <MarkPaidButtons
                canMarkPaid={canMarkPaid}
                canUndo={canUndoMarkPaid}
                isLoading={isMarkPaidLoading}
                onMark={() => onMarkPaid?.()}
                onUndo={() => onUnmarkPaid?.()}
              />
              <Button
                variant="danger"
                onClick={onDelete}
                disabled={isSaving || isDeleting}
                className="h-10 rounded-xl px-4 text-xs"
              >
                {isDeleting ? 'Deleting...' : 'Delete Receipt'}
              </Button>
              <Button
                onClick={onSave}
                disabled={isSaving || isDeleting}
                className="h-10 rounded-xl px-4 text-xs"
              >
                {isSaving ? 'Saving...' : hasPaidSplits ? 'Save details' : 'Save Changes'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// useReceiptDetailModal
// ---------------------------------------------------------------------------

export function useReceiptDetailModal(
  loadHistory: () => Promise<void>,
  requestConfirm: RequestConfirm,
  onBalancesChanged?: () => void,
) {
  const { addToast } = useToast()
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [receiptId, setReceiptId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMarkPaidLoading, setIsMarkPaidLoading] = useState(false)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [items, setItems] = useState<ReceiptItemDraft[]>([])
  const [nickname, setNickname] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [currency, setCurrency] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [nextItemKey, setNextItemKey] = useState(0)
  const [canMarkPaid, setCanMarkPaid] = useState(false)
  const [myShareAmount, setMyShareAmount] = useState<string | null>(null)
  const [receiptSplits, setReceiptSplits] = useState<GroupHistoryEntrySplitLine[]>([])
  const [payerDisplayName, setPayerDisplayName] = useState<string | null>(null)

  async function openReceiptModal(item: GroupHistoryItem) {
    if (item.type !== 'receipt') return
    const data = item.data as GroupHistoryReceiptData
    setIsOpen(true)
    setIsLoading(true)
    setReceiptId(item.id)
    setGroupId(item.group_id)
    setNickname(data.nickname ?? '')
    setMerchantName(data.merchant_name ?? '')
    setTotalAmount(data.total_amount ?? '')
    setCurrency(data.currency ?? 'ZAR')
    setCanMarkPaid(Boolean(data.can_mark_paid))
    setMyShareAmount(data.my_share_amount ?? null)
    setReceiptSplits(data.splits ?? [])
    setPayerDisplayName(data.paid_by ?? null)

    try {
      const [ocrItems, groupMembers] = await Promise.all([
        getReceiptItems(item.id),
        getGroupMembers(item.group_id),
      ])
      setItems(ocrItems.map((it, i) => itemDraftFromOCR(it, i)))
      setNextItemKey(ocrItems.length)
      setMembers(groupMembers)
      const storedPaidBy = data.paid_by_user_id as string | null | undefined
      if (storedPaidBy) {
        setPaidBy(storedPaidBy)
      } else if (groupMembers.length > 0) {
        setPaidBy(groupMembers[0].user_id)
      }
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to load receipt details'))
    } finally {
      setIsLoading(false)
    }
  }

  function closeReceiptModal(force = false) {
    if (!force && (isSaving || isDeleting)) return
    setIsOpen(false)
    setReceiptId('')
    setGroupId('')
    setItems([])
    setMembers([])
    setCanMarkPaid(false)
    setMyShareAmount(null)
    setReceiptSplits([])
    setPayerDisplayName(null)
  }

  function onItemChange(key: string, patch: Partial<ReceiptItemDraft>) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it
        const next = { ...it, ...patch }
        if (next.isManual) {
          const qty = parseFloat(next.quantity) || 0
          const ppu = parseFloat(next.price_per_unit) || 0
          const disc = parseFloat(next.line_discount) || 0
          const sub = qty * ppu
          next.line_subtotal = sub.toFixed(2)
          next.final_line_total = (sub - disc).toFixed(2)
        }
        return next
      }),
    )
  }

  function onItemDelete(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key))
  }

  function onItemAdd() {
    const key = String(nextItemKey)
    setNextItemKey((k) => k + 1)
    setItems((prev) => [...prev, blankReceiptItem(key)])
  }

  async function onSave() {
    if (!receiptId) return
    setIsSaving(true)
    try {
      await patchReceipt(receiptId, {
        nickname: nickname || null,
        merchant_name: merchantName || null,
        total_amount: hasPaidSplits ? undefined : (totalAmount ? parseFloat(totalAmount) : null),
        currency: currency || null,
      })

      if (hasPaidSplits) {
        addToast('success', 'Receipt updated')
        await loadHistory()
        closeReceiptModal(true)
        return
      }

      // 2. Update line items
      const itemsPayload = items.map((item) => ({
        description: item.description || 'Item',
        amount: parseFloat(item.final_line_total) || 0,
        quantity: parseInt(item.quantity) || 1,
        price_per_unit: parseFloat(item.price_per_unit) || null,
        line_subtotal: parseFloat(item.line_subtotal) || null,
        line_discount: parseFloat(item.line_discount) || 0,
        final_line_total: parseFloat(item.final_line_total) || null,
      }))
      await updateReceiptItems(receiptId, { items: itemsPayload })

      // 3. Re-fetch saved items for IDs
      const savedItems = await getReceiptItems(receiptId)

      // 4. Re-assign using fresh IDs
      const me = members[0]
      const partner = members[1]
      if (me && partner && savedItems.length > 0 && paidBy) {
        const partnerId = paidBy === me.user_id ? partner.user_id : me.user_id
        const assignments = savedItems.map((saved, index) => {
          const draft = items[index]
          const assignee = draft?.assignee ?? 'split'
          if (assignee === me.user_id || assignee === partner.user_id) {
            return { line_item_id: saved.id, shares: [{ user_id: assignee, share_type: 'full' }] }
          }
          return {
            line_item_id: saved.id,
            shares: [
              { user_id: paidBy, share_type: 'equal' },
              { user_id: partnerId, share_type: 'equal' },
            ],
          }
        })
        await api.post(`/receipts/${receiptId}/assign`, { paid_by: paidBy, assignments })
      }

      addToast('success', 'Receipt updated')
      await loadHistory()
      closeReceiptModal(true)
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to save receipt'))
    } finally {
      setIsSaving(false)
    }
  }

  async function onDelete() {
    if (!receiptId) return
    const confirmed = await requestConfirm({
      title: 'Delete receipt?',
      message: 'Delete this receipt? This cannot be undone.',
      confirmLabel: 'Delete receipt',
    })
    if (!confirmed) return
    setIsDeleting(true)
    try {
      await deleteReceipt(receiptId)
      addToast('success', 'Receipt deleted')
      closeReceiptModal(true)
      await loadHistory()
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to delete receipt'))
    } finally {
      setIsDeleting(false)
    }
  }

  async function onMarkReceiptPaid() {
    if (!groupId || !receiptId) return
    const confirmed = await requestConfirm({
      title: 'Mark as paid?',
      message: `Record that you paid ${payerDisplayName ?? 'them'} ${formatCurrency(Number(myShareAmount ?? 0), currency || undefined)} for ${nickname || merchantName || 'this receipt'}?`,
      confirmLabel: 'Mark as paid',
    })
    if (!confirmed) return
    setIsMarkPaidLoading(true)
    try {
      const updated = await markReceiptPaid(groupId, receiptId)
      setCanMarkPaid(Boolean(updated.can_mark_paid))
      setMyShareAmount(updated.my_share_amount ?? null)
      setReceiptSplits(updated.splits.map((line) => ({
        user_id: line.user_id,
        display_name: line.display_name,
        amount: line.amount,
        is_paid: line.is_paid,
        paid_at: line.paid_at,
      })))
      addToast('success', 'Marked as paid')
      await loadHistory()
      onBalancesChanged?.()
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to mark as paid'))
    } finally {
      setIsMarkPaidLoading(false)
    }
  }

  async function onUnmarkReceiptPaid() {
    if (!groupId || !receiptId) return
    const confirmed = await requestConfirm({
      title: 'Undo paid?',
      message: 'Remove the paid record for your share on this receipt?',
      confirmLabel: 'Undo paid',
    })
    if (!confirmed) return
    setIsMarkPaidLoading(true)
    try {
      const updated = await unmarkReceiptPaid(groupId, receiptId)
      setCanMarkPaid(Boolean(updated.can_mark_paid))
      setMyShareAmount(updated.my_share_amount ?? null)
      setReceiptSplits(updated.splits.map((line) => ({
        user_id: line.user_id,
        display_name: line.display_name,
        amount: line.amount,
        is_paid: line.is_paid,
        paid_at: line.paid_at,
      })))
      addToast('success', 'Payment record removed')
      await loadHistory()
      onBalancesChanged?.()
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to undo paid'))
    } finally {
      setIsMarkPaidLoading(false)
    }
  }

  const canUndoMarkPaid = user
    ? receiptSplits.some((split) => split.user_id === user.id && split.is_paid === true)
    : false
  const hasPaidSplits = receiptSplits.some((split) => split.is_paid === true)

  return {
    isOpen,
    receiptId,
    groupId,
    isLoading,
    isSaving,
    isDeleting,
    isMarkPaidLoading,
    members,
    items,
    nickname,
    merchantName,
    totalAmount,
    currency,
    paidBy,
    receiptSplits,
    canMarkPaid,
    canUndoMarkPaid,
    myShareAmount,
    payerDisplayName,
    hasPaidSplits,
    nextItemKey,
    setNickname,
    setMerchantName,
    setTotalAmount,
    setCurrency,
    setPaidBy,
    openReceiptModal,
    closeReceiptModal,
    onItemChange,
    onItemDelete,
    onItemAdd,
    onSave,
    onDelete,
    onMarkReceiptPaid,
    onUnmarkReceiptPaid,
  }
}
