import { forwardRef, type SelectHTMLAttributes } from 'react'

import { ChevronDownIcon } from '@/components/ui/icons'
import { inputClassName } from '@/components/ui/Input'

type Props = SelectHTMLAttributes<HTMLSelectElement>

export const Select = forwardRef<HTMLSelectElement, Props>(function Select({ className = '', children, ...props }, ref) {
  return (
    <div className={`relative ${className}`}>
      <select ref={ref} className={`${inputClassName} w-full appearance-none pr-10`} {...props}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
    </div>
  )
})
