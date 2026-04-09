import type { HTMLAttributes } from 'react'

type Props = HTMLAttributes<HTMLDivElement> & {
  className?: string
}

export function Card({ children, className = '', ...props }: Props) {
  return (
    <div
      className={`rounded-3xl border border-white/60 bg-white/80 p-5 shadow-soft backdrop-blur-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
