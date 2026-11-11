import type { ReactNode } from 'react'

export type SegmentOption<T extends string> = { value: T; label: ReactNode; disabled?: boolean }

type Props<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: SegmentOption<T>[]
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function SegmentedControl<T extends string>({ value, onChange, options, size = 'md', disabled = false, className = '', ...rest }: Props<T>) {
  return (
    <div role="group" aria-label={rest['aria-label']} className={`flex gap-1 rounded-2xl bg-[#f3efe9] p-1 ${className}`}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-xl font-bold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-pastel-lavender disabled:cursor-not-allowed disabled:opacity-50 ${
              size === 'sm' ? 'min-h-[36px] px-2 text-xs' : 'min-h-[40px] px-3 text-[13px]'
            } ${active ? 'bg-white text-ink shadow-[0_2px_8px_rgba(45,43,61,0.08)]' : 'text-ink-secondary hover:text-ink'}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
