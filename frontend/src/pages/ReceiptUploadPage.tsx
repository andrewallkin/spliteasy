import { useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { deleteReceipt, getGroupMembers, updateReceiptItems, uploadReceipt } from '@/api/groups'
import { api } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useToast } from '@/context/ToastContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
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

  const currency = receipt?.currency ?? DEFAULT_CURRENCY

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <Card className="space-y-2">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${s <= stepIndex ? 'bg-pastel-purple-deep' : 'bg-ink-faint/30'}`}
            />
          ))}
        </div>
        <p className="text-xs text-ink-tertiary">Step {stepIndex} of 4</p>
        <h2 className="text-lg font-bold text-ink">{stepLabels[step]}</h2>
      </Card>

      {/* Capture */}
      {step === 'capture' && (
        <Card className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-ink-faint/40 bg-surface-secondary p-8 transition hover:border-pastel-purple/50 hover:bg-pastel-lavender/10">
            <svg className="h-10 w-10 text-ink-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
            <span className="text-sm font-medium text-ink-secondary">
              {files.length === 0
                ? 'Tap to select or take a photo (multiple images supported)'
                : files.length === 1
                  ? files[0].name
                  : `${files.length} images selected`}
            </span>
            <input
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="hidden"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
          </label>
          <Button onClick={onProcessReceipt} disabled={files.length === 0} className="w-full">
            Process Receipt
          </Button>
        </Card>
      )}

      {/* Processing */}
      {step === 'processing' && (
        <Card className="flex flex-col items-center gap-3 py-8">
          <LoadingSpinner />
          <p className="text-sm text-ink-secondary">Analyzing your receipt{files.length > 1 ? 's' : ''}...</p>
        </Card>
      )}

      {/* Confirm + Assign */}
      {step === 'confirm' && (
        <div className="space-y-4">
          {/* Receipt-level fields */}
          <Card className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-ink-tertiary">Receipt Details</h3>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Nickname (optional)</label>
              <Input
                placeholder="e.g. Groceries with Sarah"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Merchant / Shop</label>
              <Input
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Total Amount</label>
              <Input
                inputMode="decimal"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Paid by</label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="w-full rounded-2xl border border-surface-tertiary bg-surface-primary px-3 py-2 text-base text-ink shadow-soft focus:border-pastel-purple focus:outline-none"
              >
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
                ))}
              </select>
            </div>
          </Card>

          {/* Line items */}
          <Card className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-ink-tertiary">Line Items</h3>
            {items.map((item) => (
              <div
                key={item.key}
                className={`space-y-2 rounded-2xl border p-4 ${item.confidence < 0.85 && item.confidence > 0 ? 'border-pastel-peach/60 bg-orange-50/50' : 'border-ink-faint/30'}`}
              >
                {/* Description + confidence badge + delete */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateItem(item.key, { description: e.target.value })}
                    />
                  </div>
                  {item.confidence > 0 && item.confidence < 0.85 && (
                    <span className="shrink-0 rounded-xl bg-orange-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-600">
                      Uncertain
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteItem(item.key)}
                    className="shrink-0 rounded-xl p-1.5 text-ink-faint transition hover:bg-surface-secondary hover:text-ink-secondary"
                    aria-label="Delete item"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Numeric fields grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div>
                    <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Qty</label>
                    <Input
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Price/unit</label>
                    <Input
                      inputMode="decimal"
                      value={item.price_per_unit}
                      onChange={(e) => updateItem(item.key, { price_per_unit: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Pre-Discount</label>
                    <Input
                      inputMode="decimal"
                      value={item.line_subtotal}
                      onChange={(e) => updateItem(item.key, { line_subtotal: e.target.value })}
                      readOnly={item.isManual}
                      className={item.isManual ? 'bg-surface-secondary text-ink-tertiary' : ''}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Discount</label>
                    <Input
                      inputMode="decimal"
                      value={item.line_discount}
                      onChange={(e) => updateItem(item.key, { line_discount: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">After Discount</label>
                    <Input
                      inputMode="decimal"
                      value={item.final_line_total}
                      onChange={(e) => updateItem(item.key, { final_line_total: e.target.value })}
                      readOnly={item.isManual}
                      className={item.isManual ? 'bg-surface-secondary text-ink-tertiary' : ''}
                    />
                  </div>
                </div>

                {/* Split assignment */}
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Assign to</label>
                  {isMultiUser ? (
                    // 3+ user mode: Equal / Custom toggle + member buttons
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => updateItem(item.key, { assigneeMode: 'equal' })}
                          className={`rounded-xl px-2 py-2 text-xs font-semibold transition-all ${
                            item.assigneeMode === 'equal'
                              ? 'bg-pastel-purple-deep text-white'
                              : 'bg-surface-secondary text-ink-secondary hover:bg-surface-tertiary'
                          }`}
                        >
                          Equal
                        </button>
                        <button
                          type="button"
                          onClick={() => updateItem(item.key, {
                            assigneeMode: 'custom',
                            customAssignees: [...members.map((m) => m.user_id)],
                          })}
                          className={`rounded-xl px-2 py-2 text-xs font-semibold transition-all ${
                            item.assigneeMode === 'custom'
                              ? 'bg-pastel-purple-deep text-white'
                              : 'bg-surface-secondary text-ink-secondary hover:bg-surface-tertiary'
                          }`}
                        >
                          Custom
                        </button>
                      </div>
                      {item.assigneeMode === 'custom' && (
                        <div className="flex flex-wrap gap-1.5">
                          {members.map((m) => (
                            <button
                              key={m.user_id}
                              type="button"
                              onClick={() => toggleItemMember(item.key, m.user_id)}
                              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                                item.customAssignees.includes(m.user_id)
                                  ? 'bg-pastel-lavender/30 text-pastel-purple-deep border border-pastel-purple'
                                  : 'bg-surface-secondary text-ink-tertiary border border-transparent hover:bg-surface-tertiary'
                              }`}
                            >
                              {m.display_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    // 2-user mode: Me / Split / Partner (unchanged)
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: me?.display_name ?? 'Me', value: me?.user_id ?? 'me' },
                        { label: 'Split', value: 'split' },
                        { label: partner?.display_name ?? 'Partner', value: partner?.user_id ?? 'partner' },
                      ].map(({ label, value }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => updateItem(item.key, { assignee: value })}
                          className={`rounded-xl px-2 py-2 text-xs font-semibold transition-all ${
                            item.assignee === value
                              ? 'bg-pastel-purple-deep text-white'
                              : 'bg-surface-secondary text-ink-secondary hover:bg-surface-tertiary'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addItem}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-faint/30 py-3 text-sm font-medium text-ink-tertiary transition hover:border-pastel-purple/40 hover:text-ink-secondary"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add item
            </button>
          </Card>

          {/* Split summary — 3+ user mode */}
          {isMultiUser && splitSummaryMulti && (
            <Card className="space-y-2 bg-surface-secondary">
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
            </Card>
          )}

          {/* Split summary — 2-user mode (unchanged) */}
          {!isMultiUser && splitSummary2 && me && partner && (
            <Card className="space-y-2 bg-surface-secondary">
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
              <div className="flex justify-between text-sm">
                <span className="text-ink-secondary">{partner.display_name} owes</span>
                <span className="font-bold tabular-nums text-ink">
                  {formatCurrency(splitSummary2.partnerOwes, currency)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-secondary">{me.display_name} owes</span>
                <span className="font-bold tabular-nums text-ink">
                  {formatCurrency(splitSummary2.meOwes, currency)}
                </span>
              </div>
            </Card>
          )}

          <Button
            onClick={onConfirm}
            disabled={isSaving || items.length === 0 || !paidBy}
            className="w-full"
          >
            {isSaving ? 'Saving...' : 'Confirm Receipt'}
          </Button>
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isSaving}
            className="w-full"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Summary */}
      {step === 'summary' && (
        <Card className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pastel-mint/30">
            <svg className="h-7 w-7 text-pastel-mint-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-semibold text-ink">Receipt saved and assigned!</p>
          <Button onClick={() => navigate(`/groups/${id}`)} className="w-full">Back to group</Button>
        </Card>
      )}

      <ConfirmDialog {...discardConfirm.dialogProps} />
    </div>
  )
}
