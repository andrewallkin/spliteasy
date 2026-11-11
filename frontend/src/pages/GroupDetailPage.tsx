import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  deleteGroup,
  deleteReceipt,
  getBalances,
  getGroup,
  getGroupMembers,
  getInvitations,
  getSuggestedSettlements,
  inviteToGroup,
  listReceipts,
  updateGroup,
  updateGroupProfilePicture,
} from '@/api/groups'
import { GroupScopedHistory } from '@/components/history/GroupScopedHistory'
import { MembersSheet } from '@/components/group/MembersSheet'
import { RenameGroupSheet } from '@/components/group/RenameGroupSheet'
import { ActionSheet } from '@/components/ui/ActionSheet'
import { AmountText } from '@/components/ui/AmountText'
import { AvatarStack } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { microLabelClassName } from '@/components/ui/Field'
import {
  BanknotesIcon,
  CameraIcon,
  CheckIcon,
  ClockIcon,
  EllipsisIcon,
  PencilSquareIcon,
  PhotoIcon,
  TrashIcon,
  UsersIcon,
  WarningIcon,
  XMarkIcon,
} from '@/components/ui/icons'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { FloatCard, headerIconButtonClassName, PageContent, PageHeader } from '@/components/ui/PageHeader'
import { describeBalance } from '@/lib/balance'
import { groupTheme } from '@/lib/theme'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import type { Group, GroupBalanceResponse, GroupInvitation, GroupMember, Receipt, SuggestedSettlement } from '@/types/models'
import { formatCurrency } from '@/utils/currency'
import { getErrorMessage } from '@/utils/errors'

export function GroupDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()
  const deleteGroupConfirm = useConfirmDialog()
  const discardDraftsConfirm = useConfirmDialog()

  const [group, setGroup] = useState<Group | null>(null)
  const [balance, setBalance] = useState<GroupBalanceResponse | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [pendingReceipts, setPendingReceipts] = useState<Receipt[]>([])
  const [invitations, setInvitations] = useState<GroupInvitation[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isInviting, setIsInviting] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)
  const [isDeletingGroup, setIsDeletingGroup] = useState(false)
  const [uploadingGroupPic, setUploadingGroupPic] = useState(false)
  const [suggestedSettlements, setSuggestedSettlements] = useState<SuggestedSettlement[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const groupPicInputRef = useRef<HTMLInputElement>(null)

  const myMembership = members.find((m) => m.user_id === user?.id)
  const isOwner = myMembership?.role === 'owner'
  const isMultiUser = members.length > 2

  useEffect(() => {
    async function load() {
      try {
        const [groupData, balanceData, membersData, receiptsData, invData] = await Promise.all([
          getGroup(id),
          getBalances(id),
          getGroupMembers(id),
          listReceipts(id, 'pending_review'),
          getInvitations(id),
        ])
        setGroup(groupData)
        setNameDraft(groupData.name)
        setBalance(balanceData)
        setMembers(membersData)
        setPendingReceipts(receiptsData)
        setInvitations(invData)
        // Fetch suggested settlements for multi-user groups
        if (membersData.length > 2) {
          getSuggestedSettlements(id).then(setSuggestedSettlements).catch(() => {/* best-effort */})
        }
      } catch (error) {
        addToast('error', getErrorMessage(error, 'Unable to load group details'))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [id, addToast])

  const onInvite = useCallback(async () => {
    const email = inviteEmail.trim()
    if (!email) {
      addToast('error', 'Enter the email of the person to invite')
      return
    }
    setIsInviting(true)
    try {
      await inviteToGroup(id, email)
      const updated = await getInvitations(id)
      setInvitations(updated)
      setInviteEmail('')
      addToast('success', `Invitation sent to ${email}`)
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to create invite'))
    } finally {
      setIsInviting(false)
    }
  }, [id, inviteEmail, addToast])

  const copyToClipboard = useCallback(async (text: string, label: string, itemId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(itemId)
      addToast('success', `${label} copied!`)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      addToast('error', 'Failed to copy')
    }
  }, [addToast])

  async function onRenameGroup() {
    const trimmedName = nameDraft.trim()
    if (!trimmedName) {
      addToast('error', 'Group name cannot be empty')
      return
    }
    if (!group || trimmedName === group.name) {
      setIsEditingName(false)
      return
    }

    setIsSavingName(true)
    try {
      const updatedGroup = await updateGroup(id, trimmedName)
      setGroup(updatedGroup)
      setNameDraft(updatedGroup.name)
      setIsEditingName(false)
      addToast('success', 'Group name updated')
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to rename group'))
    } finally {
      setIsSavingName(false)
    }
  }

  async function onDeleteGroup() {
    if (!group) return
    const confirmed = await deleteGroupConfirm.confirm({
      title: 'Delete group?',
      message: `Delete "${group.name}"? This cannot be undone.`,
      confirmLabel: 'Delete group',
    })
    if (!confirmed) return

    setIsDeletingGroup(true)
    try {
      await deleteGroup(id)
      addToast('success', 'Group deleted')
      navigate('/')
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to delete group'))
    } finally {
      setIsDeletingGroup(false)
    }
  }

  async function onDiscardDraft(receiptId: string) {
    const confirmed = await discardDraftsConfirm.confirm({
      title: 'Discard receipt draft?',
      message: 'This draft will be permanently deleted.',
      confirmLabel: 'Discard',
    })
    if (!confirmed) return
    await deleteReceipt(receiptId).catch(() => {/* best-effort */})
    setPendingReceipts((prev) => prev.filter((r) => r.id !== receiptId))
  }

  async function onGroupPictureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      addToast('error', 'Image must be under 10 MB')
      return
    }
    setUploadingGroupPic(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const updated = await updateGroupProfilePicture(id, base64)
      setGroup(updated)
      addToast('success', 'Group picture updated')
    } catch (err) {
      addToast('error', getErrorMessage(err, 'Failed to upload picture'))
    } finally {
      setUploadingGroupPic(false)
      if (groupPicInputRef.current) groupPicInputRef.current.value = ''
    }
  }

  async function onRemoveGroupPicture() {
    setUploadingGroupPic(true)
    try {
      const updated = await updateGroupProfilePicture(id, '')
      setGroup(updated)
      addToast('success', 'Group picture removed')
    } catch (err) {
      addToast('error', getErrorMessage(err, 'Failed to remove picture'))
    } finally {
      setUploadingGroupPic(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner />
      </div>
    )
  }

  const theme = groupTheme(id)
  const balanceSummary = balance ? describeBalance(members, balance, user?.id) : null
  const showSettledBalance = !balanceSummary || balanceSummary.tone === 'settled'
  const memberPeople = members.map((m) => ({
    id: m.user_id,
    name: m.display_name,
    src: m.profile_picture,
  }))
  const memberNamesSummary = members
    .map((m) => (m.user_id === user?.id ? `${m.display_name} (you)` : m.display_name))
    .join(', ')

  return (
    <>
      <PageHeader
        theme={theme}
        tall
        back="/"
        title={group?.name ?? 'Group'}
        subtitle={`${members.length} members`}
        right={
          <button
            type="button"
            aria-label="Group options"
            className={headerIconButtonClassName}
            onClick={() => setMenuOpen(true)}
          >
            <EllipsisIcon className="h-5 w-5" />
          </button>
        }
        leading={
          <button
            type="button"
            className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-white/40"
            onClick={() => groupPicInputRef.current?.click()}
            disabled={uploadingGroupPic}
          >
            {group?.profile_picture ? (
              <img
                src={group.profile_picture}
                alt={group.name}
                className="h-full w-full object-cover"
                onError={async () => {
                  try {
                    const updated = await getGroup(id)
                    setGroup(updated)
                  } catch {
                    // ignore
                  }
                }}
              />
            ) : (
              <UsersIcon className={`h-7 w-7 ${theme.text}`} />
            )}
            {uploadingGroupPic && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                <LoadingSpinner />
              </span>
            )}
          </button>
        }
      />
      <input ref={groupPicInputRef} type="file" accept="image/*" className="hidden" onChange={onGroupPictureChange} />

      <PageContent>
        <FloatCard>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {showSettledBalance ? (
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pastel-mint/30"
                    aria-hidden="true"
                  >
                    <CheckIcon className="h-5 w-5 text-pastel-mint-deep" />
                  </span>
                  <span className="text-sm font-extrabold text-emerald-700">All settled up</span>
                </div>
              ) : balanceSummary ? (
                <>
                  <p className="text-xs font-semibold text-ink-secondary">{balanceSummary.label}</p>
                  <AmountText amount={balanceSummary.amount} tone={balanceSummary.tone} size="xl" />
                </>
              ) : null}
            </div>
            <Link
              to={`/groups/${id}/settle`}
              className="shrink-0 rounded-2xl bg-ink px-4 py-2.5 text-sm font-extrabold text-white"
            >
              Settle
            </Link>
          </div>
          {isMultiUser && suggestedSettlements.length > 0 && (
            <div className="mt-4 border-t border-dashed border-line pt-4">
              <p className={`${microLabelClassName} mb-2`}>Suggested settlements</p>
              <div className="space-y-2">
                {suggestedSettlements.map((s, i) => {
                  const isMe = s.from_user_id === user?.id
                  const paysMe = s.to_user_id === user?.id
                  return (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-ink-secondary">
                        {isMe ? 'You pay' : `${s.from_display_name} pays`} {paysMe ? 'you' : s.to_display_name}
                      </span>
                      <span
                        className={`font-bold tabular-nums ${isMe ? 'text-rose-700' : paysMe ? 'text-emerald-700' : 'text-ink'}`}
                      >
                        {formatCurrency(Number(s.amount))}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </FloatCard>

        {pendingReceipts.length > 0 && (
          <div className="space-y-3 rounded-3xl border-[1.5px] border-orange-200 bg-orange-50/70 p-4">
            <div className="flex items-center gap-2">
              <WarningIcon className="h-4 w-4 shrink-0 text-orange-500" />
              <p className="text-sm font-semibold text-orange-800">
                {pendingReceipts.length} receipt draft{pendingReceipts.length > 1 ? 's' : ''} pending review
              </p>
            </div>
            <div className="space-y-1.5">
              {pendingReceipts.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-white/80 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-orange-900">
                      {r.merchant_name ?? r.nickname ?? 'Unnamed receipt'}
                    </p>
                    <p className="text-xs text-orange-600">
                      {new Date(r.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      to={`/groups/${id}/upload?receiptId=${r.id}`}
                      className="rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-orange-600"
                    >
                      Resume
                    </Link>
                    <button
                      type="button"
                      onClick={() => onDiscardDraft(r.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-orange-500 transition hover:bg-orange-200 hover:text-orange-700"
                      aria-label="Discard draft"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          <Link
            to={`/groups/${id}/upload`}
            className={`flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[11px] font-bold ${theme.tile}`}
          >
            <CameraIcon className="h-6 w-6" />
            Scan
          </Link>
          <Link
            to={`/groups/${id}/manual`}
            className={`flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[11px] font-bold ${theme.tile}`}
          >
            <PencilSquareIcon className="h-6 w-6" />
            Manual
          </Link>
          <Link
            to={`/groups/${id}/settle`}
            className={`flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[11px] font-bold ${theme.tile}`}
          >
            <BanknotesIcon className="h-6 w-6" />
            Settle
          </Link>
          <Link
            to={`/groups/${id}/history`}
            className={`flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[11px] font-bold ${theme.tile}`}
          >
            <ClockIcon className="h-6 w-6" />
            History
          </Link>
        </div>

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-extrabold text-ink">Members</h3>
            {isOwner && (
              <button
                type="button"
                className={`text-sm font-bold ${theme.text}`}
                onClick={() => setMembersOpen(true)}
              >
                ＋ Invite
              </button>
            )}
          </div>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-2xl py-1 text-left transition hover:bg-surface-secondary"
            onClick={() => setMembersOpen(true)}
            aria-label="View members"
          >
            <AvatarStack people={memberPeople} size="sm" />
            <p className="min-w-0 truncate text-sm font-semibold text-ink-secondary">{memberNamesSummary}</p>
          </button>
        </Card>

        <GroupScopedHistory
          groupId={id}
          variant="embedded"
          onBalancesChanged={() => {
            void getBalances(id).then((data) => {
              setBalance(data)
              if (isMultiUser) {
                getSuggestedSettlements(id).then(setSuggestedSettlements).catch(() => {/* best-effort */})
              }
            })
          }}
        />
      </PageContent>

      <ActionSheet
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Group options"
        actions={[
          {
            key: 'change-photo',
            label: 'Change photo',
            icon: <PhotoIcon className="h-5 w-5" />,
            onSelect: () => groupPicInputRef.current?.click(),
          },
          {
            key: 'remove-photo',
            label: 'Remove photo',
            icon: <TrashIcon className="h-5 w-5" />,
            hidden: !group?.profile_picture,
            onSelect: () => void onRemoveGroupPicture(),
          },
          {
            key: 'rename',
            label: 'Rename group',
            icon: <PencilSquareIcon className="h-5 w-5" />,
            hidden: !isOwner,
            onSelect: () => setIsEditingName(true),
          },
          {
            key: 'members',
            label: 'Members & invites',
            icon: <UsersIcon className="h-5 w-5" />,
            onSelect: () => setMembersOpen(true),
          },
          {
            key: 'delete',
            label: 'Delete group',
            icon: <TrashIcon className="h-5 w-5" />,
            tone: 'danger',
            hidden: !isOwner,
            disabled: isDeletingGroup,
            onSelect: () => void onDeleteGroup(),
          },
        ]}
      />

      <RenameGroupSheet
        isOpen={isOwner && isEditingName}
        onClose={() => {
          setNameDraft(group?.name ?? '')
          setIsEditingName(false)
        }}
        closeDisabled={isSavingName}
        nameDraft={nameDraft}
        onNameDraftChange={setNameDraft}
        onSave={() => void onRenameGroup()}
        isSaving={isSavingName}
        theme={theme}
      />

      <MembersSheet
        isOpen={membersOpen}
        onClose={() => setMembersOpen(false)}
        members={members}
        currentUserId={user?.id}
        isOwner={isOwner}
        isMultiUser={isMultiUser}
        inviteEmail={inviteEmail}
        onInviteEmailChange={setInviteEmail}
        onInvite={() => void onInvite()}
        isInviting={isInviting}
        invitations={invitations}
        copiedId={copiedId}
        onCopy={(text, label, itemId) => void copyToClipboard(text, label, itemId)}
        groupId={id}
        onMemberAvatarError={() => {
          void (async () => {
            try {
              const updated = await getGroupMembers(id)
              setMembers(updated)
            } catch {
              // ignore
            }
          })()
        }}
      />

      <ConfirmDialog {...deleteGroupConfirm.dialogProps} isLoading={isDeletingGroup} />
      <ConfirmDialog {...discardDraftsConfirm.dialogProps} />
    </>
  )
}
