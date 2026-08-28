import { useCallback, useEffect, useState } from 'react'
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
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink">History</h2>
        <p className="mt-0.5 text-sm text-ink-secondary">{subtitle}</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="groupFilter" className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          Group
        </label>
        <select
          id="groupFilter"
          value={selectedGroupId}
          onChange={(event) => setSelectedGroupId(event.target.value)}
          className="w-full rounded-2xl border border-surface-tertiary bg-surface-primary px-3 py-2 text-base text-ink shadow-soft focus:border-pastel-purple focus:outline-none"
        >
          <option value="">All groups</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

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
          <p className="mt-0.5 text-xs text-ink-tertiary">Transactions across your groups will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <HistoryCard
              key={`${item.group_id}-${item.type}-${item.id}`}
              item={item}
              showGroupName
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
