import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

export function Button({ variant = 'primary', className = '', ...props }: Props) {
  const base =
    'inline-flex h-11 min-w-[44px] items-center justify-center rounded-2xl px-5 text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50'
  const map: Record<string, string> = {
    primary:
      'bg-gradient-to-r from-pastel-purple to-pastel-purple-deep text-white shadow-soft hover:shadow-glow focus:ring-pastel-lavender',
    secondary:
      'bg-surface-secondary text-ink border border-ink-faint/40 hover:bg-surface-tertiary focus:ring-pastel-lavender',
    ghost:
      'bg-transparent text-ink-secondary hover:bg-surface-tertiary focus:ring-pastel-lavender',
    danger:
      'bg-gradient-to-r from-pastel-rose to-pastel-rose-deep text-white shadow-soft hover:shadow-lg focus:ring-pastel-rose',
  }
  return <button className={`${base} ${map[variant]} ${className}`} {...props} />
}
