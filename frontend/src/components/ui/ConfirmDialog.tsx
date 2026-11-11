import { BottomSheet } from '@/components/ui/BottomSheet'
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

export function ConfirmDialog({ isOpen, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', isLoading = false, onConfirm, onCancel, onClose }: ConfirmDialogProps) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      closeDisabled={isLoading}
      hideCloseButton
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" onClick={onCancel} disabled={isLoading} className="flex-1">
            {cancelLabel}
          </Button>
          <Button variant="danger" size="lg" onClick={onConfirm} disabled={isLoading} className="flex-1">
            {isLoading ? 'Working...' : confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-ink-secondary">{message}</p>
    </BottomSheet>
  )
}
