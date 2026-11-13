import type { HTMLAttributes } from 'react'

type Props = HTMLAttributes<HTMLDivElement> & {
  className?: string
}

export function Card({ children, className = '', ...props }: Props) {
  return (
    <div className={`rounded-3xl border-[1.5px] border-line bg-white p-4 ${className}`} {...props}>
      {children}
    </div>
  )
}
