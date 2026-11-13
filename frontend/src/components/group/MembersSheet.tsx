import { Avatar } from '@/components/ui/Avatar'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { CopyIcon } from '@/components/ui/icons'
import { Input } from '@/components/ui/Input'
import type { GroupInvitation, GroupMember } from '@/types/models'

type Props = {
  isOpen: boolean
  onClose: () => void
  members: GroupMember[]
  currentUserId: string | undefined
  isOwner: boolean
  isMultiUser: boolean
  inviteEmail: string
  onInviteEmailChange: (value: string) => void
  onInvite: () => void
  isInviting: boolean
  invitations: GroupInvitation[]
  copiedId: string | null
  onCopy: (text: string, label: string, itemId: string) => void
  groupId: string
  onMemberAvatarError: () => void
}

export function MembersSheet({
  isOpen,
  onClose,
  members,
  currentUserId,
  isOwner,
  isMultiUser,
  inviteEmail,
  onInviteEmailChange,
  onInvite,
  isInviting,
  invitations,
  copiedId,
  onCopy,
  groupId,
  onMemberAvatarError,
}: Props) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Members">
      <div className="space-y-4">
        <ul className="space-y-3">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3">
              <Avatar
                name={m.display_name}
                src={m.profile_picture}
                colorKey={m.user_id}
                size="md"
                shape="rounded"
                onError={onMemberAvatarError}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">
                  {m.display_name}
                  {m.user_id === currentUserId ? ' (you)' : ''}
                </p>
                <p className="text-xs text-ink-tertiary capitalize">{m.role}</p>
              </div>
            </li>
          ))}
        </ul>

        {isOwner && (
          <div className="space-y-4 border-t border-line pt-4">
            <h3 className="text-sm font-bold text-ink">{isMultiUser ? 'Invite Member' : 'Invite Partner'}</h3>
            <div className="space-y-2">
              <p className="text-xs text-ink-secondary">Enter the email of the person you want to invite.</p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => onInviteEmailChange(e.target.value)}
                  placeholder="partner@example.com"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void onInvite()
                    }
                  }}
                />
                <Button className="shrink-0" onClick={onInvite} disabled={isInviting || !inviteEmail.trim()}>
                  {isInviting ? 'Sending...' : 'Invite'}
                </Button>
              </div>
            </div>

            {invitations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-ink-secondary">Invitations</h4>
                {invitations.map((inv) => {
                  const inviteLink = `${window.location.origin}/join/${groupId}?invite=${inv.invitation_id}`
                  const isPending = inv.status === 'pending'
                  const isExpired = inv.status === 'expired'
                  const isAccepted = inv.status === 'accepted'

                  return (
                    <div
                      key={inv.invitation_id}
                      className={`rounded-2xl border-[1.5px] px-4 py-3 ${
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
                            <span
                              className={`text-xs font-semibold ${
                                isAccepted ? 'text-emerald-600' : isExpired ? 'text-ink-tertiary' : 'text-pastel-purple-deep'
                              }`}
                            >
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
                              onClick={() => onCopy(inviteLink, 'Link', `link-${inv.invitation_id}`)}
                              className="inline-flex items-center gap-1 rounded-xl bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-100"
                            >
                              <CopyIcon className="h-3.5 w-3.5" />
                              {copiedId === `link-${inv.invitation_id}` ? 'Copied!' : 'Copy Link'}
                            </button>
                            {inv.join_code && (
                              <button
                                type="button"
                                onClick={() => onCopy(inv.join_code!, 'Code', `code-${inv.invitation_id}`)}
                                className="inline-flex items-center gap-1 rounded-xl bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-100"
                              >
                                <CopyIcon className="h-3.5 w-3.5" />
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
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
