import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { getEmailAllowlistRejectionMessage, getErrorMessage } from '@/utils/errors'

const schema = z
  .object({
    email: z.string().email('Enter a valid email'),
    displayName: z.string().min(1, 'Display name is required').max(120),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export function RegisterPage() {
  const { register: registerAccount, isAuthenticated } = useAuth()
  const { addToast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true)
    try {
      await registerAccount(values.email, values.displayName, values.password)
      addToast('success', 'Account created')
    } catch (error) {
      const allowlistMsg = getEmailAllowlistRejectionMessage(error)
      if (allowlistMsg) {
        addToast('error', allowlistMsg)
      } else {
        addToast('error', getErrorMessage(error, 'Unable to register'))
      }
    } finally {
      setIsSubmitting(false)
    }
  })

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-pastel-mint to-pastel-mint-deep shadow-soft">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-ink">Create account</h1>
          <p className="mt-1 text-sm text-ink-secondary">Get started with SplitEasy</p>
        </div>
        <Card className="space-y-4">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Display Name</label>
              <Input autoComplete="name" placeholder="How others will see you" {...register('displayName')} />
              {errors.displayName && <p className="mt-1.5 text-xs text-rose-500">{errors.displayName.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Email</label>
              <Input type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
              {errors.email && <p className="mt-1.5 text-xs text-rose-500">{errors.email.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Password</label>
              <Input type="password" placeholder="At least 8 characters" {...register('password')} />
              {errors.password && <p className="mt-1.5 text-xs text-rose-500">{errors.password.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Confirm password</label>
              <Input type="password" placeholder="Repeat your password" {...register('confirmPassword')} />
              {errors.confirmPassword && (
                <p className="mt-1.5 text-xs text-rose-500">{errors.confirmPassword.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </Button>
          </form>
          <p className="text-center text-sm text-ink-secondary">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-pastel-purple-deep hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
