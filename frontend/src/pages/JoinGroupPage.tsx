import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { joinGroup } from '@/api/groups'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { UsersIcon, XMarkIcon } from '@/components/ui/icons'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useToast } from '@/context/ToastContext'
import { getErrorMessage } from '@/utils/errors'

export function JoinGroupPage() {
  const { groupId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const invitationId = searchParams.get('invite') ?? ''
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [status, setStatus] = useState<'idle' | 'joining' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!invitationId) {
      void Promise.resolve().then(() => {
        setStatus('error')
        setErrorMsg('No invitation code found in the link.')
      })
    }
  }, [invitationId])

  async function handleJoin() {
    if (!invitationId || !groupId) return
    setStatus('joining')
    try {
      await joinGroup(groupId, invitationId)
      setStatus('success')
      addToast('success', 'You have joined the group!')
      navigate(`/groups/${groupId}`, { replace: true })
    } catch (error) {
      setStatus('error')
      setErrorMsg(getErrorMessage(error, 'Unable to join group'))
      addToast('error', getErrorMessage(error, 'Unable to join group'))
    }
  }

  if (!invitationId && status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-warm px-5">
        <div className="w-full max-w-sm">
          <EmptyState
            tone="danger"
            icon={<XMarkIcon className="h-8 w-8" />}
            title="Invalid Invite Link"
            description={errorMsg}
            action={
              <Button variant="dark" size="lg" className="w-full" onClick={() => navigate('/', { replace: true })}>
                Go Home
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-warm px-5">
      <div className="w-full max-w-sm">
        <EmptyState
          icon={<UsersIcon className="h-8 w-8" />}
          title="Join Group"
          description={
            <>
              <p>You have been invited to join a group. Accept to start splitting expenses together.</p>
              {status === 'error' && (
                <div className="mt-3 space-y-1 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <p className="font-medium">{errorMsg}</p>
                  {errorMsg.toLowerCase().includes('not for your account') && (
                    <p className="text-xs text-rose-600">
                      This invite was sent to a different email address. Make sure you are logged in with the correct account.
                    </p>
                  )}
                </div>
              )}
            </>
          }
          action={
            status === 'joining' ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="space-y-2">
                <Button onClick={handleJoin} variant="primary" size="lg" className="w-full" disabled={status === 'success'}>
                  Accept Invitation
                </Button>
                <Button variant="secondary" size="lg" className="w-full" onClick={() => navigate('/', { replace: true })}>
                  Cancel
                </Button>
              </div>
            )
          }
        />
      </div>
    </div>
  )
}
