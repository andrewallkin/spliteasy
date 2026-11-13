import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { getAllHistory, listGroups } from '@/api/groups'
import {
  EntryDetailModal,
  GroupScopedHistory,
  HistoryCard,
  historyFilterLabels,
  historyFilters,
  ReceiptImageModal,
  ReceiptDetailModal,
  useExpenseEntryModal,
  useReceiptDetailModal,
} from '@/components/history/GroupScopedHistory'
import { calendarDayKey, dayLabel } from '@/components/history/historyFormat'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, microLabelClassName } from '@/components/ui/Field'
import { FilterChips } from '@/components/ui/FilterChips'
import { ClockIcon } from '@/components/ui/icons'
import { PageContent, PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { TAB_THEMES } from '@/lib/theme'
import type { Group, GroupHistoryItem } from '@/types/models'
import { getErrorMessage } from '@/utils/errors'

export function HistoryPage() {
  const { id = '' } = useParams()
  const isGroupScoped = Boolean(id)

  if (isGroupScoped) {
    return <GroupScopedHistory groupId={id} variant="page" />
  }

  return <GlobalHistoryPage />
}

function GlobalHistoryPage() {
  const [filter, setFilter] = useState<(typeof historyFilters)[number]>('all')
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [items, setItems] = useState<GroupHistoryItem[]>([])
  const [imageModal, setImageModal] = useState<{
    receiptId: string
    imageCount: number
    imageUrls?: string[]
  } | null>(null)
  const [detailHistoryItem, setDetailHistoryItem] = useState<GroupHistoryItem | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { user } = useAuth()
  const { addToast } = useToast()
  const deleteConfirm = useConfirmDialog()

  const loadHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      setItems(await getAllHistory({
        type: filter === 'all' ? undefined : filter,
        groupId: selectedGroupId || undefined,
      }))
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to load history'))
    } finally {
      setIsLoading(false)
    }
  }, [filter, selectedGroupId, addToast])

  const entryModal = useExpenseEntryModal(loadHistory, deleteConfirm.confirm)
  const receiptModal = useReceiptDetailModal(loadHistory, deleteConfirm.confirm)

  useEffect(() => {
    async function loadGroups() {
      try {
        const availableGroups = await listGroups()
        setGroups(availableGroups)
      } catch (error) {
        addToast('error', getErrorMessage(error, 'Unable to load groups'))
      }
    }
    void loadGroups()
  }, [addToast])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const selectedGroup = groups.find((group) => group.id === selectedGroupId)
  const subtitle = selectedGroup
    ? `Transactions in ${selectedGroup.name}`
    : 'All transactions across your groups'

  const filterOptions = useMemo(
    () => historyFilters.map((value) => ({ value, label: historyFilterLabels[value] })),
    [],
  )

  return (
    <>
      <PageHeader theme={TAB_THEMES.history} title="History" subtitle={subtitle} />
      <PageContent className="space-y-4">
        <Field label="Group" htmlFor="groupFilter">
          <Select
            id="groupFilter"
            value={selectedGroupId}
            onChange={(event) => setSelectedGroupId(event.target.value)}
          >
            <option value="">All groups</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </Field>

        <FilterChips value={filter} onChange={setFilter} options={filterOptions} aria-label="Filter history" />

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
            description="Transactions across your groups will appear here."
          />
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => {
              const showDayLabel = index === 0 || calendarDayKey(item.timestamp) !== calendarDayKey(items[index - 1].timestamp)
              return (
                <Fragment key={`${item.group_id}-${item.type}-${item.id}`}>
                  {showDayLabel && (
                    <p className={`pt-1 ${microLabelClassName}`}>{dayLabel(item.timestamp)}</p>
                  )}
                  <HistoryCard
                    item={item}
                    showGroupName
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
      </PageContent>

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
}
