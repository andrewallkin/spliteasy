import type { ButtonHTMLAttributes } from 'react'

import { THEMES, type Theme } from '@/lib/theme'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft-danger' | 'dark' | 'accent'
type Size = 'sm' | 'md' | 'lg'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  /** Used by variant="accent". Defaults to lavender. */
  theme?: Theme
}

const sizes: Record<Size, string> = {
  sm: 'h-9 rounded-xl px-3.5 text-xs',
  md: 'h-11 rounded-2xl px-5 text-sm',
  lg: 'h-12 rounded-[18px] px-6 text-[15px]',
}

export function Button({ variant = 'primary', size = 'md', theme = THEMES.lavender, className = '', type = 'button', ...props }: Props) {
  const base =
    'inline-flex min-w-[44px] items-center justify-center gap-2 font-extrabold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-pastel-lavender focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50'
  const variants: Record<Variant, string> = {
    primary: 'bg-gradient-to-br from-pastel-purple to-pastel-purple-deep text-white shadow-[0_8px_20px_rgba(139,92,246,0.30)]',
    accent: `${theme.accentBtn} text-white`,
    dark: 'bg-ink text-white hover:bg-ink/90',
    secondary: 'bg-[#f3efe9] text-ink hover:bg-surface-tertiary',
    ghost: 'bg-transparent text-ink-secondary hover:bg-surface-tertiary',
    danger: 'bg-gradient-to-br from-pastel-rose-deep to-rose-500 text-white shadow-soft',
    'soft-danger': 'bg-rose-50 text-rose-600 hover:bg-rose-100',
  }
  return <button type={type} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />
}
