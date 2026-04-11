import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import * as authApi from '@/api/auth'
import { setAccessToken } from '@/api/client'
import type { User } from '@/types/models'

type AuthContextType = {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, displayName: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/** Single-flight load so React Strict Mode / double mount does not call refresh twice (backend tokens are one-use). */
let initialSessionPromise: Promise<User | null> | null = null

function loadUserFromRefreshCookie(): Promise<User | null> {
  if (!initialSessionPromise) {
    initialSessionPromise = (async () => {
      try {
        const refreshed = await authApi.refresh()
        setAccessToken(refreshed.access_token)
        return await authApi.me()
      } catch {
        setAccessToken(null)
        return null
      }
    })()
  }
  return initialSessionPromise
}

function invalidateSessionBootstrapCache() {
  initialSessionPromise = null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void loadUserFromRefreshCookie().then((me) => {
      if (cancelled) return
      setUser(me)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function handleSessionExpired() {
      invalidateSessionBootstrapCache()
      setUser(null)
    }
    window.addEventListener('auth:session-expired', handleSessionExpired)
    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired)
    }
  }, [])

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      async login(email, password) {
        const data = await authApi.login(email, password)
        setAccessToken(data.access_token)
        setUser(data.user)
      },
      async register(email, displayName, password) {
        const data = await authApi.register(email, displayName, password)
        setAccessToken(data.access_token)
        setUser(data.user)
      },
      async logout() {
        await authApi.logout()
        invalidateSessionBootstrapCache()
        setAccessToken(null)
        setUser(null)
      },
      setUser,
    }),
    [isLoading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
