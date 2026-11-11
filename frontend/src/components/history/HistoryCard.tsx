import { Card } from '@/components/ui/Card'
import type {
  GroupHistoryEntryData,
  GroupHistoryItem,
  GroupHistoryReceiptData,
} from '@/types/models'
import { formatCurrency } from '@/utils/currency'

import { formatHistoryDate, formatHistoryTime } from './historyFormat'
import { SplitLineRow, splitTypeCaption } from './historyShared'
import { ReceiptImageCarousel } from './ReceiptImageViewer'

const typeBadge: Record<string, { bg: string; text: string; label: string }> = {
  receipt: { bg: 'bg-pastel-sky/30', text: 'text-blue-600', label: 'Receipt' },
  entry: { bg: 'bg-pastel-lavender/30', text: 'text-pastel-purple-deep', label: 'Expense' },
  settlement: { bg: 'bg-pastel-mint/30', text: 'text-emerald-600', label: 'Settlement' },
}

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
