import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  deleteEntry,
  deleteReceipt,
  getEntry,
  getGroupMembers,
  getHistory,
  getReceiptImageBlob,
  getReceiptItems,
  patchReceipt,
  updateEntry,
  updateReceiptItems,
} from '@/api/groups'
import { api } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useToast } from '@/context/ToastContext'
import { type ConfirmDialogOptions, useConfirmDialog } from '@/hooks/useConfirmDialog'
import type {
  GroupHistoryEntryData,
  GroupHistoryItem,
  GroupHistoryReceiptData,
  GroupMember,
  ManualEntryDetail,
  OCRLineItem,
} from '@/types/models'
import { DEFAULT_CURRENCY, formatCurrency } from '@/utils/currency'
import { getErrorMessage } from '@/utils/errors'

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

const typeBadge: Record<string, { bg: string; text: string; label: string }> = {
  receipt: { bg: 'bg-pastel-sky/30', text: 'text-blue-600', label: 'Receipt' },
  entry: { bg: 'bg-pastel-lavender/30', text: 'text-pastel-purple-deep', label: 'Expense' },
  settlement: { bg: 'bg-pastel-mint/30', text: 'text-emerald-600', label: 'Settlement' },
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
type RequestConfirm = (options: ConfirmDialogOptions) => Promise<boolean>

export function toSplitMode(value: string): SplitMode {
  if (value === 'equal' || value === 'full' || value === 'percentage') {
    return value
  }
  return 'equal'
}

function displayNameFor(userId: string, members: GroupMember[]) {
  return members.find((member) => member.user_id === userId)?.display_name ?? 'Unknown'
}

function splitTypeCaption(splitType: string | null | undefined) {
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

export function HistoryCard({
  item,
  showGroupName,
  onEntryClick,
  onReceiptClick,
  onReceiptImageClick,
}: {
  item: GroupHistoryItem
  showGroupName: boolean
  onEntryClick: (item: GroupHistoryItem) => void
  onReceiptClick: (item: GroupHistoryItem) => void
  onReceiptImageClick: (receiptId: string) => void
}) {
  const badge = typeBadge[item.type] ?? typeBadge.entry
  const data = item.data as Record<string, string | null | undefined>
  const entryData = item.type === 'entry' ? (item.data as GroupHistoryEntryData) : null
  const receiptData = item.type === 'receipt' ? (item.data as GroupHistoryReceiptData) : null
  const isEntry = item.type === 'entry'
  const isReceipt = item.type === 'receipt'
  const isClickable = isEntry || isReceipt
  const { imageUrl: receiptImageUrl, isLoading: isReceiptImageLoading } = useReceiptImageUrl(item.id, isReceipt)

  return (
    <Card
      className={`space-y-2.5 ${isClickable ? 'cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft-lg' : ''}`}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isEntry ? () => onEntryClick(item) : isReceipt ? () => onReceiptClick(item) : undefined}
      onKeyDown={isClickable ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          if (isEntry) onEntryClick(item)
          else onReceiptClick(item)
        }
      } : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <span className={`inline-block rounded-xl px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
          {showGroupName && (
            <p className="text-xs font-medium text-ink-tertiary">{item.group_name}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-ink-tertiary">{formatHistoryDate(item.timestamp)}</p>
          <p className="text-[10px] text-ink-faint">{formatHistoryTime(item.timestamp)}</p>
        </div>
      </div>

      {item.type === 'entry' && entryData && (
        <div className="space-y-1.5">
          <p className="font-semibold text-ink">{entryData.description || 'Expense'}</p>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">Total</span>
            <span className="text-xl font-bold text-ink">
              {formatCurrency(Number(entryData.total_amount || 0))}
            </span>
          </div>
          {entryData.created_by && (
            <p className="text-sm text-ink-secondary">
              <span className="font-semibold text-ink">Paid by </span>
              {entryData.created_by}
            </p>
          )}
          {entryData.splits && entryData.splits.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">Split</p>
              <ul className="space-y-0.5">
                {entryData.splits.map((line) => (
                  <li
                    key={`${line.display_name}-${line.amount}`}
                    className="flex justify-between gap-3 text-sm text-ink-secondary"
                  >
                    <span>{line.display_name}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-ink">
                      {formatCurrency(Number(line.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-ink-tertiary">{splitTypeCaption(entryData.split_type)}</p>
        </div>
      )}

      {item.type === 'receipt' && receiptData && (
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onReceiptImageClick(item.id)
            }}
            onKeyDown={(event) => event.stopPropagation()}
            className="group mt-0.5 h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-surface-tertiary bg-surface-secondary"
            aria-label="Open receipt image"
          >
            {receiptImageUrl ? (
              <img
                src={receiptImageUrl}
                alt="Receipt thumbnail"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] font-semibold text-ink-tertiary">
                {isReceiptImageLoading ? 'Loading...' : 'No image'}
              </div>
            )}
          </button>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="font-semibold text-ink">
              {receiptData.nickname || receiptData.merchant_name || 'Receipt'}
            </p>
            {receiptData.nickname && receiptData.merchant_name && (
              <p className="text-xs text-ink-tertiary">{receiptData.merchant_name}</p>
            )}
            {receiptData.total_amount && (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">Total</span>
                <span className="text-xl font-bold text-ink">
                  {formatCurrency(
                    Number(receiptData.total_amount),
                    typeof receiptData.currency === 'string' ? receiptData.currency : undefined,
                  )}
                </span>
              </div>
            )}
            {receiptData.paid_by && (
              <p className="text-sm text-ink-secondary">
                <span className="font-semibold text-ink">Paid by </span>
                {receiptData.paid_by}
              </p>
            )}
            {receiptData.splits && receiptData.splits.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">Split</p>
                <ul className="space-y-0.5">
                  {receiptData.splits.map((line) => (
                    <li
                      key={`${line.display_name}-${line.amount}`}
                      className="flex justify-between gap-3 text-sm text-ink-secondary"
                    >
                      <span>{line.display_name}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">
                        {formatCurrency(
                          Number(line.amount),
                          typeof receiptData.currency === 'string' ? receiptData.currency : undefined,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {receiptData.uploaded_by &&
              receiptData.paid_by &&
              receiptData.uploaded_by !== receiptData.paid_by && (
              <p className="text-xs text-ink-tertiary">Uploaded by {receiptData.uploaded_by}</p>
            )}
            {isReceipt && (
              <p className="text-[10px] text-ink-faint">Tap to view details</p>
            )}
          </div>
        </div>
      )}

      {item.type === 'settlement' && (
        <div>
          <p className="font-semibold text-ink">
            {data.paid_by} paid {data.paid_to}
          </p>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-xl font-bold text-pastel-mint-deep">
              {formatCurrency(Number(data.amount || 0))}
            </span>
            {data.notes && (
              <span className="text-xs text-ink-tertiary">{data.notes}</span>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function useReceiptImageUrl(receiptId: string, enabled = true) {
  const [result, setResult] = useState<{ receiptId: string; imageUrl: string | null } | null>(null)

  useEffect(() => {
    if (!enabled || !receiptId) return

    let cancelled = false

    void getReceiptImageBlob(receiptId)
      .then((blob) => {
        if (cancelled) return
        const nextUrl = URL.createObjectURL(blob)
        setResult((previous) => {
          if (previous?.imageUrl) {
            URL.revokeObjectURL(previous.imageUrl)
          }
          return { receiptId, imageUrl: nextUrl }
        })
      })
      .catch(() => {
        if (cancelled) return
        setResult((previous) => {
          if (previous?.imageUrl) {
            URL.revokeObjectURL(previous.imageUrl)
          }
          return { receiptId, imageUrl: null }
        })
      })

    return () => {
      cancelled = true
    }
  }, [receiptId, enabled])

  useEffect(() => {
    return () => {
      if (result?.imageUrl) {
        URL.revokeObjectURL(result.imageUrl)
      }
    }
  }, [result])

  const isLoading = enabled && Boolean(receiptId) && result?.receiptId !== receiptId
  const imageUrl = result?.receiptId === receiptId ? result.imageUrl : null

  return { imageUrl, isLoading }
}

export function ReceiptImageModal({
  isOpen,
  receiptId,
  onClose,
}: {
  isOpen: boolean
  receiptId: string
  onClose: () => void
}) {
  const { imageUrl, isLoading } = useReceiptImageUrl(receiptId, isOpen && Boolean(receiptId))

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-black shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/55 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-black/75"
        >
          Close
        </button>
        {imageUrl ? (
          <img src={imageUrl} alt="Receipt" className="max-h-[92vh] w-full object-contain" />
        ) : (
          <div className="flex h-[60vh] items-center justify-center text-sm text-white">
            {isLoading ? 'Loading image...' : 'Image unavailable'}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Receipt line item draft type used by the modal
// ---------------------------------------------------------------------------

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
                  <Input inputMode="decimal" value={totalAmount} onChange={(e) => onTotalAmountChange(e.target.value)} disabled={isSaving || isDeleting} />
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
                  disabled={isSaving || isDeleting}
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

            {/* Actions */}
            <div className="flex flex-wrap justify-end gap-2">
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
                {isSaving ? 'Saving...' : 'Save Changes'}
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

export function useReceiptDetailModal(loadHistory: () => Promise<void>, requestConfirm: RequestConfirm) {
  const { addToast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [receiptId, setReceiptId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [items, setItems] = useState<ReceiptItemDraft[]>([])
  const [nickname, setNickname] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [currency, setCurrency] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [nextItemKey, setNextItemKey] = useState(0)

  async function openReceiptModal(item: GroupHistoryItem) {
    if (item.type !== 'receipt') return
    const data = item.data as Record<string, string | null | undefined>
    setIsOpen(true)
    setIsLoading(true)
    setReceiptId(item.id)
    setGroupId(item.group_id)
    setNickname(data.nickname ?? '')
    setMerchantName(data.merchant_name ?? '')
    setTotalAmount(data.total_amount ?? '')
    setCurrency(data.currency ?? 'ZAR')

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
      // 1. Patch receipt-level fields
      await patchReceipt(receiptId, {
        nickname: nickname || null,
        merchant_name: merchantName || null,
        total_amount: totalAmount ? parseFloat(totalAmount) : null,
        currency: currency || null,
      })

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

  return {
    isOpen,
    receiptId,
    groupId,
    isLoading,
    isSaving,
    isDeleting,
    members,
    items,
    nickname,
    merchantName,
    totalAmount,
    currency,
    paidBy,
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
  }
}

// ---------------------------------------------------------------------------
// EntryDetailModal (unchanged)
// ---------------------------------------------------------------------------

export function EntryDetailModal({
  isOpen,
  entry,
  members,
  isLoading,
  isSaving,
  isDeleting,
  canEdit,
  descriptionDraft,
  amountDraft,
  splitMode,
  paidBy,
  fullSplitUserId,
  firstUserPercentage,
  onClose,
  onDescriptionChange,
  onAmountChange,
  onSplitModeChange,
  onPaidByChange,
  onFullSplitUserIdChange,
  onFirstUserPercentageChange,
  onSave,
  onDelete,
}: {
  isOpen: boolean
  entry: ManualEntryDetail | null
  members: GroupMember[]
  isLoading: boolean
  isSaving: boolean
  isDeleting: boolean
  canEdit: boolean
  descriptionDraft: string
  amountDraft: string
  splitMode: SplitMode
  paidBy: string
  fullSplitUserId: string
  firstUserPercentage: number
  onClose: () => void
  onDescriptionChange: (value: string) => void
  onAmountChange: (value: string) => void
  onSplitModeChange: (value: SplitMode) => void
  onPaidByChange: (value: string) => void
  onFullSplitUserIdChange: (value: string) => void
  onFirstUserPercentageChange: (value: number) => void
  onSave: () => void
  onDelete: () => void
}) {
  useEffect(() => {
    if (!isOpen) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving && !isDeleting) {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, isSaving, isDeleting, onClose])

  if (!isOpen) {
    return null
  }

  const parsedAmount = Number(amountDraft) || 0
  const secondUser = members[1]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={() => {
        if (!isSaving && !isDeleting) {
          onClose()
        }
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-surface-tertiary bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : !entry ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-ink-secondary">Expense could not be loaded.</p>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink">Expense details</h3>
                <p className="text-xs text-ink-tertiary">
                  Created {formatHistoryDate(entry.created_at)} at {formatHistoryTime(entry.created_at)}
                </p>
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

            <div className="space-y-4 rounded-3xl border border-surface-tertiary bg-white p-4 shadow-sm">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
                  Description
                </label>
                <Input
                  value={descriptionDraft}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                  maxLength={200}
                  disabled={!canEdit || isSaving || isDeleting}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
                  Amount
                </label>
                <Input
                  value={amountDraft}
                  onChange={(event) => onAmountChange(event.target.value)}
                  inputMode="decimal"
                  disabled={!canEdit || isSaving || isDeleting}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
                  Paid by
                </label>
                <select
                  value={paidBy}
                  onChange={(event) => onPaidByChange(event.target.value)}
                  disabled={!canEdit || isSaving || isDeleting}
                  className="w-full rounded-2xl border border-surface-tertiary bg-surface-primary px-3 py-2 text-base text-ink shadow-soft focus:border-pastel-purple focus:outline-none disabled:opacity-60"
                >
                  {members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
                  Split mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'equal' as const, label: 'Equal' },
                    { key: 'full' as const, label: 'Full' },
                    { key: 'percentage' as const, label: 'Custom %' },
                  ]).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onSplitModeChange(key)}
                      disabled={!canEdit || isSaving || isDeleting}
                      className={`rounded-2xl border-2 px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                        splitMode === key
                          ? 'border-pastel-purple bg-pastel-lavender/20 text-pastel-purple-deep'
                          : 'border-ink-faint/30 bg-surface-secondary text-ink-secondary hover:border-ink-faint/60'
                      } disabled:opacity-60`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {splitMode === 'full' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
                    Who owes full amount
                  </label>
                  <select
                    value={fullSplitUserId}
                    onChange={(event) => onFullSplitUserIdChange(event.target.value)}
                    disabled={!canEdit || isSaving || isDeleting}
                    className="w-full rounded-2xl border border-surface-tertiary bg-surface-primary px-3 py-2 text-base text-ink shadow-soft focus:border-pastel-purple focus:outline-none disabled:opacity-60"
                  >
                    {members
                      .filter((member) => member.user_id !== paidBy)
                      .map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.display_name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {splitMode === 'percentage' && members.length >= 2 && secondUser && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
                    Percentage split
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={99}
                    step={1}
                    value={firstUserPercentage}
                    onChange={(event) => onFirstUserPercentageChange(Number(event.target.value))}
                    disabled={!canEdit || isSaving || isDeleting}
                    className="w-full accent-pastel-purple-deep disabled:opacity-60"
                  />
                  <div className="flex justify-between text-sm">
                    <span className="text-ink-secondary">
                      {members[0]?.display_name}: <span className="font-semibold text-ink">{firstUserPercentage}%</span>
                    </span>
                    <span className="text-ink-secondary">
                      {secondUser.display_name}: <span className="font-semibold text-ink">{100 - firstUserPercentage}%</span>
                    </span>
                  </div>
                </div>
              )}

              <div className="rounded-2xl bg-surface-secondary p-3 text-sm text-ink-secondary">
                <p>
                  <span className="font-semibold text-ink">Paid by:</span> {displayNameFor(paidBy, members)}
                </p>
                <p>
                  <span className="font-semibold text-ink">Amount:</span> {formatCurrency(parsedAmount)}
                </p>
                {entry.splits.length > 0 && (
                  <div className="mt-2 border-t border-ink-faint/20 pt-2">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">Split</p>
                    <ul className="space-y-0.5">
                      {[...entry.splits]
                        .sort((a, b) =>
                          displayNameFor(a.user_id, members).localeCompare(displayNameFor(b.user_id, members)),
                        )
                        .map((split) => (
                          <li key={split.user_id} className="flex justify-between gap-2">
                            <span>{displayNameFor(split.user_id, members)}</span>
                            <span className="font-semibold tabular-nums text-ink">
                              {formatCurrency(Number(split.amount))}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="danger"
                onClick={onDelete}
                disabled={!canEdit || isSaving || isDeleting}
                className="h-10 rounded-xl px-4 text-xs"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
              <Button
                onClick={onSave}
                disabled={!canEdit || isSaving || isDeleting || !descriptionDraft.trim() || parsedAmount <= 0}
                className="h-10 rounded-xl px-4 text-xs"
              >
                {isSaving ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function useExpenseEntryModal(loadHistory: () => Promise<void>, requestConfirm: RequestConfirm) {
  const { addToast } = useToast()
  const [selectedEntryRef, setSelectedEntryRef] = useState<{ groupId: string; entryId: string } | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<ManualEntryDetail | null>(null)
  const [entryMembers, setEntryMembers] = useState<GroupMember[]>([])
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false)
  const [isEntryLoading, setIsEntryLoading] = useState(false)
  const [isSavingEntry, setIsSavingEntry] = useState(false)
  const [isDeletingEntry, setIsDeletingEntry] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [amountDraft, setAmountDraft] = useState('')
  const [paidByDraft, setPaidByDraft] = useState('')
  const [splitModeDraft, setSplitModeDraft] = useState<SplitMode>('equal')
  const [fullSplitUserIdDraft, setFullSplitUserIdDraft] = useState('')
  const [firstUserPercentageDraft, setFirstUserPercentageDraft] = useState(50)

  useEffect(() => {
    if (!selectedEntry || entryMembers.length === 0) {
      return
    }

    setDescriptionDraft(selectedEntry.description)
    setAmountDraft(selectedEntry.total_amount)
    setPaidByDraft(selectedEntry.created_by)

    const splitMode = toSplitMode(selectedEntry.split_type)
    setSplitModeDraft(splitMode)

    if (splitMode === 'full') {
      const splitUser = selectedEntry.splits[0]?.user_id ?? entryMembers.find((member) => member.user_id !== selectedEntry.created_by)?.user_id ?? ''
      setFullSplitUserIdDraft(splitUser)
    } else {
      setFullSplitUserIdDraft('')
    }

    if (splitMode === 'percentage' && entryMembers.length >= 2) {
      const firstMember = entryMembers[0]
      const firstSplit = selectedEntry.splits.find((split) => split.user_id === firstMember.user_id)
      if (firstSplit?.percentage != null) {
        setFirstUserPercentageDraft(Math.max(1, Math.min(99, Number(firstSplit.percentage))))
      } else {
        const total = Number(selectedEntry.total_amount) || 0
        const share = Number(firstSplit?.amount ?? 0)
        const percent = total > 0 ? Math.round((share / total) * 100) : 50
        setFirstUserPercentageDraft(Math.max(1, Math.min(99, percent)))
      }
    } else {
      setFirstUserPercentageDraft(50)
    }
  }, [selectedEntry, entryMembers])

  const canEdit = useMemo(() => {
    return Boolean(selectedEntry && selectedEntryRef && entryMembers.length > 0)
  }, [selectedEntry, selectedEntryRef, entryMembers.length])

  async function openEntryModal(item: GroupHistoryItem) {
    if (item.type !== 'entry') {
      return
    }
    setIsEntryModalOpen(true)
    setIsEntryLoading(true)
    const nextRef = { groupId: item.group_id, entryId: item.id }
    setSelectedEntryRef(nextRef)

    try {
      const [entry, members] = await Promise.all([
        getEntry(item.group_id, item.id),
        getGroupMembers(item.group_id),
      ])
      setSelectedEntry(entry)
      setEntryMembers(members)
    } catch (error) {
      setSelectedEntry(null)
      setEntryMembers([])
      addToast('error', getErrorMessage(error, 'Unable to load expense details'))
    } finally {
      setIsEntryLoading(false)
    }
  }

  function closeEntryModal(force = false) {
    if (!force && (isSavingEntry || isDeletingEntry)) {
      return
    }
    setIsEntryModalOpen(false)
    setSelectedEntryRef(null)
    setSelectedEntry(null)
    setEntryMembers([])
  }

  async function onSaveEntry() {
    if (!selectedEntryRef || !selectedEntry) {
      return
    }
    if (!descriptionDraft.trim()) {
      addToast('error', 'Description is required')
      return
    }
    const parsedAmount = Number(amountDraft)
    if (parsedAmount <= 0) {
      addToast('error', 'Amount must be positive')
      return
    }
    if (entryMembers.length < 2 && splitModeDraft !== 'equal') {
      addToast('error', 'This split mode requires at least two members')
      return
    }

    let splits: Array<{ user_id: string; percentage?: number }> = []
    if (splitModeDraft === 'full') {
      if (!fullSplitUserIdDraft || fullSplitUserIdDraft === paidByDraft) {
        addToast('error', 'Pick another member to owe the full amount')
        return
      }
      splits = [{ user_id: fullSplitUserIdDraft }]
    } else if (splitModeDraft === 'percentage') {
      const firstUser = entryMembers[0]
      const secondUser = entryMembers[1]
      if (!firstUser || !secondUser) {
        addToast('error', 'Percentage split requires two members')
        return
      }
      splits = [
        { user_id: firstUser.user_id, percentage: firstUserPercentageDraft },
        { user_id: secondUser.user_id, percentage: 100 - firstUserPercentageDraft },
      ]
    }

    setIsSavingEntry(true)
    try {
      await updateEntry(selectedEntryRef.groupId, selectedEntryRef.entryId, {
        description: descriptionDraft.trim(),
        total_amount: parsedAmount,
        split_type: splitModeDraft,
        paid_by: paidByDraft,
        splits,
      })
      addToast('success', 'Expense updated')
      await loadHistory()
      closeEntryModal(true)
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to update expense'))
    } finally {
      setIsSavingEntry(false)
    }
  }

  async function onDeleteSelectedEntry() {
    if (!selectedEntryRef) {
      return
    }
    const confirmed = await requestConfirm({
      title: 'Delete expense?',
      message: 'Delete this expense? This cannot be undone.',
      confirmLabel: 'Delete expense',
    })
    if (!confirmed) {
      return
    }

    setIsDeletingEntry(true)
    try {
      await deleteEntry(selectedEntryRef.groupId, selectedEntryRef.entryId)
      addToast('success', 'Expense deleted')
      closeEntryModal(true)
      await loadHistory()
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to delete expense'))
    } finally {
      setIsDeletingEntry(false)
    }
  }

  return {
    isEntryModalOpen,
    selectedEntry,
    entryMembers,
    isEntryLoading,
    isSavingEntry,
    isDeletingEntry,
    canEdit,
    descriptionDraft,
    amountDraft,
    splitModeDraft,
    paidByDraft,
    fullSplitUserIdDraft,
    firstUserPercentageDraft,
    setDescriptionDraft,
    setAmountDraft,
    setSplitModeDraft,
    setPaidByDraft,
    setFullSplitUserIdDraft,
    setFirstUserPercentageDraft,
    openEntryModal,
    closeEntryModal,
    onSaveEntry,
    onDeleteSelectedEntry,
  }
}

type GroupScopedHistoryProps = {
  groupId: string
  variant: 'page' | 'embedded'
}

export function GroupScopedHistory({ groupId, variant }: GroupScopedHistoryProps) {
  const [filter, setFilter] = useState<(typeof historyFilters)[number]>('all')
  const [items, setItems] = useState<GroupHistoryItem[]>([])
  const [imageModalReceiptId, setImageModalReceiptId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const { addToast } = useToast()
  const deleteConfirm = useConfirmDialog()

  const loadHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      setItems(await getHistory(groupId, filter === 'all' ? undefined : filter))
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to load history'))
    } finally {
      setIsLoading(false)
    }
  }, [groupId, filter, addToast])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const entryModal = useExpenseEntryModal(loadHistory, deleteConfirm.confirm)
  const receiptModal = useReceiptDetailModal(loadHistory, deleteConfirm.confirm)

  return (
    <div className="space-y-4">
      {variant === 'page' ? (
        <div>
          <h2 className="text-xl font-bold text-ink">History</h2>
          <p className="mt-0.5 text-sm text-ink-secondary">All transactions in this group</p>
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-bold text-ink">Transactions</h3>
          <p className="mt-0.5 text-xs text-ink-secondary">All activity in this group</p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {historyFilters.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`shrink-0 rounded-2xl px-4 py-2 text-xs font-semibold transition-all duration-200 ${
              filter === value
                ? 'bg-gradient-to-r from-pastel-purple to-pastel-purple-deep text-white shadow-soft'
                : 'bg-surface-secondary text-ink-secondary hover:bg-surface-tertiary'
            }`}
          >
            {historyFilterLabels[value]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : items.length === 0 ? (
        <Card className="py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-secondary">
            <svg className="h-6 w-6 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink-secondary">No history yet</p>
          <p className="mt-0.5 text-xs text-ink-tertiary">Transactions will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <HistoryCard
              key={`${item.group_id}-${item.type}-${item.id}`}
              item={item}
              showGroupName={false}
              onEntryClick={entryModal.openEntryModal}
              onReceiptClick={receiptModal.openReceiptModal}
              onReceiptImageClick={setImageModalReceiptId}
            />
          ))}
        </div>
      )}

      <EntryDetailModal
        isOpen={entryModal.isEntryModalOpen}
        entry={entryModal.selectedEntry}
        members={entryModal.entryMembers}
        isLoading={entryModal.isEntryLoading}
        isSaving={entryModal.isSavingEntry}
        isDeleting={entryModal.isDeletingEntry}
        canEdit={entryModal.canEdit}
        descriptionDraft={entryModal.descriptionDraft}
        amountDraft={entryModal.amountDraft}
        splitMode={entryModal.splitModeDraft}
        paidBy={entryModal.paidByDraft}
        fullSplitUserId={entryModal.fullSplitUserIdDraft}
        firstUserPercentage={entryModal.firstUserPercentageDraft}
        onClose={entryModal.closeEntryModal}
        onDescriptionChange={entryModal.setDescriptionDraft}
        onAmountChange={entryModal.setAmountDraft}
        onSplitModeChange={(value) => {
          entryModal.setSplitModeDraft(value)
          if (value === 'full' && entryModal.entryMembers.length > 0) {
            const fallback = entryModal.entryMembers.find((member) => member.user_id !== entryModal.paidByDraft)?.user_id ?? ''
            entryModal.setFullSplitUserIdDraft(fallback)
          }
        }}
        onPaidByChange={(value) => {
          entryModal.setPaidByDraft(value)
          if (entryModal.splitModeDraft === 'full') {
            const fallback = entryModal.entryMembers.find((member) => member.user_id !== value)?.user_id ?? ''
            entryModal.setFullSplitUserIdDraft(fallback)
          }
        }}
        onFullSplitUserIdChange={entryModal.setFullSplitUserIdDraft}
        onFirstUserPercentageChange={(value) => entryModal.setFirstUserPercentageDraft(Math.max(1, Math.min(99, value)))}
        onSave={entryModal.onSaveEntry}
        onDelete={entryModal.onDeleteSelectedEntry}
      />

      <ReceiptDetailModal
        isOpen={receiptModal.isOpen}
        nickname={receiptModal.nickname}
        merchantName={receiptModal.merchantName}
        totalAmount={receiptModal.totalAmount}
        currency={receiptModal.currency}
        paidBy={receiptModal.paidBy}
        items={receiptModal.items}
        members={receiptModal.members}
        isLoading={receiptModal.isLoading}
        isSaving={receiptModal.isSaving}
        isDeleting={receiptModal.isDeleting}
        onClose={receiptModal.closeReceiptModal}
        onNicknameChange={receiptModal.setNickname}
        onMerchantNameChange={receiptModal.setMerchantName}
        onTotalAmountChange={receiptModal.setTotalAmount}
        onCurrencyChange={receiptModal.setCurrency}
        onPaidByChange={receiptModal.setPaidBy}
        onItemChange={receiptModal.onItemChange}
        onItemDelete={receiptModal.onItemDelete}
        onItemAdd={receiptModal.onItemAdd}
        onSave={receiptModal.onSave}
        onDelete={receiptModal.onDelete}
      />
      <ReceiptImageModal
        isOpen={Boolean(imageModalReceiptId)}
        receiptId={imageModalReceiptId}
        onClose={() => setImageModalReceiptId('')}
      />
      <ConfirmDialog
        {...deleteConfirm.dialogProps}
        isLoading={entryModal.isDeletingEntry || receiptModal.isDeleting}
      />
    </div>
  )
}
