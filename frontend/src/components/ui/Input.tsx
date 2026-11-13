import { forwardRef, type InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  fullWidth?: boolean
}

export const inputClassName =
  'h-12 rounded-2xl border-[1.5px] border-field-border bg-field px-4 text-base text-ink outline-none transition-all duration-200 placeholder:text-ink-tertiary focus:border-pastel-purple focus:bg-white focus:ring-4 focus:ring-pastel-lavender/35 disabled:opacity-60'

export const Input = forwardRef<HTMLInputElement, Props>(function Input({ className = '', fullWidth = true, ...props }, ref) {
  return <input ref={ref} className={`${inputClassName} ${fullWidth ? 'w-full' : ''} ${className}`} {...props} />
})
