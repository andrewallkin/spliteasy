import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import * as usersApi from '@/api/users'
import { joinGroupByCode } from '@/api/groups'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
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
    if (file.size > 2 * 1024 * 1024) {
      addToast('error', 'Image must be under 2 MB')
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

  return (
    <div className="space-y-5">
      {/* Profile header */}
      <Card className="flex items-center gap-4">
        <button
          type="button"
          className="group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-pastel-purple/30 to-pastel-lavender/30"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingPic}
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xl font-bold text-pastel-purple-deep">{initial}</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            Edit
          </span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePicture} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-ink">{user?.display_name ?? 'Profile'}</h2>
          <p className="text-xs text-ink-tertiary">
            Member since{' '}
            {user?.created_at
              ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
              : '—'}
          </p>
        </div>
        {avatarSrc && (
          <button
            type="button"
            onClick={handleRemovePicture}
            disabled={uploadingPic}
            className="text-xs text-ink-tertiary hover:text-pastel-rose-deep"
          >
            Remove
          </button>
        )}
      </Card>

      {/* Account info */}
      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Account</h3>

        {/* Display name */}
        <div className="rounded-2xl bg-surface-secondary px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-secondary">Display Name</span>
            {!editingName && (
              <button type="button" className="text-xs font-medium text-pastel-purple-deep" onClick={() => { setDisplayName(user?.display_name ?? ''); setEditingName(true) }}>
                Edit
              </button>
            )}
          </div>
          {editingName ? (
            <div className="mt-2 flex gap-2">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-9 text-sm"
                autoFocus
              />
              <Button variant="primary" className="h-9 px-3 text-xs" disabled={savingName} onClick={handleSaveName}>
                {savingName ? '...' : 'Save'}
              </Button>
              <Button variant="ghost" className="h-9 px-3 text-xs" onClick={() => setEditingName(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <p className="mt-0.5 text-sm font-medium text-ink">{user?.display_name}</p>
          )}
        </div>

        {/* Email */}
        <div className="flex items-center justify-between rounded-2xl bg-surface-secondary px-4 py-3">
          <span className="text-sm text-ink-secondary">Email</span>
          <span className="text-sm font-medium text-ink">{user?.email ?? '—'}</span>
        </div>
      </Card>

      {/* Change password */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Password</h3>
          {!changingPw && (
            <button type="button" className="text-xs font-medium text-pastel-purple-deep" onClick={() => setChangingPw(true)}>
              Change
            </button>
          )}
        </div>
        {changingPw && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-ink-secondary">Current password</label>
              <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-secondary">New password</label>
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-secondary">Confirm new password</label>
              <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="primary" className="h-9 px-4 text-xs" disabled={savingPw} onClick={handleChangePassword}>
                {savingPw ? 'Saving...' : 'Update password'}
              </Button>
              <Button variant="ghost" className="h-9 px-4 text-xs" onClick={() => { setChangingPw(false); setCurrentPw(''); setNewPw(''); setConfirmPw('') }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Join group by code */}
      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Join Group by Code</h3>
        <p className="text-xs text-ink-tertiary">Enter a 6-character invite code to join a group.</p>
        <div className="flex gap-2">
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="e.g. DX5V3E"
            maxLength={6}
            className="font-mono tracking-widest uppercase"
          />
          <Button variant="primary" className="shrink-0" disabled={joiningByCode || joinCode.trim().length !== 6} onClick={handleJoinByCode}>
            {joiningByCode ? 'Joining...' : 'Join'}
          </Button>
        </div>
      </Card>

      <Button variant="danger" onClick={onLogout} className="w-full">
        Sign out
      </Button>
    </div>
  )
}
