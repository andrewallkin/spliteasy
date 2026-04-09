import { useEffect } from 'react'

import { Button } from '@/components/ui/Button'

type ConfirmDialogProps = {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
  onClose: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isLoading = false,
  onConfirm,
  onCancel,
  onClose,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isLoading) {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, isLoading, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4"
      onClick={() => {
        if (!isLoading) onClose()
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-surface-tertiary bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <p className="text-sm text-ink-secondary">{message}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading} className="h-10 rounded-xl px-4 text-xs">
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isLoading} className="h-10 rounded-xl px-4 text-xs">
            {isLoading ? 'Working...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
