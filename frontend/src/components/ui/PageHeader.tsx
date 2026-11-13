import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { ChevronLeftIcon, XMarkIcon } from '@/components/ui/icons'
import type { Theme } from '@/lib/theme'

export const headerIconButtonClassName =
  'flex h-11 w-11 items-center justify-center rounded-2xl bg-white/45 text-ink transition hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white'

type Props = {
  theme: Theme
  title: ReactNode
  subtitle?: ReactNode
  /** Path to link back to, or a click handler. */
  back?: string | (() => void)
  backIcon?: 'back' | 'close'
  backLabel?: string
  /** Right-aligned control(s), e.g. a menu button. */
  right?: ReactNode
  /** Rendered left of the title, e.g. a group photo tile. */
  leading?: ReactNode
  /** Extra bottom padding so a FloatCard can overlap the band. */
  tall?: boolean
  /** Extra content below the title (e.g. a step progress bar). */
  children?: ReactNode
}

export function PageHeader({ theme, title, subtitle, back, backIcon = 'back', backLabel = 'Back', right, leading, tall = false, children }: Props) {
  const icon = backIcon === 'close' ? <XMarkIcon className="h-5 w-5" /> : <ChevronLeftIcon className="h-5 w-5" />
  return (
    <header className={`relative overflow-hidden rounded-b-4xl px-5 pt-[calc(1rem+env(safe-area-inset-top))] text-ink ${tall ? 'pb-16' : 'pb-6'} ${theme.band}`}>
      <span className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/25" aria-hidden="true" />
      <span className="pointer-events-none absolute -bottom-10 -left-8 h-28 w-28 rounded-full bg-white/15" aria-hidden="true" />
      {(back || right) && (
        <div className="relative mb-4 flex items-center justify-between">
          {typeof back === 'string' ? (
            <Link to={back} aria-label={backLabel} className={headerIconButtonClassName}>{icon}</Link>
          ) : back ? (
            <button type="button" onClick={back} aria-label={backLabel} className={headerIconButtonClassName}>{icon}</button>
          ) : (
            <span />
          )}
          {right}
        </div>
      )}
      <div className="relative flex items-center gap-3">
        {leading}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm font-medium text-ink/70">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </header>
  )
}

export function FloatCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`relative -mt-14 rounded-3xl bg-white p-5 shadow-float ${className}`}>{children}</div>
}

export function PageContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-3 px-4 pt-4 md:px-6 ${className}`}>{children}</div>
}
