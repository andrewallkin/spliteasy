import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { createGroup, listGroups } from '@/api/groups'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useToast } from '@/context/ToastContext'
import type { Group } from '@/types/models'
import { getErrorMessage } from '@/utils/errors'

const groupColors = [
  'from-pastel-purple/20 to-pastel-lavender/20',
  'from-pastel-mint/20 to-emerald-100/20',
  'from-pastel-rose/20 to-pink-100/20',
  'from-pastel-sky/20 to-blue-100/20',
  'from-pastel-peach/20 to-orange-100/20',
]

const groupIcons = [
  'text-pastel-purple-deep',
  'text-pastel-mint-deep',
  'text-pastel-rose-deep',
  'text-blue-500',
  'text-orange-500',
]

export function GroupListPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const { addToast } = useToast()

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
      <div>
        <h2 className="text-xl font-bold text-ink">Your Groups</h2>
        <p className="mt-0.5 text-sm text-ink-secondary">Manage and split expenses</p>
      </div>

      <Card className="space-y-3">
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
          />
          <Button className="shrink-0" type="submit" disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create'}
          </Button>
        </form>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : groups.length === 0 ? (
        <Card className="py-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-pastel-lavender/30">
            <svg className="h-7 w-7 text-pastel-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink">No groups yet</p>
          <p className="mt-1 text-xs text-ink-tertiary">Create your first group above to get started.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group, index) => (
            <Link key={group.id} to={`/groups/${group.id}`} className="block">
              <Card className="transition-all duration-200 hover:shadow-soft-lg hover:-translate-y-0.5">
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${groupColors[index % groupColors.length]}`}>
                    <svg className={`h-6 w-6 ${groupIcons[index % groupIcons.length]}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-ink">{group.name}</p>
                    <p className="mt-0.5 text-xs text-ink-tertiary">
                      Created {new Date(group.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <svg className="h-5 w-5 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
