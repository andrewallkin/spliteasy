import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { XMarkIcon } from '@/components/ui/icons'

const openStack: number[] = []
let nextSheetId = 1

type Props = {
  isOpen: boolean
  onClose: () => void
  title?: ReactNode
  /** Accessible name when title is not a plain string. */
  ariaLabel?: string
  footer?: ReactNode
  closeDisabled?: boolean
  hideCloseButton?: boolean
  children: ReactNode
}

export function BottomSheet({ isOpen, onClose, title, ariaLabel, footer, closeDisabled = false, hideCloseButton = false, children }: Props) {
  const onCloseRef = useRef(onClose)
  const closeDisabledRef = useRef(closeDisabled)
  useEffect(() => {
    onCloseRef.current = onClose
    closeDisabledRef.current = closeDisabled
  })

  useEffect(() => {
    if (!isOpen) return
    const id = nextSheetId++
    openStack.push(id)
    if (openStack.length === 1) document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || openStack[openStack.length - 1] !== id) return
      if (!closeDisabledRef.current) onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      const index = openStack.indexOf(id)
      if (index !== -1) openStack.splice(index, 1)
      if (openStack.length === 0) document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-end justify-center md:items-center md:p-6">
      <div className="absolute inset-0 animate-fade-in bg-ink/45" aria-hidden="true" onClick={() => { if (!closeDisabled) onClose() }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
        className="relative flex max-h-[92vh] w-full max-w-[768px] animate-sheet-up flex-col rounded-t-4xl bg-white shadow-float md:max-w-lg md:rounded-4xl"
      >
        <div className="flex justify-center pt-2.5 md:hidden" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-ink-faint/60" />
        </div>
        {(title || !hideCloseButton) && (
          <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-3">
            <div className="min-w-0 text-lg font-extrabold text-ink">{title}</div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                disabled={closeDisabled}
                aria-label="Close"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-tertiary text-ink-secondary transition hover:text-ink disabled:opacity-50"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">{children}</div>
        {footer && <div className="border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
