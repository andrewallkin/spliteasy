import type { ReactNode } from 'react'

import { BottomSheet } from '@/components/ui/BottomSheet'

export type SheetAction = {
  key: string
  label: string
  icon?: ReactNode
  onSelect: () => void
  tone?: 'default' | 'danger'
  hidden?: boolean
  disabled?: boolean
}

export function ActionSheet({ isOpen, onClose, title, actions }: { isOpen: boolean; onClose: () => void; title?: string; actions: SheetAction[] }) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <ul className="divide-y divide-line">
        {actions.filter((a) => !a.hidden).map((action) => (
          <li key={action.key}>
            <button
              type="button"
              disabled={action.disabled}
              onClick={() => {
                onClose()
                action.onSelect()
              }}
              className={`flex min-h-[56px] w-full items-center gap-3 py-2 text-left text-[15px] font-bold transition disabled:opacity-50 ${action.tone === 'danger' ? 'text-rose-600' : 'text-ink'}`}
            >
              {action.icon && (
                <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${action.tone === 'danger' ? 'bg-rose-50' : 'bg-surface-tertiary'}`}>{action.icon}</span>
              )}
              {action.label}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  )
}
