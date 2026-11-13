import { Button } from '@/components/ui/Button'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import type { Theme } from '@/lib/theme'

type Props = {
  isOpen: boolean
  onClose: () => void
  closeDisabled: boolean
  nameDraft: string
  onNameDraftChange: (value: string) => void
  onSave: () => void
  isSaving: boolean
  theme: Theme
}

export function RenameGroupSheet({ isOpen, onClose, closeDisabled, nameDraft, onNameDraftChange, onSave, isSaving, theme }: Props) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Rename group"
      closeDisabled={closeDisabled}
      footer={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={closeDisabled}
          >
            Cancel
          </Button>
          <Button variant="accent" theme={theme} className="flex-1" onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Name'}
          </Button>
        </div>
      }
    >
      <Field label="Group name" htmlFor="group-name">
        <Input
          id="group-name"
          value={nameDraft}
          onChange={(event) => onNameDraftChange(event.target.value)}
          maxLength={255}
        />
      </Field>
    </BottomSheet>
  )
}
