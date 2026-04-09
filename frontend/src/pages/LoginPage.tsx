import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { getEmailAllowlistRejectionMessage, getErrorMessage } from '@/utils/errors'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const { addToast } = useToast()
  const location = useLocation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (isAuthenticated) {
    const redirect = (location.state as { from?: string } | undefined)?.from ?? '/groups'
    return <Navigate to={redirect} replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true)
    try {
      await login(values.email, values.password)
      addToast('success', 'Welcome back')
    } catch (error) {
      const allowlistMsg = getEmailAllowlistRejectionMessage(error)
      if (allowlistMsg) {
        addToast('error', allowlistMsg)
      } else {
        addToast('error', getErrorMessage(error, 'Unable to log in'))
      }
    } finally {
      setIsSubmitting(false)
    }
  })

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 shrink-0 overflow-hidden rounded-3xl shadow-glow ring-1 ring-ink-faint/15">
            <img src="/spliteasy-icon.jpeg" alt="" className="h-full w-full object-cover" width={64} height={64} />
          </div>
          <h1 className="text-2xl font-bold text-ink">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-secondary">Sign in to SplitEasy</p>
        </div>
        <Card className="space-y-4">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Email</label>
              <Input type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
              {errors.email && <p className="mt-1.5 text-xs text-rose-500">{errors.email.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Password</label>
              <Input type="password" autoComplete="current-password" placeholder="Your password" {...register('password')} />
              {errors.password && <p className="mt-1.5 text-xs text-rose-500">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
          <p className="text-center text-sm text-ink-secondary">
            Need an account?{' '}
            <Link to="/register" className="font-medium text-pastel-purple-deep hover:underline">
              Create one
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
