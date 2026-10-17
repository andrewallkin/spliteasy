import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

import {
  deleteEntry,
  deleteReceipt,
  getEntry,
  getGroupMembers,
  getHistory,
  getReceiptImageBlob,
  getReceiptItems,
  markEntryPaid,
  markReceiptPaid,
  patchReceipt,
  unmarkEntryPaid,
  unmarkReceiptPaid,
  updateEntry,
  updateReceiptItems,
} from '@/api/groups'
import { api } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { type ConfirmDialogOptions, useConfirmDialog } from '@/hooks/useConfirmDialog'
import type {
  GroupHistoryEntryData,
  GroupHistoryEntrySplitLine,
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

function SplitLineRow({
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

function MarkPaidButtons({
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

function entryHasPaidSplits(entry: ManualEntryDetail | null): boolean {
  return Boolean(entry?.splits.some((split) => split.is_paid === true))
}

function useReceiptImageBlobs(receiptId: string, imageCount: number, enabled: boolean) {
  const [blobUrls, setBlobUrls] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !receiptId || imageCount < 1) {
      let resetCancelled = false
      void Promise.resolve().then(() => {
        if (!resetCancelled) {
          setBlobUrls([])
          setIsLoading(false)
        }
      })
      return () => {
        resetCancelled = true
      }
    }

    let cancelled = false
    const created: string[] = []

    void Promise.resolve().then(() => {
      if (!cancelled) setIsLoading(true)
    })

    void Promise.all(
      Array.from({ length: imageCount }, (_, i) =>
        getReceiptImageBlob(receiptId, i).then((blob) => {
          if (cancelled) return null
          const u = URL.createObjectURL(blob)
          created.push(u)
          return u
        }),
      ),
    )
      .then((urls) => {
        if (cancelled) {
          created.forEach((u) => URL.revokeObjectURL(u))
          return
        }
        const filtered = urls.filter((u): u is string => u !== null)
        setBlobUrls(filtered)
      })
      .catch(() => {
        if (cancelled) return
        created.forEach((u) => URL.revokeObjectURL(u))
        setBlobUrls([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
      created.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [receiptId, imageCount, enabled])

  return { blobUrls, isLoading }
}

type ReceiptImageCarouselHandle = {
  goPrev: () => void
  goNext: () => void
}

const ReceiptImageCarousel = forwardRef<ReceiptImageCarouselHandle, {
  receiptId: string
  imageCount: number
  imageUrls?: string[]
  variant: 'thumb' | 'modal'
  enabled?: boolean
}>(function ReceiptImageCarousel({
  receiptId,
  imageCount,
  imageUrls,
  variant,
  enabled = true,
}, ref) {
  const signedUrls = (imageUrls ?? []).filter(Boolean)
  const shouldFetch = enabled && Boolean(receiptId) && signedUrls.length === 0
  const { blobUrls, isLoading } = useReceiptImageBlobs(receiptId, imageCount, shouldFetch)
  const displayUrls = signedUrls.length > 0 ? signedUrls : blobUrls
  const count = Math.max(1, signedUrls.length || imageCount)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const w = el.clientWidth
    const idx = Math.round(el.scrollLeft / Math.max(w, 1))
    setCurrentIndex(Math.min(Math.max(0, idx), count - 1))
  }, [count])

  const jumpToIndex = useCallback((nextIndex: number) => {
    const el = scrollRef.current
    if (!el) return
    const clamped = Math.min(Math.max(0, nextIndex), count - 1)
    el.scrollTo({
      left: clamped * Math.max(el.clientWidth, 1),
      behavior: 'auto',
    })
    setCurrentIndex(clamped)
  }, [count])

  useImperativeHandle(ref, () => ({
    goPrev: () => jumpToIndex(currentIndex - 1),
    goNext: () => jumpToIndex(currentIndex + 1),
  }), [currentIndex, jumpToIndex])

  const resetKey = `${receiptId ?? ''}-${count}-${variant}`
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey)
    setCurrentIndex(0)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTo({
        left: 0,
        behavior: 'auto',
      })
    }
  }, [resetKey])

  const thumbBox = 'relative h-16 w-16 overflow-hidden rounded-xl bg-surface-secondary'
  const caption =
    count > 1 ? (
      <div className="pointer-events-none absolute bottom-1 left-1/2 z-[1] -translate-x-1/2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
        Image {currentIndex + 1} of {count}
      </div>
    ) : null
  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < count - 1

  if (isLoading || displayUrls.length === 0) {
    return (
      <div
        className={
          variant === 'thumb'
            ? `${thumbBox} flex items-center justify-center border border-surface-tertiary px-1 text-center text-[10px] font-semibold text-ink-tertiary`
            : 'flex h-[60vh] w-full items-center justify-center text-sm text-white'
        }
      >
        {isLoading ? 'Loading...' : 'No image'}
      </div>
    )
  }

  if (count <= 1 || displayUrls.length === 1) {
    return (
      <div
        className={
          variant === 'thumb'
            ? `${thumbBox} group flex items-center justify-center border border-surface-tertiary`
            : 'relative max-h-[92vh] w-full'
        }
      >
        <img
          src={displayUrls[0]}
          alt="Receipt"
          className={
            variant === 'thumb'
              ? 'max-h-full max-w-full min-h-0 min-w-0 object-contain object-top transition-transform duration-200 group-hover:scale-105'
              : 'max-h-[92vh] w-full object-contain'
          }
        />
      </div>
    )
  }

  return (
    <div className={variant === 'thumb' ? `group ${thumbBox} border border-surface-tertiary` : 'relative w-full'}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={
          variant === 'thumb'
            ? 'flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
            : 'flex max-h-[92vh] w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
        }
        style={variant === 'modal' ? { touchAction: 'pan-x' } : undefined}
      >
        {displayUrls.map((url, i) => (
          <div
            key={i}
            className={
              variant === 'thumb'
                ? 'flex h-16 min-w-16 shrink-0 snap-center items-center justify-center'
                : 'flex min-h-[60vh] min-w-full shrink-0 snap-center items-center justify-center'
            }
          >
            <img
              src={url}
              alt=""
              className={
                variant === 'thumb'
                  ? 'max-h-full max-w-full min-h-0 min-w-0 object-contain object-top transition-transform duration-200 group-hover:scale-105'
                  : 'max-h-[92vh] w-full max-w-full object-contain'
              }
            />
          </div>
        ))}
      </div>
      {variant === 'modal' && (
        <>
          <button
            type="button"
            onClick={() => jumpToIndex(currentIndex - 1)}
            disabled={!canGoPrev}
            aria-label="Previous receipt image"
            className="absolute left-2 top-1/2 z-[2] -translate-y-1/2 rounded-full bg-black/60 p-3 text-white transition hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-35 sm:left-3 sm:p-2.5"
          >
            <svg className="h-5 w-5 sm:h-4 sm:w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => jumpToIndex(currentIndex + 1)}
            disabled={!canGoNext}
            aria-label="Next receipt image"
            className="absolute right-2 top-1/2 z-[2] -translate-y-1/2 rounded-full bg-black/60 p-3 text-white transition hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-35 sm:right-3 sm:p-2.5"
          >
            <svg className="h-5 w-5 sm:h-4 sm:w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M7.5 4.5L13 10l-5.5 5.5" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}
      {variant === 'modal' && caption}
    </div>
  )
})

ReceiptImageCarousel.displayName = 'ReceiptImageCarousel'

export function HistoryCard({
  item,
  showGroupName,
  currentUserId,
  onEntryClick,
  onReceiptClick,
  onReceiptImageClick,
}: {
  item: GroupHistoryItem
  showGroupName: boolean
  currentUserId?: string
  onEntryClick: (item: GroupHistoryItem) => void
  onReceiptClick: (item: GroupHistoryItem) => void
  onReceiptImageClick: (receiptId: string, imageCount: number, imageUrls?: string[]) => void
}) {
  const badge = typeBadge[item.type] ?? typeBadge.entry
  const data = item.data as Record<string, string | null | undefined>
  const entryData = item.type === 'entry' ? (item.data as GroupHistoryEntryData) : null
  const receiptData = item.type === 'receipt' ? (item.data as GroupHistoryReceiptData) : null
  const isEntry = item.type === 'entry'
  const isReceipt = item.type === 'receipt'
  const isClickable = isEntry || isReceipt
  const receiptImageCount = receiptData ? Math.max(1, receiptData.image_count ?? 1) : 1

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
                  <SplitLineRow
                    key={`${line.user_id ?? line.display_name}-${line.amount}`}
                    line={line}
                    currentUserId={currentUserId}
                  />
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
              onReceiptImageClick(item.id, receiptImageCount, receiptData.image_urls)
            }}
            onKeyDown={(event) => event.stopPropagation()}
            className="mt-0.5 shrink-0 touch-pan-x text-left"
            aria-label="Open receipt image"
          >
            <ReceiptImageCarousel
              receiptId={item.id}
              imageCount={receiptImageCount}
              imageUrls={receiptData.image_urls}
              variant="thumb"
              enabled={isReceipt}
            />
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
                    <SplitLineRow
                      key={`${line.user_id ?? line.display_name}-${line.amount}`}
                      line={line}
                      currency={typeof receiptData.currency === 'string' ? receiptData.currency : undefined}
                      currentUserId={currentUserId}
                    />
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

export function ReceiptImageModal({
  isOpen,
  receiptId,
  imageCount,
  imageUrls,
  onClose,
}: {
  isOpen: boolean
  receiptId: string
  imageCount: number
  imageUrls?: string[]
  onClose: () => void
}) {
  const count = Math.max(1, (imageUrls?.length ?? 0) || imageCount)
  const carouselRef = useRef<ReceiptImageCarouselHandle | null>(null)

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (count <= 1) {
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        carouselRef.current?.goPrev()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        carouselRef.current?.goNext()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose, count])

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
        <ReceiptImageCarousel
          ref={carouselRef}
          receiptId={receiptId}
          imageCount={count}
          imageUrls={imageUrls}
          variant="modal"
          enabled={isOpen && Boolean(receiptId)}
        />
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
  canMarkPaid,
  canUndoMarkPaid,
  isMarkPaidLoading,
  onMarkPaid,
  onUnmarkPaid,
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
  canMarkPaid?: boolean
  canUndoMarkPaid?: boolean
  isMarkPaidLoading?: boolean
  onMarkPaid?: () => void
  onUnmarkPaid?: () => void
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
  const canEditStructure = canEdit && !entryHasPaidSplits(entry)

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
                  disabled={!canEditStructure || isSaving || isDeleting}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
                  Paid by
                </label>
                <select
                  value={paidBy}
                  onChange={(event) => onPaidByChange(event.target.value)}
                  disabled={!canEditStructure || isSaving || isDeleting}
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
                      disabled={!canEditStructure || isSaving || isDeleting}
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
                    disabled={!canEditStructure || isSaving || isDeleting}
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
                    disabled={!canEditStructure || isSaving || isDeleting}
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
                          <li key={split.user_id} className="flex items-center justify-between gap-2">
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
                disabled={!canEdit || isSaving || isDeleting}
                className="h-10 rounded-xl px-4 text-xs"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
              <Button
                onClick={onSave}
                disabled={
                  !canEdit
                  || isSaving
                  || isDeleting
                  || !descriptionDraft.trim()
                  || (canEditStructure && parsedAmount <= 0)
                }
                className="h-10 rounded-xl px-4 text-xs"
              >
                {isSaving ? 'Saving...' : entryHasPaidSplits(entry) ? 'Save details' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function useExpenseEntryModal(
  loadHistory: () => Promise<void>,
  requestConfirm: RequestConfirm,
  onBalancesChanged?: () => void,
) {
  const { addToast } = useToast()
  const { user } = useAuth()
  const [selectedEntryRef, setSelectedEntryRef] = useState<{ groupId: string; entryId: string } | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<ManualEntryDetail | null>(null)
  const [entryMembers, setEntryMembers] = useState<GroupMember[]>([])
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false)
  const [isEntryLoading, setIsEntryLoading] = useState(false)
  const [isSavingEntry, setIsSavingEntry] = useState(false)
  const [isDeletingEntry, setIsDeletingEntry] = useState(false)
  const [isMarkPaidLoading, setIsMarkPaidLoading] = useState(false)
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
      const payload = entryHasPaidSplits(selectedEntry)
        ? { description: descriptionDraft.trim() }
        : {
            description: descriptionDraft.trim(),
            total_amount: parsedAmount,
            split_type: splitModeDraft,
            paid_by: paidByDraft,
            splits,
          }
      await updateEntry(selectedEntryRef.groupId, selectedEntryRef.entryId, payload)
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

  async function onMarkEntryPaid() {
    if (!selectedEntryRef) return
    const payerName = entryMembers.find((m) => m.user_id === selectedEntry?.created_by)?.display_name ?? 'them'
    const amount = selectedEntry?.my_share_amount ?? ''
    const confirmed = await requestConfirm({
      title: 'Mark as paid?',
      message: `Record that you paid ${payerName} ${formatCurrency(Number(amount))} for ${selectedEntry?.description ?? 'this expense'}?`,
      confirmLabel: 'Mark as paid',
    })
    if (!confirmed) return
    setIsMarkPaidLoading(true)
    try {
      const updated = await markEntryPaid(selectedEntryRef.groupId, selectedEntryRef.entryId)
      setSelectedEntry(updated)
      addToast('success', 'Marked as paid')
      await loadHistory()
      onBalancesChanged?.()
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to mark as paid'))
    } finally {
      setIsMarkPaidLoading(false)
    }
  }

  async function onUnmarkEntryPaid() {
    if (!selectedEntryRef) return
    const confirmed = await requestConfirm({
      title: 'Undo paid?',
      message: 'Remove the paid record for your share on this expense?',
      confirmLabel: 'Undo paid',
    })
    if (!confirmed) return
    setIsMarkPaidLoading(true)
    try {
      const updated = await unmarkEntryPaid(selectedEntryRef.groupId, selectedEntryRef.entryId)
      setSelectedEntry(updated)
      addToast('success', 'Payment record removed')
      await loadHistory()
      onBalancesChanged?.()
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to undo paid'))
    } finally {
      setIsMarkPaidLoading(false)
    }
  }

  const payerDisplayName = selectedEntry
    ? entryMembers.find((member) => member.user_id === selectedEntry.created_by)?.display_name ?? null
    : null

  return {
    isEntryModalOpen,
    selectedEntry,
    entryMembers,
    isEntryLoading,
    isSavingEntry,
    isDeletingEntry,
    isMarkPaidLoading,
    canEdit,
    canMarkPaid: selectedEntry?.can_mark_paid,
    canUndoMarkPaid: selectedEntry && user
      ? selectedEntry.splits.some((split) => split.user_id === user.id && split.is_paid === true)
      : false,
    myShareAmount: selectedEntry?.my_share_amount,
    payerDisplayName,
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
    onMarkEntryPaid,
    onUnmarkEntryPaid,
  }
}

type GroupScopedHistoryProps = {
  groupId: string
  variant: 'page' | 'embedded'
  onBalancesChanged?: () => void
}

export function GroupScopedHistory({ groupId, variant, onBalancesChanged }: GroupScopedHistoryProps) {
  const [filter, setFilter] = useState<(typeof historyFilters)[number]>('all')
  const [items, setItems] = useState<GroupHistoryItem[]>([])
  const [imageModal, setImageModal] = useState<{
    receiptId: string
    imageCount: number
    imageUrls?: string[]
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { user } = useAuth()
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

  const entryModal = useExpenseEntryModal(loadHistory, deleteConfirm.confirm, onBalancesChanged)
  const receiptModal = useReceiptDetailModal(loadHistory, deleteConfirm.confirm, onBalancesChanged)

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
              currentUserId={user?.id}
              onEntryClick={entryModal.openEntryModal}
              onReceiptClick={receiptModal.openReceiptModal}
              onReceiptImageClick={(receiptId, imageCount, imageUrls) =>
                setImageModal({ receiptId, imageCount, imageUrls })
              }
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
        canMarkPaid={entryModal.canMarkPaid}
        canUndoMarkPaid={entryModal.canUndoMarkPaid}
        isMarkPaidLoading={entryModal.isMarkPaidLoading}
        onMarkPaid={entryModal.onMarkEntryPaid}
        onUnmarkPaid={entryModal.onUnmarkEntryPaid}
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
        receiptSplits={receiptModal.receiptSplits}
        canMarkPaid={receiptModal.canMarkPaid}
        canUndoMarkPaid={receiptModal.canUndoMarkPaid}
        hasPaidSplits={receiptModal.hasPaidSplits}
        isMarkPaidLoading={receiptModal.isMarkPaidLoading}
        onMarkPaid={receiptModal.onMarkReceiptPaid}
        onUnmarkPaid={receiptModal.onUnmarkReceiptPaid}
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
        isOpen={imageModal !== null}
        receiptId={imageModal?.receiptId ?? ''}
        imageCount={imageModal?.imageCount ?? 1}
        imageUrls={imageModal?.imageUrls}
        onClose={() => setImageModal(null)}
      />
      <ConfirmDialog
        {...deleteConfirm.dialogProps}
        isLoading={entryModal.isDeletingEntry || receiptModal.isDeleting || entryModal.isMarkPaidLoading || receiptModal.isMarkPaidLoading}
      />
    </div>
  )
}
