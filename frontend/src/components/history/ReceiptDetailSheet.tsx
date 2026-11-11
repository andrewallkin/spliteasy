import { useMemo, useState } from 'react'

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
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Field, microLabelClassName } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { PlusIcon, TrashIcon, WarningIcon } from '@/components/ui/icons'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/Select'
import { TypeBadge } from '@/components/ui/TypeBadge'
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

import { formatHistoryDate, formatHistoryTime, type RequestConfirm } from './historyFormat'
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
  historyItem,
  currentUserId,
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
  historyItem?: GroupHistoryItem | null
  currentUserId?: string
}) {
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

  const receiptHistory = historyItem?.type === 'receipt' ? (historyItem.data as GroupHistoryReceiptData) : null
  const paidByLabel = receiptHistory?.paid_by ?? members.find((m) => m.user_id === paidBy)?.display_name ?? ''
  const assignOptions = [
    { value: me?.user_id ?? 'me', label: me?.display_name ?? 'Me' },
    { value: 'split', label: 'Split' },
    { value: partner?.user_id ?? 'partner', label: partner?.display_name ?? 'Partner' },
  ]

  const footer = !isLoading ? (
    <div className="flex flex-wrap justify-end gap-2">
      <MarkPaidButtons
        canMarkPaid={canMarkPaid}
        canUndo={canUndoMarkPaid}
        isLoading={isMarkPaidLoading}
        onMark={() => onMarkPaid?.()}
        onUndo={() => onUnmarkPaid?.()}
      />
      <Button variant="soft-danger" onClick={onDelete} disabled={isSaving || isDeleting} size="sm">
        {isDeleting ? 'Deleting...' : 'Delete Receipt'}
      </Button>
      <Button variant="dark" onClick={onSave} disabled={isSaving || isDeleting} size="sm">
        {isSaving ? 'Saving...' : hasPaidSplits ? 'Save details' : 'Save Changes'}
      </Button>
    </div>
  ) : undefined

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Receipt details" closeDisabled={isSaving || isDeleting} footer={footer}>
      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-3xl border-[1.5px] border-line bg-surface-secondary/50 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TypeBadge kind="receipt" />
              {historyItem && (
                <span className="text-xs text-ink-tertiary">
                  {formatHistoryDate(historyItem.timestamp)} · {formatHistoryTime(historyItem.timestamp)}
                </span>
              )}
            </div>
            {paidByLabel && (
              <p className="text-sm text-ink-secondary">
                <span className="font-bold text-ink">Paid by </span>
                {paidByLabel}
              </p>
            )}
            {receiptHistory?.uploaded_by &&
              receiptHistory.paid_by &&
              receiptHistory.uploaded_by !== receiptHistory.paid_by && (
                <p className="mt-1 text-xs text-ink-tertiary">Uploaded by {receiptHistory.uploaded_by}</p>
            )}
            {receiptSplits && receiptSplits.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-3">
                {receiptSplits.map((line) => (
                  <SplitLineRow
                    key={`${line.user_id ?? line.display_name}-${line.amount}`}
                    line={line}
                    currency={currency || undefined}
                    currentUserId={currentUserId}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <Field label="Nickname" htmlFor="receiptNickname">
              <Input id="receiptNickname" value={nickname} onChange={(e) => onNicknameChange(e.target.value)} placeholder="e.g. Groceries" disabled={isSaving || isDeleting} />
            </Field>
            <Field label="Merchant" htmlFor="receiptMerchant">
              <Input id="receiptMerchant" value={merchantName} onChange={(e) => onMerchantNameChange(e.target.value)} disabled={isSaving || isDeleting} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total Amount" htmlFor="receiptTotal">
                <Input id="receiptTotal" inputMode="decimal" value={totalAmount} onChange={(e) => onTotalAmountChange(e.target.value)} disabled={isSaving || isDeleting || hasPaidSplits} />
              </Field>
              <Field label="Currency" htmlFor="receiptCurrency">
                <Input id="receiptCurrency" value={currency} onChange={(e) => onCurrencyChange(e.target.value)} maxLength={6} disabled={isSaving || isDeleting} />
              </Field>
            </div>
            <Field label="Paid by" htmlFor="receiptPaidBy">
              <Select id="receiptPaidBy" value={paidBy} onChange={(e) => onPaidByChange(e.target.value)} disabled={isSaving || isDeleting || hasPaidSplits}>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="space-y-3">
            <h4 className={microLabelClassName}>Line Items</h4>
            {items.map((item) => {
              const uncertain = item.confidence > 0 && item.confidence < 0.85
              return (
                <div
                  key={item.key}
                  className={`space-y-3 rounded-[20px] border-[1.5px] p-3 ${uncertain ? 'border-orange-200 bg-orange-50/60' : 'border-line bg-white'}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => onItemChange(item.key, { description: e.target.value })}
                        disabled={isSaving || isDeleting}
                      />
                    </div>
                    {uncertain && (
                      <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-orange-600">
                        <WarningIcon className="h-4 w-4" />
                        Uncertain
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onItemDelete(item.key)}
                      disabled={isSaving || isDeleting}
                      aria-label="Delete line item"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-ink-tertiary transition hover:bg-surface-secondary hover:text-ink disabled:opacity-40"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Qty">
                      <Input inputMode="numeric" value={item.quantity} onChange={(e) => onItemChange(item.key, { quantity: e.target.value })} disabled={isSaving || isDeleting} />
                    </Field>
                    <Field label="Price/unit">
                      <Input inputMode="decimal" value={item.price_per_unit} onChange={(e) => onItemChange(item.key, { price_per_unit: e.target.value })} disabled={isSaving || isDeleting} />
                    </Field>
                    <Field label="Pre-Discount">
                      <Input inputMode="decimal" value={item.line_subtotal} onChange={(e) => onItemChange(item.key, { line_subtotal: e.target.value })} disabled={isSaving || isDeleting} readOnly={item.isManual} className={item.isManual ? 'bg-surface-secondary text-ink-tertiary' : ''} />
                    </Field>
                    <Field label="Discount">
                      <Input inputMode="decimal" value={item.line_discount} onChange={(e) => onItemChange(item.key, { line_discount: e.target.value })} disabled={isSaving || isDeleting} />
                    </Field>
                    <Field label="After Discount" className="col-span-2">
                      <Input inputMode="decimal" value={item.final_line_total} onChange={(e) => onItemChange(item.key, { final_line_total: e.target.value })} disabled={isSaving || isDeleting} readOnly={item.isManual} className={item.isManual ? 'bg-surface-secondary text-ink-tertiary' : ''} />
                    </Field>
                  </div>

                  <Field label="Assign to">
                    <SegmentedControl
                      value={item.assignee}
                      onChange={(value) => onItemChange(item.key, { assignee: value })}
                      options={assignOptions}
                      disabled={isSaving || isDeleting}
                      size="sm"
                    />
                  </Field>
                </div>
              )
            })}

            <button
              type="button"
              onClick={onItemAdd}
              disabled={isSaving || isDeleting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-3 text-sm font-bold text-ink-tertiary transition hover:border-violet-200 hover:text-ink-secondary disabled:opacity-40"
            >
              <PlusIcon className="h-4 w-4" />
              Add item
            </button>
          </div>

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
        </div>
      )}
    </BottomSheet>
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
