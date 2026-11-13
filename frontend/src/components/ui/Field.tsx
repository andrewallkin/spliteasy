import type { ReactNode } from 'react'

type Props = {
  label: ReactNode
  htmlFor?: string
  error?: string
  hint?: ReactNode
  className?: string
  children: ReactNode
}

export const microLabelClassName = 'text-[11px] font-extrabold uppercase tracking-wider text-ink-tertiary'

export function Field({ label, htmlFor, error, hint, className = '', children }: Props) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={`mb-1.5 block ${microLabelClassName}`}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-ink-tertiary">{hint}</p>}
      {error && <p className="mt-1.5 text-xs font-medium text-rose-500">{error}</p>}
    </div>
  )
}
