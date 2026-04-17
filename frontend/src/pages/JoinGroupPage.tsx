import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { joinGroup } from '@/api/groups'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
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
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-sm space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pastel-rose/30">
            <svg className="h-8 w-8 text-pastel-rose-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-ink">Invalid Invite Link</h2>
          <p className="text-sm text-ink-secondary">{errorMsg}</p>
          <Button onClick={() => navigate('/', { replace: true })} className="w-full">
            Go Home
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-sm space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-pastel-purple/30 to-pastel-lavender/30">
          <svg className="h-8 w-8 text-pastel-purple-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink">Join Group</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            You have been invited to join a group. Accept to start splitting expenses together.
          </p>
        </div>
        {status === 'error' && (
          <div className="rounded-2xl bg-rose-50/80 px-4 py-3 space-y-1">
            <p className="text-sm font-medium text-rose-700">{errorMsg}</p>
            {errorMsg.toLowerCase().includes('not for your account') && (
              <p className="text-xs text-rose-600">
                This invite was sent to a different email address. Make sure you are logged in with the correct account.
              </p>
            )}
          </div>
        )}
        {status === 'joining' ? (
          <div className="flex justify-center py-4">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-2">
            <Button onClick={handleJoin} className="w-full" disabled={status === 'success'}>
              Accept Invitation
            </Button>
            <Button variant="ghost" onClick={() => navigate('/', { replace: true })} className="w-full">
              Cancel
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
