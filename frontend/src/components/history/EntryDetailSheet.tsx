import { useEffect, useMemo, useState } from 'react'

import {
  deleteEntry,
  getEntry,
  getGroupMembers,
  markEntryPaid,
  unmarkEntryPaid,
  updateEntry,
} from '@/api/groups'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { PencilSquareIcon } from '@/components/ui/icons'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/Select'
import { TypeBadge } from '@/components/ui/TypeBadge'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import type { GroupHistoryItem, GroupMember, ManualEntryDetail } from '@/types/models'
import { formatCurrency } from '@/utils/currency'
import { getErrorMessage } from '@/utils/errors'

import { formatHistoryDate, formatHistoryTime, type RequestConfirm, type SplitMode, toSplitMode } from './historyFormat'
import { displayNameFor, entryHasPaidSplits, MarkPaidButtons, SplitLineRow } from './historyShared'

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
  historyItem,
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
  historyItem?: GroupHistoryItem | null
}) {
  const parsedAmount = Number(amountDraft) || 0
  const secondUser = members[1]
  const canEditStructure = canEdit && !entryHasPaidSplits(entry)
  const splitModeOptions = [
    { value: 'equal' as const, label: 'Equal' },
    { value: 'full' as const, label: 'Full' },
    { value: 'percentage' as const, label: 'Custom %' },
  ]
  const historyEntryData = historyItem?.type === 'entry' ? historyItem.data : null
  const metaSplits = historyEntryData && 'splits' in historyEntryData && Array.isArray(historyEntryData.splits)
    ? historyEntryData.splits
    : null

  const footer = entry ? (
    <div className="flex flex-wrap justify-end gap-2">
      <MarkPaidButtons
        canMarkPaid={canMarkPaid}
        canUndo={canUndoMarkPaid}
        isLoading={isMarkPaidLoading}
        onMark={() => onMarkPaid?.()}
        onUndo={() => onUnmarkPaid?.()}
      />
      <Button
        variant="soft-danger"
        onClick={onDelete}
        disabled={!canEdit || isSaving || isDeleting}
        size="sm"
      >
        {isDeleting ? 'Deleting...' : 'Delete'}
      </Button>
      <Button
        variant="dark"
        onClick={onSave}
        disabled={
          !canEdit
          || isSaving
          || isDeleting
          || !descriptionDraft.trim()
          || (canEditStructure && parsedAmount <= 0)
        }
        size="sm"
      >
        {isSaving ? 'Saving...' : entryHasPaidSplits(entry) ? 'Save details' : 'Save changes'}
      </Button>
    </div>
  ) : undefined

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Expense details"
      closeDisabled={isSaving || isDeleting}
      footer={footer}
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : !entry ? (
        <EmptyState
          title="Expense could not be loaded."
          icon={<PencilSquareIcon className="h-7 w-7" />}
          action={<Button variant="secondary" onClick={onClose}>Close</Button>}
        />
      ) : (
        <div className="space-y-4">
          <div className="rounded-3xl border-[1.5px] border-line bg-surface-secondary/50 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TypeBadge kind="entry" />
              <span className="text-xs text-ink-tertiary">
                {formatHistoryDate(entry.created_at)} · {formatHistoryTime(entry.created_at)}
              </span>
            </div>
            <p className="text-sm text-ink-secondary">
              <span className="font-bold text-ink">Paid by </span>
              {displayNameFor(paidBy, members)}
            </p>
            {metaSplits && metaSplits.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-3">
                {metaSplits.map((line) => (
                  <SplitLineRow key={`${line.user_id ?? line.display_name}-${line.amount}`} line={line} />
                ))}
              </ul>
            )}
          </div>

          <Field label="Description" htmlFor="entryDescription">
            <Input
              id="entryDescription"
              value={descriptionDraft}
              onChange={(event) => onDescriptionChange(event.target.value)}
              maxLength={200}
              disabled={!canEdit || isSaving || isDeleting}
            />
          </Field>

          <Field label="Amount" htmlFor="entryAmount">
            <Input
              id="entryAmount"
              value={amountDraft}
              onChange={(event) => onAmountChange(event.target.value)}
              inputMode="decimal"
              disabled={!canEditStructure || isSaving || isDeleting}
            />
          </Field>

          <Field label="Paid by" htmlFor="entryPaidBy">
            <Select
              id="entryPaidBy"
              value={paidBy}
              onChange={(event) => onPaidByChange(event.target.value)}
              disabled={!canEditStructure || isSaving || isDeleting}
            >
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.display_name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Split mode">
            <SegmentedControl
              value={splitMode}
              onChange={onSplitModeChange}
              options={splitModeOptions}
              disabled={!canEditStructure || isSaving || isDeleting}
            />
          </Field>

          {splitMode === 'full' && (
            <Field label="Who owes full amount" htmlFor="entryFullSplitUser">
              <Select
                id="entryFullSplitUser"
                value={fullSplitUserId}
                onChange={(event) => onFullSplitUserIdChange(event.target.value)}
                disabled={!canEditStructure || isSaving || isDeleting}
              >
                {members
                  .filter((member) => member.user_id !== paidBy)
                  .map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.display_name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}

          {splitMode === 'percentage' && members.length >= 2 && secondUser && (
            <Field label="Percentage split">
              <input
                type="range"
                min={1}
                max={99}
                step={1}
                value={firstUserPercentage}
                onChange={(event) => onFirstUserPercentageChange(Number(event.target.value))}
                disabled={!canEditStructure || isSaving || isDeleting}
                className="w-full accent-violet-500 disabled:opacity-60"
              />
              <div className="mt-2 flex justify-between text-sm text-ink-secondary">
                <span>
                  {members[0]?.display_name}: <span className="font-semibold text-ink">{firstUserPercentage}%</span>
                </span>
                <span>
                  {secondUser.display_name}: <span className="font-semibold text-ink">{100 - firstUserPercentage}%</span>
                </span>
              </div>
            </Field>
          )}
        </div>
      )}
    </BottomSheet>
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
