import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import * as authApi from '@/api/auth'
import * as usersApi from '@/api/users'
import { joinGroupByCode } from '@/api/groups'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { LogoutIcon, PencilSquareIcon } from '@/components/ui/icons'
import { FloatCard, PageContent, PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { TAB_THEMES } from '@/lib/theme'
import { getErrorMessage } from '@/utils/errors'

export function ProfilePage() {
  const navigate = useNavigate()
  const { user, logout, setUser } = useAuth()
  const { addToast } = useToast()

  const [editingName, setEditingName] = useState(false)
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [savingName, setSavingName] = useState(false)

  const [changingPw, setChangingPw] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  const [joinCode, setJoinCode] = useState('')
  const [joiningByCode, setJoiningByCode] = useState(false)
  const [joinCodeFocused, setJoinCodeFocused] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingPic, setUploadingPic] = useState(false)

  const avatarSrc = user?.profile_picture ?? null
  const initial = (user?.display_name ?? '?').charAt(0).toUpperCase()

  async function onLogout() {
    await logout()
    addToast('info', 'Logged out')
    navigate('/login', { replace: true })
  }

  const handleSaveName = useCallback(async () => {
    const trimmed = displayName.trim()
    if (!trimmed) return
    setSavingName(true)
    try {
      const updated = await usersApi.updateProfile({ display_name: trimmed })
      setUser(updated)
      setEditingName(false)
      addToast('success', 'Display name updated')
    } catch (err) {
      addToast('error', getErrorMessage(err, 'Failed to update name'))
    } finally {
      setSavingName(false)
    }
  }, [displayName, setUser, addToast])

  const handlePicture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      addToast('error', 'Image must be under 10 MB')
      return
    }
    setUploadingPic(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const updated = await usersApi.updateProfile({ profile_picture: base64 })
      setUser(updated)
      addToast('success', 'Profile picture updated')
    } catch (err) {
      addToast('error', getErrorMessage(err, 'Failed to upload picture'))
    } finally {
      setUploadingPic(false)
    }
  }, [setUser, addToast])

  const handleRemovePicture = useCallback(async () => {
    setUploadingPic(true)
    try {
      const updated = await usersApi.updateProfile({ profile_picture: '' })
      setUser(updated)
      addToast('success', 'Profile picture removed')
    } catch (err) {
      addToast('error', getErrorMessage(err, 'Failed to remove picture'))
    } finally {
      setUploadingPic(false)
    }
  }, [setUser, addToast])

  const handleChangePassword = useCallback(async () => {
    if (newPw.length < 8) {
      addToast('error', 'New password must be at least 8 characters')
      return
    }
    if (newPw !== confirmPw) {
      addToast('error', 'Passwords do not match')
      return
    }
    setSavingPw(true)
    try {
      await usersApi.changePassword(currentPw, newPw)
      addToast('success', 'Password changed')
      setChangingPw(false)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      addToast('error', getErrorMessage(err, 'Failed to change password'))
    } finally {
      setSavingPw(false)
    }
  }, [currentPw, newPw, confirmPw, addToast])

  const handleJoinByCode = useCallback(async () => {
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) {
      addToast('error', 'Join code must be 6 characters')
      return
    }
    setJoiningByCode(true)
    try {
      const result = await joinGroupByCode(code)
      addToast('success', 'Joined group!')
      setJoinCode('')
      navigate(`/groups/${result.group_id}`)
    } catch (err) {
      addToast('error', getErrorMessage(err, 'Failed to join group'))
    } finally {
      setJoiningByCode(false)
    }
  }, [joinCode, addToast, navigate])

  const memberSince =
    user?.created_at
      ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : '—'

  return (
    <>
      <PageHeader
        theme={TAB_THEMES.profile}
        tall
        title={user?.display_name ?? 'Profile'}
        subtitle={`Member since ${memberSince}`}
        leading={
          <button
            type="button"
            className="relative shrink-0 disabled:opacity-50"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPic}
            aria-label="Change profile photo"
          >
            <Avatar
              name={user?.display_name ?? initial}
              src={avatarSrc}
              colorKey={user?.id}
              size="xl"
              shape="rounded"
              onError={() => {
                void (async () => {
                  try {
                    const updated = await authApi.me()
                    setUser(updated)
                  } catch {
                    // ignore — will show initials fallback
                  }
                })()
              }}
            />
            <span
              className="absolute -bottom-1 -right-1 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ink text-white"
              aria-hidden="true"
            >
              <PencilSquareIcon className="h-3.5 w-3.5" />
            </span>
          </button>
        }
      >
        {avatarSrc ? (
          <button
            type="button"
            onClick={handleRemovePicture}
            disabled={uploadingPic}
            className="mt-2 text-xs font-bold text-ink/70 underline"
          >
            Remove photo
          </button>
        ) : null}
      </PageHeader>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePicture} />

      <PageContent className="space-y-3 pb-6">
        <FloatCard className="p-0">
          <div className="divide-y divide-line px-5">
            {/* Display name */}
            <div className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-tertiary">Display name</p>
                  {!editingName && <p className="font-bold text-ink">{user?.display_name}</p>}
                </div>
                {!editingName && (
                  <button
                    type="button"
                    className="shrink-0 text-xs font-extrabold text-orange-600"
                    onClick={() => {
                      setDisplayName(user?.display_name ?? '')
                      setEditingName(true)
                    }}
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingName ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="min-w-0 flex-1"
                    autoFocus
                  />
                  <Button variant="primary" size="sm" disabled={savingName} onClick={handleSaveName}>
                    {savingName ? '...' : 'Save'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingName(false)}>
                    Cancel
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Email */}
            <div className="py-3">
              <p className="text-xs text-ink-tertiary">Email</p>
              <p className="font-bold text-ink">{user?.email ?? '—'}</p>
            </div>

            {/* Password */}
            <div className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-tertiary">Password</p>
                  {!changingPw && <p className="font-bold text-ink">••••••••</p>}
                </div>
                {!changingPw && (
                  <button
                    type="button"
                    className="shrink-0 text-xs font-extrabold text-orange-600"
                    onClick={() => setChangingPw(true)}
                  >
                    Change
                  </button>
                )}
              </div>
              {changingPw ? (
                <div className="mt-3 space-y-3">
                  <Field label="Current password">
                    <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
                  </Field>
                  <Field label="New password">
                    <Input
                      type="password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      placeholder="At least 8 characters"
                    />
                  </Field>
                  <Field label="Confirm new password">
                    <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" disabled={savingPw} onClick={handleChangePassword}>
                      {savingPw ? 'Saving...' : 'Update password'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setChangingPw(false)
                        setCurrentPw('')
                        setNewPw('')
                        setConfirmPw('')
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </FloatCard>

        <Card className="space-y-3">
          <h3 className="text-[15px] font-bold text-ink">Join a group</h3>
          <p className="text-xs text-ink-tertiary">Enter a 6-character invite code to join a group.</p>
          <div className="relative">
            <div className="grid grid-cols-6 gap-1.5" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className={`grid h-12 place-items-center rounded-xl border-[1.5px] text-lg font-extrabold ${
                    joinCodeFocused && i === joinCode.length
                      ? 'border-orange-300 bg-white'
                      : 'border-field-border bg-field'
                  }`}
                >
                  {joinCode[i] ?? ''}
                </div>
              ))}
            </div>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              maxLength={6}
              disabled={joiningByCode}
              aria-label="Join code"
              className="absolute inset-0 h-full w-full cursor-text opacity-0"
              onFocus={() => setJoinCodeFocused(true)}
              onBlur={() => setJoinCodeFocused(false)}
            />
          </div>
          <Button
            variant="dark"
            size="lg"
            className="mt-3 w-full"
            disabled={joiningByCode || joinCode.trim().length !== 6}
            onClick={handleJoinByCode}
          >
            {joiningByCode ? 'Joining...' : 'Join'}
          </Button>
        </Card>

        <Button variant="soft-danger" size="lg" className="w-full" onClick={onLogout}>
          <LogoutIcon className="h-5 w-5" />
          Sign out
        </Button>
      </PageContent>
    </>
  )
}
