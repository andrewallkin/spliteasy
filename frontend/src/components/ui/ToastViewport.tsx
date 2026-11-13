import { CheckIcon, WarningIcon } from '@/components/ui/icons'
import { useToast } from '@/context/ToastContext'

export function ToastViewport() {
  const { toasts, removeToast } = useToast()
  return (
    <div className="pointer-events-none fixed inset-x-4 top-[calc(1rem+env(safe-area-inset-top))] z-[80] mx-auto flex max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => removeToast(toast.id)}
          className="pointer-events-auto flex w-full animate-fade-in items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left text-sm font-semibold text-ink shadow-float"
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
              toast.type === 'success' ? 'bg-emerald-100 text-emerald-600' : toast.type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-violet-100 text-violet-600'
            }`}
          >
            {toast.type === 'success' ? <CheckIcon className="h-4 w-4" /> : <WarningIcon className="h-4 w-4" />}
          </span>
          {toast.message}
        </button>
      ))}
    </div>
  )
}
