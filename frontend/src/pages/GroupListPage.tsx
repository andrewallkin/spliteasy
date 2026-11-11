import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { createGroup, getBalances, getGroupMembers, listGroups } from '@/api/groups'
import { AmountText } from '@/components/ui/AmountText'
import { AvatarStack } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PlusIcon, UsersIcon } from '@/components/ui/icons'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { describeBalance } from '@/lib/balance'
import { groupTheme } from '@/lib/theme'
import type { Group, GroupBalanceResponse, GroupMember } from '@/types/models'
import { getErrorMessage } from '@/utils/errors'

type GroupExtras = { members: GroupMember[]; balance: GroupBalanceResponse }

export function GroupListPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [extras, setExtras] = useState<Record<string, GroupExtras>>({})
  const { addToast } = useToast()
  const { user } = useAuth()

  useEffect(() => {
    async function load() {
      try {
        setGroups(await listGroups())
      } catch (error) {
        addToast('error', getErrorMessage(error, 'Unable to load groups'))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [addToast])

  useEffect(() => {
    let cancelled = false
    for (const group of groups) {
      if (extras[group.id]) continue
      Promise.all([getGroupMembers(group.id), getBalances(group.id)])
        .then(([members, balance]) => {
          if (!cancelled) setExtras((prev) => ({ ...prev, [group.id]: { members, balance } }))
        })
        .catch(() => {
          /* best-effort: card renders without avatars/balance */
        })
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when the group list changes
  }, [groups])

  async function onCreateGroup() {
    const trimmed = name.trim()
    if (!trimmed) {
      addToast('info', 'Enter a group name first')
      return
    }
    setIsCreating(true)
    try {
      const created = await createGroup(trimmed)
      setGroups((previous) => [created, ...previous])
      setName('')
      addToast('success', 'Group created')
    } catch (error) {
      addToast('error', getErrorMessage(error, 'Unable to create group'))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="px-5 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <p className="text-sm text-ink-secondary">Hey {user?.display_name ?? 'there'} 👋</p>
        <h1 className="mt-1 text-[28px] font-extrabold tracking-tight text-ink">
          Split it{' '}
          <span className="bg-[linear-gradient(transparent_60%,#fecdd3_60%)]">easy</span>.
        </h1>
      </div>

      <div className="px-4">
        <div className="rounded-[22px] border-2 border-dashed border-pastel-lavender bg-violet-50/60 px-4 py-3.5">
          {!showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex w-full items-center justify-center gap-2 font-bold text-violet-600"
            >
              <PlusIcon className="h-5 w-5" />
              Start a new group
            </button>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void onCreateGroup()
              }}
            >
              <Input
                fullWidth={false}
                className="min-w-0 flex-1"
                placeholder="New group name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="Group name"
                autoFocus
              />
              <Button className="shrink-0" type="submit" disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create'}
              </Button>
            </form>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 px-4">
          <Skeleton className="h-28 rounded-[26px]" />
          <Skeleton className="h-28 rounded-[26px]" />
          <Skeleton className="h-28 rounded-[26px]" />
        </div>
      ) : groups.length === 0 ? (
        <div className="px-4">
          <EmptyState
            icon={<UsersIcon className="h-8 w-8" />}
            title="No groups yet"
            description="Create your first group above to get started."
          />
        </div>
      ) : (
        <div className="space-y-3 px-4">
          {groups.map((group) => {
            const theme = groupTheme(group.id)
            const data = extras[group.id]
            const summary = data ? describeBalance(data.members, data.balance, user?.id) : null
            const people = data?.members.map((m) => ({
              id: m.user_id,
              name: m.display_name,
              src: m.profile_picture,
            })) ?? []

            return (
              <Link key={group.id} to={`/groups/${group.id}`} className="block">
                <div className={`relative overflow-hidden rounded-[26px] p-4 ${theme.card}`}>
                  <span
                    className={`pointer-events-none absolute -bottom-8 -right-6 h-28 w-28 rounded-full opacity-60 ${theme.blob}`}
                    aria-hidden="true"
                  />
                  <div className="relative space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/70">
                        {group.profile_picture ? (
                          <img
                            src={group.profile_picture}
                            alt={group.name}
                            className="h-full w-full object-cover"
                            onError={async () => {
                              try {
                                setGroups(await listGroups())
                              } catch {
                                // ignore
                              }
                            }}
                          />
                        ) : (
                          <UsersIcon className={`h-6 w-6 ${theme.text}`} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-[17px] text-ink">{group.name}</p>
                        <span className="mt-1 inline-block rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-bold text-ink-secondary">
                          Created{' '}
                          {new Date(group.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      {data ? (
                        people.length > 0 ? (
                          <AvatarStack people={people} />
                        ) : (
                          <span />
                        )
                      ) : (
                        <Skeleton className="h-7 w-20 rounded-full" />
                      )}
                      {data ? (
                        summary ? (
                          summary.tone === 'settled' ? (
                            <p className="text-xs font-bold text-emerald-700">All settled up</p>
                          ) : (
                            <div className="text-right">
                              <p className="text-[11px] font-semibold text-ink-secondary">{summary.label}</p>
                              <AmountText amount={summary.amount} tone={summary.tone} size="sm" />
                            </div>
                          )
                        ) : null
                      ) : (
                        <Skeleton className="h-4 w-16 rounded-full" />
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
