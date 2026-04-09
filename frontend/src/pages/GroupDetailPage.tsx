import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  deleteGroup,
  getBalances,
  getGroup,
  getGroupMembers,
  getInvitations,
  inviteToGroup,
  listReceipts,
  updateGroup,
} from '@/api/groups'
import { GroupScopedHistory } from '@/components/history/GroupScopedHistory'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import type { Group, GroupBalanceResponse, GroupInvitation, GroupMember, Receipt } from '@/types/models'
import { formatCurrency } from '@/utils/currency'
import { getErrorMessage } from '@/utils/errors'

export function GroupDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()
  const deleteGroupConfirm = useConfirmDialog()

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

  const partner = members.find((m) => m.user_id !== user?.id)
  const myMembership = members.find((m) => m.user_id === user?.id)
  const isOwner = myMembership?.role === 'owner'
  const hasPartner = members.length >= 2

  const myBalance = balance?.balances.find((b) => b.user_id === user?.id)
  const myNet = Number(myBalance?.net_amount ?? 0)

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
      navigate('/groups')
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to delete group'))
    } finally {
      setIsDeletingGroup(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    )
  }

  const partnerDisplayName = partner?.display_name ?? 'partner'

  return (
    <div className="space-y-4">
      {/* Group header & balance */}
      <Card className="space-y-3">
        <div className="space-y-3">
          {isOwner && isEditingName ? (
            <div className="space-y-2">
              <label htmlFor="group-name" className="text-xs font-semibold text-ink-secondary">
                Group name
              </label>
              <input
                id="group-name"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                className="w-full rounded-2xl border border-ink-faint/40 bg-surface px-4 py-2.5 text-sm text-ink focus:border-pastel-purple focus:outline-none"
                maxLength={255}
              />
              <div className="flex gap-2">
                <Button onClick={onRenameGroup} disabled={isSavingName} className="h-9 rounded-xl px-4 text-xs">
                  {isSavingName ? 'Saving...' : 'Save Name'}
                </Button>
                <Button variant="secondary" onClick={() => { setNameDraft(group?.name ?? ''); setIsEditingName(false) }} className="h-9 rounded-xl px-4 text-xs">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold text-ink">{group?.name ?? 'Group'}</h2>
              {isOwner && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" onClick={() => setIsEditingName(true)} className="h-9 rounded-xl px-4 text-xs">
                    Rename
                  </Button>
                  <Button variant="danger" onClick={onDeleteGroup} disabled={isDeletingGroup} className="h-9 rounded-xl px-4 text-xs">
                    {isDeletingGroup ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        {balance?.is_settled ? (
          <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-50/80 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pastel-mint/30">
              <svg className="h-4 w-4 text-pastel-mint-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-emerald-700">All settled up</span>
          </div>
        ) : (
          <div className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 ${myNet < 0 ? 'bg-rose-50/80' : 'bg-emerald-50/80'}`}>
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${myNet < 0 ? 'bg-pastel-rose/30' : 'bg-pastel-mint/30'}`}>
              {myNet < 0 ? (
                <svg className="h-4 w-4 text-pastel-rose-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              ) : (
                <svg className="h-4 w-4 text-pastel-mint-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                </svg>
              )}
            </div>
            <span className={`text-sm font-semibold ${myNet < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {myNet < 0
                ? `You owe ${partnerDisplayName} ${formatCurrency(Math.abs(myNet))}`
                : myNet > 0
                  ? `${partnerDisplayName} owes you ${formatCurrency(myNet)}`
                  : 'All settled up'}
            </span>
          </div>
        )}
      </Card>

      {/* Pending receipts */}
      {pendingReceipts.length > 0 && (
        <Card className="border-pastel-peach/40 bg-orange-50/60">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-sm font-medium text-orange-800">
              {pendingReceipts.length} receipt draft{pendingReceipts.length > 1 ? 's' : ''} pending review
            </p>
          </div>
        </Card>
      )}

      {/* Action grid */}
      <div className="grid grid-cols-2 gap-3">
        <Link to={`/groups/${id}/upload`}>
          <Card className="flex h-24 flex-col items-center justify-center gap-2 transition-all duration-200 hover:shadow-soft-lg hover:-translate-y-0.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pastel-lavender/30">
              <svg className="h-5 w-5 text-pastel-purple-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-ink-secondary">Upload Receipt</span>
          </Card>
        </Link>
        <Link to={`/groups/${id}/manual`}>
          <Card className="flex h-24 flex-col items-center justify-center gap-2 transition-all duration-200 hover:shadow-soft-lg hover:-translate-y-0.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pastel-sky/30">
              <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-ink-secondary">Manual Entry</span>
          </Card>
        </Link>
        <Link to={`/groups/${id}/settle`}>
          <Card className="flex h-24 flex-col items-center justify-center gap-2 transition-all duration-200 hover:shadow-soft-lg hover:-translate-y-0.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pastel-mint/30">
              <svg className="h-5 w-5 text-pastel-mint-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-ink-secondary">Settle Up</span>
          </Card>
        </Link>
        <Link to={`/groups/${id}/history`}>
          <Card className="flex h-24 flex-col items-center justify-center gap-2 transition-all duration-200 hover:shadow-soft-lg hover:-translate-y-0.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pastel-peach/30">
              <svg className="h-5 w-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-ink-secondary">History</span>
          </Card>
        </Link>
      </div>

      {/* Members */}
      <Card className="space-y-3">
        <h3 className="text-sm font-bold text-ink">Members</h3>
        <div className="space-y-2.5">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-pastel-purple/20 to-pastel-lavender/20">
                <span className="text-sm font-bold text-pastel-purple-deep">
                  {m.display_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">
                  {m.display_name}{m.user_id === user?.id ? ' (you)' : ''}
                </p>
                <p className="text-xs text-ink-tertiary capitalize">{m.role}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <GroupScopedHistory groupId={id} variant="embedded" />

      {/* Invitations */}
      {!hasPartner && (
        <Card className="space-y-4">
          <h3 className="text-sm font-bold text-ink">Invite Partner</h3>

          {/* Create new invitation */}
          <div className="space-y-2">
            <p className="text-xs text-ink-secondary">Enter the email of the person you want to invite.</p>
            <div className="flex gap-2">
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="partner@example.com"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void onInvite() } }}
              />
              <Button className="shrink-0" onClick={onInvite} disabled={isInviting || !inviteEmail.trim()}>
                {isInviting ? 'Sending...' : 'Invite'}
              </Button>
            </div>
          </div>

          {/* Existing invitations */}
          {invitations.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-ink-secondary">Invitations</h4>
              {invitations.map((inv) => {
                const inviteLink = `${window.location.origin}/join/${id}?invite=${inv.invitation_id}`
                const isPending = inv.status === 'pending'
                const isExpired = inv.status === 'expired'
                const isAccepted = inv.status === 'accepted'

                return (
                  <div
                    key={inv.invitation_id}
                    className={`rounded-2xl border px-4 py-3 ${
                      isAccepted
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : isExpired
                          ? 'border-ink-faint/20 bg-surface-secondary opacity-60'
                          : 'border-pastel-lavender/40 bg-pastel-lavender/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{inv.invited_email}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className={`text-xs font-semibold ${
                            isAccepted ? 'text-emerald-600' : isExpired ? 'text-ink-tertiary' : 'text-pastel-purple-deep'
                          }`}>
                            {isAccepted ? 'Accepted' : isExpired ? 'Expired' : 'Pending'}
                          </span>
                          {!isAccepted && (
                            <span className="text-xs text-ink-tertiary">
                              Expires {new Date(inv.expires_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {isPending && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(inviteLink, 'Link', `link-${inv.invitation_id}`)}
                            className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-pastel-purple-deep transition-colors hover:bg-pastel-lavender/20"
                          >
                            {copiedId === `link-${inv.invitation_id}` ? 'Copied!' : 'Copy Link'}
                          </button>
                          {inv.join_code && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(inv.join_code!, 'Code', `code-${inv.invitation_id}`)}
                              className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-pastel-purple-deep transition-colors hover:bg-pastel-lavender/20"
                            >
                              {copiedId === `code-${inv.invitation_id}` ? 'Copied!' : inv.join_code}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}
      <ConfirmDialog {...deleteGroupConfirm.dialogProps} isLoading={isDeletingGroup} />
    </div>
  )
}
