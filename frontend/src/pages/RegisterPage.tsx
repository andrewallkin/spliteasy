import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
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
    <div className="min-h-screen bg-surface-warm">
      <div className="relative h-64 overflow-hidden rounded-b-[40px] bg-gradient-to-br from-pastel-mint via-sky-200 to-pastel-sky">
        <div className="absolute -right-10 -top-[30px] h-40 w-40 rounded-full bg-white/25" />
        <div className="absolute -left-5 bottom-[30px] h-[90px] w-[90px] rounded-full bg-pastel-mint/50" />
        <div className="absolute bottom-7 left-6">
          <div className="mb-3.5 h-14 w-14 shrink-0 overflow-hidden rounded-[20px]">
            <img src="/favicon.png" alt="" className="h-full w-full scale-110 object-cover" width={56} height={56} />
          </div>
          <h1 className="text-[28px] font-extrabold text-ink">Create account</h1>
          <p className="text-ink/70">Get started with SplitEasy</p>
        </div>
      </div>
      <div className="mx-auto max-w-sm px-5 pt-6">
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Display Name" htmlFor="register-name" error={errors.displayName?.message}>
            <Input id="register-name" autoComplete="name" placeholder="How others will see you" {...register('displayName')} />
          </Field>
          <Field label="Email" htmlFor="register-email" error={errors.email?.message}>
            <Input id="register-email" type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
          </Field>
          <Field label="Password" htmlFor="register-password" error={errors.password?.message}>
            <Input id="register-password" type="password" placeholder="At least 8 characters" {...register('password')} />
          </Field>
          <Field label="Confirm password" htmlFor="register-confirm" error={errors.confirmPassword?.message}>
            <Input id="register-confirm" type="password" placeholder="Repeat your password" {...register('confirmPassword')} />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-secondary">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-violet-600">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
