import { forwardRef, type InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  fullWidth?: boolean
}

export const Input = forwardRef<HTMLInputElement, Props>(
  function Input({ className = '', fullWidth = true, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`h-11 rounded-2xl border border-ink-faint/40 bg-surface-secondary px-4 text-sm text-ink outline-none transition-all duration-200 placeholder:text-ink-tertiary focus:border-pastel-purple focus:bg-white focus:ring-2 focus:ring-pastel-lavender/50 ${fullWidth ? 'w-full' : ''} ${className}`}
        {...props}
      />
    )
  },
)
