import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { listGroups } from '@/api/groups'
import { EmptyState } from '@/components/ui/EmptyState'
import { CameraIcon, PencilSquareIcon, PlusIcon, UsersIcon } from '@/components/ui/icons'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { PageContent, PageHeader } from '@/components/ui/PageHeader'
import { useToast } from '@/context/ToastContext'
import { groupTheme, TAB_THEMES } from '@/lib/theme'
import type { Group } from '@/types/models'
import { getErrorMessage } from '@/utils/errors'

export function AddExpensePage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
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

  return (
    <>
      <PageHeader
        theme={TAB_THEMES.add}
        title="Add Expense"
        subtitle="Choose a group to add an expense to"
      />
      <PageContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<PlusIcon className="h-8 w-8" />}
            title="No groups yet"
            description={
              <>
                <Link to="/" className="text-pastel-purple-deep underline">
                  Create a group
                </Link>{' '}
                first to start adding expenses.
              </>
            }
          />
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const theme = groupTheme(group.id)
              return (
                <div key={group.id} className={`rounded-[26px] p-4 ${theme.card}`}>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/70">
                      {group.profile_picture ? (
                        <img
                          src={group.profile_picture}
                          alt={group.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <UsersIcon className={`h-6 w-6 ${theme.text}`} />
                      )}
                    </div>
                    <p className="font-extrabold text-[17px] text-ink">{group.name}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to={`/groups/${group.id}/upload`}
                      className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl font-extrabold text-white ${theme.accentBtn}`}
                    >
                      <CameraIcon className="h-4 w-4" />
                      Scan Receipt
                    </Link>
                    <Link
                      to={`/groups/${group.id}/manual`}
                      className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/80 font-extrabold text-ink"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                      Manual Entry
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PageContent>
    </>
  )
}
