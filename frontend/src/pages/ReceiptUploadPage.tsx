import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { deleteReceipt, getGroupMembers, updateReceiptItems, uploadReceipt } from '@/api/groups'
import { api } from '@/api/client'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { CameraIcon, CheckIcon, PlusIcon, TrashIcon, WarningIcon } from '@/components/ui/icons'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { PageContent, PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/Select'
import { StickyFooter } from '@/components/ui/StickyFooter'
import { useToast } from '@/context/ToastContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { groupTheme } from '@/lib/theme'
import type { GroupMember, OCRLineItem, Receipt } from '@/types/models'
import { DEFAULT_CURRENCY, formatCurrency } from '@/utils/currency'
import { getErrorMessage } from '@/utils/errors'

type Step = 'capture' | 'processing' | 'confirm' | 'summary'

type DraftItem = {
  /** Temporary local key — not the DB UUID until after save */
  key: string
  description: string
  quantity: string
  price_per_unit: string
  line_subtotal: string
  line_discount: string
  final_line_total: string
  confidence: number
  /** 2-user mode: 'me' | 'split' | partner-user-id */
  assignee: string
  /** 3+ user mode: 'equal' (all members) or 'custom' (subset) */
  assigneeMode: 'equal' | 'custom'
  /** 3+ user mode: user IDs selected for custom split */
  customAssignees: string[]
  isManual: boolean
}

const RECEIPT_IMAGE_ACCEPT = 'image/*,.heic,.heif'

const stepLabels: Record<Step, string> = {
  capture: 'Capture Receipt',
  processing: 'Analyzing Receipt',
  confirm: 'Review & Assign',
  summary: 'Done',
}

function blankItem(key: string, allMemberIds: string[]): DraftItem {
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
    assigneeMode: 'equal',
    customAssignees: [...allMemberIds],
    isManual: true,
  }
}

function fromOCRItem(item: OCRLineItem, index: number, allMemberIds: string[]): DraftItem {
  return {
    key: String(index),
    description: item.description,
    quantity: String(item.quantity ?? 1),
    price_per_unit: item.price_per_unit ?? item.amount,
    line_subtotal: item.line_subtotal ?? item.amount,
    line_discount: item.line_discount ?? '0.00',
    final_line_total: item.final_line_total ?? item.amount,
    confidence: item.confidence ?? 1,
    assignee: 'split',
    assigneeMode: 'equal',
    customAssignees: [...allMemberIds],
    isManual: false,
  }
}

type AssignOption = { value: string; label: string }

function ReceiptLineItemAssignControls({
  item,
  isMultiUser,
  members,
  twoUserAssignOptions,
  updateItem,
  toggleItemMember,
}: {
  item: DraftItem
  isMultiUser: boolean
  members: GroupMember[]
  twoUserAssignOptions: AssignOption[]
  updateItem: (key: string, patch: Partial<DraftItem>) => void
  toggleItemMember: (itemKey: string, userId: string) => void
}) {
  if (isMultiUser) {
    return (
      <div className="space-y-2">
        <SegmentedControl
          value={item.assigneeMode}
          onChange={(value) => {
            if (value === 'equal') {
              updateItem(item.key, { assigneeMode: 'equal' })
            } else {
              updateItem(item.key, {
                assigneeMode: 'custom',
                customAssignees: [...members.map((m) => m.user_id)],
              })
            }
          }}
          options={[
            { value: 'equal', label: 'Equal' },
            { value: 'custom', label: 'Custom' },
          ]}
          size="md"
          aria-label="Assign to"
        />
        {item.assigneeMode === 'custom' && (
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const active = item.customAssignees.includes(m.user_id)
              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => toggleItemMember(item.key, m.user_id)}
                  className={`flex min-h-[44px] items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5 text-xs font-bold transition ${
                    active
                      ? 'border-violet-400 bg-violet-50 text-violet-700'
                      : 'border-line bg-white text-ink-secondary'
                  }`}
                >
                  <Avatar name={m.display_name} colorKey={m.user_id} size="xs" />
                  {m.display_name}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <SegmentedControl
      value={item.assignee}
      onChange={(value) => updateItem(item.key, { assignee: value })}
      options={twoUserAssignOptions}
      size="md"
      aria-label="Assign to"
    />
  )
}

export function ReceiptUploadPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [searchParams] = useSearchParams()
  const resumeReceiptId = searchParams.get('receiptId')
  const discardConfirm = useConfirmDialog()
  const intentionalNavRef = useRef(false)
  const [step, setStep] = useState<Step>('capture')
  const [files, setFiles] = useState<File[]>([])
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [items, setItems] = useState<DraftItem[]>([])
  const [nickname, setNickname] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [nextKey, setNextKey] = useState(0)
  const libraryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [collapsedItemKeys, setCollapsedItemKeys] = useState<Set<string>>(() => new Set())
  const [forceExpandedItemKeys, setForceExpandedItemKeys] = useState<Set<string>>(() => new Set())

  const theme = groupTheme(id)
  const isMultiUser = members.length > 2
  const stepIndex = ['capture', 'processing', 'confirm', 'summary'].indexOf(step) + 1

  // Load group members on mount so we have them ready for the confirm step
  useEffect(() => {
    if (!id) return
    getGroupMembers(id)
      .then((m) => {
        setMembers(m)
        if (m.length > 0) setPaidBy(m[0].user_id)
      })
      .catch(() => {/* best-effort */})
  }, [id])

  // Resume an existing pending_review draft when navigated here with ?receiptId=
  useEffect(() => {
    if (!resumeReceiptId) return
    void (async () => {
      try {
        setStep('processing')
        const [existingReceipt, ocrItems] = await Promise.all([
          api.get<Receipt>(`/receipts/${resumeReceiptId}`),
          api.get<OCRLineItem[]>(`/receipts/${resumeReceiptId}/items`),
        ])
        setReceipt(existingReceipt.data)
        setMerchantName(existingReceipt.data.merchant_name ?? '')
        setTotalAmount(String(existingReceipt.data.total_amount ?? ''))
        const memberIds = members.map((m) => m.user_id)
        setItems(ocrItems.data.map((item, index) => fromOCRItem(item, index, memberIds)))
        setNextKey(ocrItems.data.length)
        setStep('confirm')
      } catch {
        addToast('error', 'Unable to load receipt draft')
        setStep('capture')
      }
    })()
  }, [resumeReceiptId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Block navigation away from confirm step — draft exists on the backend at this point
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !intentionalNavRef.current &&
      step === 'confirm' &&
      currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    void (async () => {
      const confirmed = await discardConfirm.confirm({
        title: 'Discard receipt draft?',
        message: 'If you leave now, this draft will be deleted.',
        confirmLabel: 'Discard',
      })
      if (confirmed) {
        if (receipt) await deleteReceipt(receipt.id).catch(() => {/* best-effort */})
        blocker.proceed()
      } else {
        blocker.reset()
      }
    })()
  }, [blocker.state]) // eslint-disable-line react-hooks/exhaustive-deps

  const me = members[0]
  const partner = members[1]

  // Live split summary for 2-user mode
  const splitSummary2 = useMemo(() => {
    if (isMultiUser || !me || !partner) return null
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

    return { meShare, partnerShare, meOwes, partnerOwes }
  }, [items, me, paidBy, partner, isMultiUser])

  // Live split summary for 3+ user mode
  const splitSummaryMulti = useMemo(() => {
    if (!isMultiUser || members.length < 2) return null
    const shares: Record<string, number> = {}
    for (const m of members) shares[m.user_id] = 0

    for (const item of items) {
      const total = parseFloat(item.final_line_total) || 0
      if (item.assigneeMode === 'equal') {
        const perPerson = total / members.length
        for (const m of members) shares[m.user_id] += perPerson
      } else {
        const assignees = item.customAssignees
        if (assignees.length === 0) continue
        const perPerson = total / assignees.length
        for (const uid of assignees) {
          if (shares[uid] !== undefined) shares[uid] += perPerson
        }
      }
    }

    return shares
  }, [items, members, isMultiUser])

  // Determine paid-by partner (the other member) — 2-user mode only
  const partnerId = paidBy === me?.user_id ? partner?.user_id ?? '' : me?.user_id ?? ''

  function updateItem(key: string, patch: Partial<DraftItem>) {
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

  function toggleItemMember(itemKey: string, userId: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it
        const current = new Set(it.customAssignees)
        if (current.has(userId)) {
          if (current.size > 1) current.delete(userId)
        } else {
          current.add(userId)
        }
        return { ...it, customAssignees: Array.from(current) }
      }),
    )
  }

  function deleteItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key))
  }

  function addItem() {
    const key = String(nextKey)
    setNextKey((k) => k + 1)
    setItems((prev) => [...prev, blankItem(key, members.map((m) => m.user_id))])
  }

  async function onProcessReceipt() {
    if (files.length === 0) return
    try {
      setStep('processing')
      const uploaded = await uploadReceipt(id, files)

      if (uploaded.status === 'ocr_failed') {
        addToast('error', 'Could not read receipt. Please try again or add items manually.')
        setStep('capture')
        return
      }

      setReceipt(uploaded)
      setMerchantName(uploaded.merchant_name ?? '')
      setTotalAmount(String(uploaded.total_amount ?? ''))

      const ocrItems = (
        await api.get<OCRLineItem[]>(`/receipts/${uploaded.id}/items`)
      ).data
      const memberIds = members.map((m) => m.user_id)
      setItems(ocrItems.map((item, index) => fromOCRItem(item, index, memberIds)))
      setNextKey(ocrItems.length)
      setStep('confirm')
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to process receipt'))
      setStep('capture')
    }
  }

  async function onCancel() {
    if (!receipt) {
      intentionalNavRef.current = true
      navigate(`/groups/${id}`)
      return
    }
    const confirmed = await discardConfirm.confirm({
      title: 'Discard receipt draft?',
      message: 'This draft will be permanently deleted.',
      confirmLabel: 'Discard',
    })
    if (!confirmed) return
    await deleteReceipt(receipt.id).catch(() => {/* best-effort */})
    intentionalNavRef.current = true
    navigate(`/groups/${id}`)
  }

  async function onConfirm() {
    if (!receipt) return
    if (items.length === 0) {
      addToast('error', 'Add at least one line item')
      return
    }
    if (!paidBy) {
      addToast('error', 'Select who paid')
      return
    }

    setIsSaving(true)
    try {
      // 1. Patch receipt-level fields (nickname, merchant)
      await api.patch(`/receipts/${receipt.id}`, {
        nickname: nickname || null,
        merchant_name: merchantName || null,
        total_amount: totalAmount ? parseFloat(totalAmount) : null,
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
      await updateReceiptItems(receipt.id, { items: itemsPayload })

      // 3. Fetch updated line items (to get the fresh IDs after PUT recreates them)
      const savedItems = (await api.get<OCRLineItem[]>(`/receipts/${receipt.id}/items`)).data

      // 4. Build assignments using fresh IDs mapped by sort order
      const assignments = savedItems.map((saved, index) => {
        const draft = items[index]

        if (isMultiUser) {
          // 3+ user mode
          if (draft.assigneeMode === 'custom' && draft.customAssignees.length === 1) {
            // Single user selected → full assignment
            return {
              line_item_id: saved.id,
              shares: [{ user_id: draft.customAssignees[0], share_type: 'full' }],
            }
          }
          // Equal among all or custom subset
          const userIds = draft.assigneeMode === 'equal'
            ? members.map((m) => m.user_id)
            : draft.customAssignees
          return {
            line_item_id: saved.id,
            shares: userIds.map((uid) => ({ user_id: uid, share_type: 'equal' })),
          }
        }

        // 2-user mode (unchanged logic)
        const assignee = draft?.assignee ?? 'split'
        if (assignee === me?.user_id || assignee === partner?.user_id) {
          return {
            line_item_id: saved.id,
            shares: [{ user_id: assignee, share_type: 'full' }],
          }
        }
        return {
          line_item_id: saved.id,
          shares: [
            { user_id: paidBy, share_type: 'equal' },
            { user_id: partnerId, share_type: 'equal' },
          ],
        }
      })

      await api.post(`/receipts/${receipt.id}/assign`, {
        paid_by: paidBy,
        assignments,
      })

      setStep('summary')
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to save receipt'))
    } finally {
      setIsSaving(false)
    }
  }

  function appendFilesFromInput(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? [])
    if (incoming.length === 0) return
    setFiles((prev) => [...prev, ...incoming])
    event.target.value = ''
  }

  const currency = receipt?.currency ?? DEFAULT_CURRENCY

  function isItemUncertain(item: DraftItem): boolean {
    return item.confidence > 0 && item.confidence < 0.85
  }

  function isItemExpanded(item: DraftItem): boolean {
    if (collapsedItemKeys.has(item.key)) return false
    if (forceExpandedItemKeys.has(item.key)) return true
    return isItemUncertain(item)
  }

  function toggleItemExpanded(item: DraftItem) {
    const expanded = isItemExpanded(item)
    if (expanded) {
      setCollapsedItemKeys((prev) => new Set(prev).add(item.key))
      setForceExpandedItemKeys((prev) => {
        const next = new Set(prev)
        next.delete(item.key)
        return next
      })
    } else {
      setCollapsedItemKeys((prev) => {
        const next = new Set(prev)
        next.delete(item.key)
        return next
      })
      setForceExpandedItemKeys((prev) => new Set(prev).add(item.key))
    }
  }

  function onAddItemClick() {
    const key = String(nextKey)
    addItem()
    setForceExpandedItemKeys((prev) => new Set(prev).add(key))
    setCollapsedItemKeys((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const twoUserAssignOptions = me && partner
    ? [
        { value: me.user_id, label: 'Me' },
        { value: 'split', label: 'Split' },
        { value: partner.user_id, label: partner.display_name },
      ]
    : []

  return (
    <>
      <PageHeader
        theme={theme}
        back={`/groups/${id}`}
        backIcon="close"
        backLabel="Close"
        title={stepLabels[step]}
        right={<span className="text-[13px] font-bold">Step {stepIndex} of 4</span>}
      >
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${s <= stepIndex ? 'bg-white' : 'bg-white/40'}`}
            />
          ))}
        </div>
      </PageHeader>

      <PageContent>

        {/* Capture */}
        {step === 'capture' && (
          <>
            <p className="text-xs text-ink-tertiary">
              Multi-page receipts: add several photos from your library, or take photos one at a time (tap Take photo again to add more).
            </p>
            <div className="rounded-3xl border-2 border-dashed border-ink-faint/60 bg-white px-6 py-10 text-center">
              <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] ${theme.tile}`}>
                <CameraIcon className="h-8 w-8" />
              </div>
              <div className="flex w-full flex-col gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => libraryInputRef.current?.click()}
                >
                  Choose photos
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  Take photo
                </Button>
              </div>
            </div>
            {files.length > 0 && (
              <Card className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-ink-secondary">
                  {files.length === 1 ? files[0].name : `${files.length} images selected`}
                </span>
                <button
                  type="button"
                  className="flex min-h-[44px] shrink-0 items-center text-sm font-semibold text-pastel-purple-deep underline decoration-pastel-purple/40 underline-offset-2 transition hover:text-pastel-purple"
                  onClick={() => setFiles([])}
                >
                  Clear
                </button>
              </Card>
            )}
            <input
              ref={libraryInputRef}
              type="file"
              accept={RECEIPT_IMAGE_ACCEPT}
              multiple
              className="hidden"
              onChange={appendFilesFromInput}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept={RECEIPT_IMAGE_ACCEPT}
              capture="environment"
              className="hidden"
              onChange={appendFilesFromInput}
            />
          </>
        )}

        {/* Processing */}
        {step === 'processing' && (
          <EmptyState
            icon={<LoadingSpinner />}
            title={`Analyzing your receipt${files.length > 1 ? 's' : ''}...`}
          />
        )}

        {/* Confirm + Assign */}
        {step === 'confirm' && (
          <div className="space-y-3 pb-4">
            <Card className="space-y-3">
              <Field label="Nickname (optional)" htmlFor="receipt-nickname">
                <Input
                  id="receipt-nickname"
                  placeholder="e.g. Groceries with Sarah"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <Field label="Merchant / Shop" htmlFor="receipt-merchant">
                  <Input
                    id="receipt-merchant"
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                  />
                </Field>
                <Field label="Total Amount" htmlFor="receipt-total">
                  <Input
                    id="receipt-total"
                    inputMode="decimal"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                  />
                </Field>
              </div>
              {members.length === 2 && me && partner ? (
                <Field label="Paid by">
                  <SegmentedControl
                    value={paidBy}
                    onChange={setPaidBy}
                    options={[
                      { value: me.user_id, label: 'Me' },
                      { value: partner.user_id, label: partner.display_name },
                    ]}
                    aria-label="Paid by"
                  />
                </Field>
              ) : (
                <Field label="Paid by" htmlFor="receipt-paid-by">
                  <Select
                    id="receipt-paid-by"
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                  >
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
                    ))}
                  </Select>
                </Field>
              )}
            </Card>

            <div className="flex items-center justify-between gap-2 px-0.5">
              <h3 className="text-sm font-extrabold text-ink">Items · {items.length}</h3>
              <span className="text-xs text-ink-tertiary">Tap to edit</span>
            </div>

            {items.map((item) => {
              const uncertain = isItemUncertain(item)
              const expanded = isItemExpanded(item)
              const lineTotal = parseFloat(item.final_line_total) || 0

              return (
                <div
                  key={item.key}
                  className={`rounded-[20px] border-[1.5px] p-3 ${uncertain ? 'border-orange-200 bg-orange-50/60' : 'border-line bg-white'}`}
                >
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.description || 'item'}`}
                    onClick={() => toggleItemExpanded(item)}
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                      {item.description || 'No description'}
                    </span>
                    <span className="shrink-0 text-sm font-extrabold tabular-nums text-ink">
                      {formatCurrency(lineTotal, currency)}
                    </span>
                  </button>

                  {uncertain && !expanded && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-extrabold text-orange-600">
                      <WarningIcon className="h-4 w-4" />
                      Uncertain
                    </p>
                  )}

                  {!expanded && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Field label="Assign to">
                        <ReceiptLineItemAssignControls
                          item={item}
                          isMultiUser={isMultiUser}
                          members={members}
                          twoUserAssignOptions={twoUserAssignOptions}
                          updateItem={updateItem}
                          toggleItemMember={toggleItemMember}
                        />
                      </Field>
                    </div>
                  )}

                  {expanded && (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <Input
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => updateItem(item.key, { description: e.target.value })}
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
                          onClick={() => deleteItem(item.key)}
                          aria-label="Delete item"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-ink-tertiary transition hover:bg-surface-secondary hover:text-ink"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <Field label="Qty">
                          <Input
                            inputMode="numeric"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                          />
                        </Field>
                        <Field label="Price/unit">
                          <Input
                            inputMode="decimal"
                            value={item.price_per_unit}
                            onChange={(e) => updateItem(item.key, { price_per_unit: e.target.value })}
                          />
                        </Field>
                        <Field label="Pre-Discount">
                          <Input
                            inputMode="decimal"
                            value={item.line_subtotal}
                            onChange={(e) => updateItem(item.key, { line_subtotal: e.target.value })}
                            readOnly={item.isManual}
                            className={item.isManual ? 'bg-surface-secondary text-ink-tertiary' : ''}
                          />
                        </Field>
                        <Field label="Discount">
                          <Input
                            inputMode="decimal"
                            value={item.line_discount}
                            onChange={(e) => updateItem(item.key, { line_discount: e.target.value })}
                          />
                        </Field>
                        <Field label="After Discount" className="col-span-2">
                          <Input
                            inputMode="decimal"
                            value={item.final_line_total}
                            onChange={(e) => updateItem(item.key, { final_line_total: e.target.value })}
                            readOnly={item.isManual}
                            className={item.isManual ? 'bg-surface-secondary text-ink-tertiary' : ''}
                          />
                        </Field>
                      </div>

                      <Field label="Assign to">
                        <ReceiptLineItemAssignControls
                          item={item}
                          isMultiUser={isMultiUser}
                          members={members}
                          twoUserAssignOptions={twoUserAssignOptions}
                          updateItem={updateItem}
                          toggleItemMember={toggleItemMember}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              )
            })}

            <button
              type="button"
              onClick={onAddItemClick}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-3 text-sm font-bold text-ink-tertiary transition hover:border-violet-200 hover:text-ink-secondary"
            >
              <PlusIcon className="h-4 w-4" />
              Add item
            </button>

            {isMultiUser && splitSummaryMulti && (
              <div className={`space-y-2 rounded-3xl border-[1.5px] p-4 ${theme.soft} ${theme.softBorder}`}>
                <h3 className="text-xs font-bold uppercase tracking-wide text-ink-tertiary">Split Summary</h3>
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">Allocation</p>
                {members.map((m) => (
                  <div key={m.user_id} className="flex justify-between text-sm">
                    <span className="text-ink-secondary">{m.display_name}</span>
                    <span className="font-bold tabular-nums text-ink">
                      {formatCurrency(splitSummaryMulti[m.user_id] ?? 0, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!isMultiUser && splitSummary2 && me && partner && (
              <div className={`space-y-2 rounded-3xl border-[1.5px] p-4 ${theme.soft} ${theme.softBorder}`}>
                <h3 className="text-xs font-bold uppercase tracking-wide text-ink-tertiary">Split Summary</h3>
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">Allocation</p>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-secondary">{partner.display_name} share</span>
                  <span className="font-bold tabular-nums text-ink">
                    {formatCurrency(splitSummary2.partnerShare, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-secondary">{me.display_name} share</span>
                  <span className="font-bold tabular-nums text-ink">
                    {formatCurrency(splitSummary2.meShare, currency)}
                  </span>
                </div>
                <p className="pt-1 text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">Owes</p>
                <div className="flex justify-between text-sm font-extrabold">
                  <span className="text-ink-secondary">{partner.display_name} owes</span>
                  <span className="tabular-nums text-ink">
                    {formatCurrency(splitSummary2.partnerOwes, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-extrabold">
                  <span className="text-ink-secondary">{me.display_name} owes</span>
                  <span className="tabular-nums text-ink">
                    {formatCurrency(splitSummary2.meOwes, currency)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        {step === 'summary' && (
          <EmptyState
            tone="success"
            icon={<CheckIcon className="h-8 w-8" />}
            title="Receipt saved and assigned!"
            action={
              <Button variant="dark" size="lg" className="w-full" onClick={() => navigate(`/groups/${id}`)}>
                Back to group
              </Button>
            }
          />
        )}
      </PageContent>

      {step === 'capture' && (
        <StickyFooter>
          <Button
            variant="accent"
            theme={theme}
            size="lg"
            className="flex-1"
            onClick={onProcessReceipt}
            disabled={files.length === 0}
          >
            Process Receipt
          </Button>
        </StickyFooter>
      )}

      {step === 'confirm' && (
        <StickyFooter>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            variant="accent"
            theme={theme}
            className="flex-[2]"
            onClick={onConfirm}
            disabled={isSaving || items.length === 0 || !paidBy}
          >
            {isSaving ? 'Saving...' : 'Confirm Receipt'}
          </Button>
        </StickyFooter>
      )}

      <ConfirmDialog {...discardConfirm.dialogProps} />
    </>
  )
}
