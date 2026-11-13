type Props<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  className?: string
  'aria-label'?: string
}

export function FilterChips<T extends string>({ value, onChange, options, className = '', ...rest }: Props<T>) {
  return (
    <div role="group" aria-label={rest['aria-label']} className={`no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5 ${className}`}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`shrink-0 rounded-full border-[1.5px] px-4 py-2 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pastel-lavender ${
              active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-secondary hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
