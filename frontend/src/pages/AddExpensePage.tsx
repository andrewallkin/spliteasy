import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { listGroups } from '@/api/groups'
import { Card } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useToast } from '@/context/ToastContext'
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
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink">Add Expense</h2>
        <p className="mt-0.5 text-sm text-ink-secondary">Choose a group to add an expense to</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : groups.length === 0 ? (
        <Card className="py-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-pastel-lavender/30">
            <svg className="h-7 w-7 text-pastel-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink">No groups yet</p>
          <p className="mt-1 text-xs text-ink-tertiary">
            <Link to="/groups" className="text-pastel-purple-deep underline">Create a group</Link> first to start adding expenses.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <Card key={group.id}>
              <p className="mb-3 font-semibold text-ink">{group.name}</p>
              <div className="flex gap-2">
                <Link
                  to={`/groups/${group.id}/upload`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-pastel-purple px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pastel-purple-deep"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                  </svg>
                  Scan Receipt
                </Link>
                <Link
                  to={`/groups/${group.id}/manual`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-pastel-purple/30 bg-white px-3 py-2.5 text-sm font-medium text-pastel-purple-deep transition-colors hover:bg-pastel-lavender/20"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                  Manual Entry
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
