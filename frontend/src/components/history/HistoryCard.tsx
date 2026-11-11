import { AmountText } from '@/components/ui/AmountText'
import { ArrowsRightLeftIcon, PencilSquareIcon, ReceiptIcon } from '@/components/ui/icons'
import type {
  GroupHistoryEntryData,
  GroupHistoryItem,
  GroupHistoryReceiptData,
} from '@/types/models'
import { groupTheme } from '@/lib/theme'

import { formatHistoryTime } from './historyFormat'
import { ReceiptImageCarousel } from './ReceiptImageViewer'

export function HistoryCard({
  item,
  showGroupName,
  onEntryClick,
  onReceiptClick,
  onReceiptImageClick,
  currentUserId,
}: {
  item: GroupHistoryItem
  showGroupName: boolean
  currentUserId?: string
  onEntryClick: (item: GroupHistoryItem) => void
  onReceiptClick: (item: GroupHistoryItem) => void
  onReceiptImageClick: (receiptId: string, imageCount: number, imageUrls?: string[]) => void
}) {
  void currentUserId
  const entryData = item.type === 'entry' ? (item.data as GroupHistoryEntryData) : null
  const receiptData = item.type === 'receipt' ? (item.data as GroupHistoryReceiptData) : null
  const settlementData = item.type === 'settlement' ? (item.data as Record<string, string | null | undefined>) : null
  const isEntry = item.type === 'entry'
  const isReceipt = item.type === 'receipt'
  const isSettlement = item.type === 'settlement'
  const isClickable = isEntry || isReceipt
  const receiptImageCount = receiptData ? Math.max(1, receiptData.image_count ?? 1) : 1

  let title = ''
  let paidLine = ''
  let notesLine: string | null = null
  let amountValue = 0
  let amountCurrency: string | undefined
  let amountTone: 'owed' | 'owe' | 'neutral' = 'neutral'

  if (isEntry && entryData) {
    title = entryData.description || 'Expense'
    paidLine = entryData.created_by ? `${entryData.created_by} paid` : ''
    amountValue = Number(entryData.total_amount || 0)
  } else if (isReceipt && receiptData) {
    title = receiptData.nickname || receiptData.merchant_name || 'Receipt'
    paidLine = receiptData.paid_by ? `${receiptData.paid_by} paid` : ''
    amountValue = Number(receiptData.total_amount || 0)
    amountCurrency = typeof receiptData.currency === 'string' ? receiptData.currency : undefined
  } else if (isSettlement && settlementData) {
    title = `${settlementData.paid_by} paid ${settlementData.paid_to}`
    paidLine = ''
    amountValue = Number(settlementData.amount || 0)
    amountTone = 'owed'
    notesLine = settlementData.notes ? String(settlementData.notes) : null
  }

  const theme = groupTheme(item.group_id)

  return (
    <div
      className={`flex items-center gap-3 rounded-3xl border-[1.5px] border-line bg-white p-3.5 ${isClickable ? 'cursor-pointer transition hover:shadow-soft' : ''}`}
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
      <div className="shrink-0">
        {isReceipt && receiptData ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onReceiptImageClick(item.id, receiptImageCount, receiptData.image_urls)
            }}
            onKeyDown={(event) => event.stopPropagation()}
            className="touch-pan-x text-left"
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
        ) : (
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
              isReceipt ? 'bg-violet-100 text-violet-600' : isEntry ? 'bg-sky-100 text-sky-600' : 'bg-emerald-100 text-emerald-600'
            }`}
            aria-hidden="true"
          >
            {isReceipt && <ReceiptIcon className="h-5 w-5" />}
            {isEntry && <PencilSquareIcon className="h-5 w-5" />}
            {isSettlement && <ArrowsRightLeftIcon className="h-5 w-5" />}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-ink-tertiary">
          {showGroupName && (
            <>
              <span className={`font-bold ${theme.text}`}>{item.group_name}</span>
              {(paidLine || notesLine) && <span> · </span>}
            </>
          )}
          {paidLine}
        </p>
        {notesLine && (
          <p className="mt-0.5 text-xs text-ink-tertiary">{notesLine}</p>
        )}
      </div>

      <div className="shrink-0 text-right">
        <AmountText amount={amountValue} currency={amountCurrency} size="sm" tone={amountTone} />
        <p className="mt-0.5 text-[11px] text-ink-tertiary">{formatHistoryTime(item.timestamp)}</p>
      </div>
    </div>
  )
}
