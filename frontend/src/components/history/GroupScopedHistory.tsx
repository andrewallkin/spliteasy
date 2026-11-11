import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'

import { getHistory } from '@/api/groups'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterChips } from '@/components/ui/FilterChips'
import { ClockIcon } from '@/components/ui/icons'
import { PageContent, PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { groupTheme } from '@/lib/theme'
import type { GroupHistoryItem } from '@/types/models'
import { getErrorMessage } from '@/utils/errors'

import { EntryDetailModal, useExpenseEntryModal } from './EntryDetailSheet'
import { HistoryCard } from './HistoryCard'
import {
  calendarDayKey,
  dayLabel,
  formatHistoryDate,
  formatHistoryTime,
  historyFilterLabels,
  historyFilters,
  toSplitMode,
  type SplitMode,
} from './historyFormat'
import { ReceiptDetailModal, useReceiptDetailModal } from './ReceiptDetailSheet'
import { ReceiptImageModal } from './ReceiptImageViewer'

export {
  formatHistoryDate,
  formatHistoryTime,
  historyFilterLabels,
  historyFilters,
  toSplitMode,
  type SplitMode,
}
export { HistoryCard } from './HistoryCard'
export { ReceiptImageModal } from './ReceiptImageViewer'
export { ReceiptDetailModal, useReceiptDetailModal } from './ReceiptDetailSheet'
export { EntryDetailModal, useExpenseEntryModal } from './EntryDetailSheet'

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
  const [detailHistoryItem, setDetailHistoryItem] = useState<GroupHistoryItem | null>(null)
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

  const filterOptions = useMemo(
    () => historyFilters.map((value) => ({ value, label: historyFilterLabels[value] })),
    [],
  )
  const [rememberedGroupName, setRememberedGroupName] = useState('')

  useEffect(() => {
    const name = items.find((item) => item.group_name)?.group_name
    if (name) {
      setRememberedGroupName(name)
    }
  }, [items])

  const groupPageSubtitle = rememberedGroupName || 'All transactions in this group'

  const listBody = (
    <>
      <FilterChips value={filter} onChange={setFilter} options={filterOptions} aria-label="Filter transactions" />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[72px] rounded-3xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClockIcon className="h-7 w-7" />}
          title="No history yet"
          description="Transactions will appear here."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => {
            const showDayLabel = index === 0 || calendarDayKey(item.timestamp) !== calendarDayKey(items[index - 1].timestamp)
            return (
              <Fragment key={`${item.group_id}-${item.type}-${item.id}`}>
                {showDayLabel && (
                  <p className="pt-1 text-[11px] font-extrabold uppercase tracking-wider text-ink-tertiary">
                    {dayLabel(item.timestamp)}
                  </p>
                )}
                <HistoryCard
                  item={item}
                  showGroupName={false}
                  onEntryClick={(historyItem) => {
                    setDetailHistoryItem(historyItem)
                    entryModal.openEntryModal(historyItem)
                  }}
                  onReceiptClick={(historyItem) => {
                    setDetailHistoryItem(historyItem)
                    receiptModal.openReceiptModal(historyItem)
                  }}
                  onReceiptImageClick={(receiptId, imageCount, imageUrls) =>
                    setImageModal({ receiptId, imageCount, imageUrls })
                  }
                />
              </Fragment>
            )
          })}
        </div>
      )}
    </>
  )

  const modals = (
    <>
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
        historyItem={detailHistoryItem}
        currentUserId={user?.id}
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
        historyItem={detailHistoryItem}
        currentUserId={user?.id}
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
    </>
  )

  if (variant === 'page') {
    return (
      <>
        <PageHeader
          theme={groupTheme(groupId)}
          back={`/groups/${groupId}`}
          title="History"
          subtitle={groupPageSubtitle}
        />
        <PageContent className="space-y-4">{listBody}</PageContent>
        {modals}
      </>
    )
  }

  return (
    <section className="space-y-3">
      <h3 className="text-[15px] font-extrabold text-ink">Transactions</h3>
      {listBody}
      {modals}
    </section>
  )
}
