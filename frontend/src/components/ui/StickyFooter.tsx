import type { ReactNode } from 'react'

export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30">
      <div className="mx-auto flex max-w-[768px] gap-2 bg-gradient-to-t from-surface-warm via-surface-warm/95 to-transparent px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-6 md:px-6">
        {children}
      </div>
    </div>
  )
}
