import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
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
    const redirect = (location.state as { from?: string } | undefined)?.from ?? '/'
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
    <div className="min-h-screen bg-surface-warm">
      <div className="relative h-64 overflow-hidden rounded-b-[40px] bg-gradient-to-br from-pastel-lavender via-violet-200 to-pastel-rose">
        <div className="absolute -right-10 -top-[30px] h-40 w-40 rounded-full bg-white/25" />
        <div className="absolute -left-5 bottom-[30px] h-[90px] w-[90px] rounded-full bg-pastel-mint/50" />
        <div className="absolute bottom-7 left-6">
          <div className="mb-3.5 flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-white">
            <img src="/favicon.png" alt="" className="h-full w-full object-cover" width={56} height={56} />
          </div>
          <h1 className="text-[28px] font-extrabold text-ink">Welcome back</h1>
          <p className="text-ink/70">Sign in to SplitEasy</p>
        </div>
      </div>
      <div className="mx-auto max-w-sm px-5 pt-6">
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Email" htmlFor="login-email" error={errors.email?.message}>
            <Input id="login-email" type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
          </Field>
          <Field label="Password" htmlFor="login-password" error={errors.password?.message}>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              {...register('password')}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-secondary">
          Need an account?{' '}
          <Link to="/register" className="font-bold text-violet-600">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
