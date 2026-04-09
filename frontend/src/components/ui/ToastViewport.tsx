import { useToast } from '@/context/ToastContext'

export function ToastViewport() {
  const { toasts, removeToast } = useToast()
  return (
    <div className="fixed left-4 right-4 top-4 z-[60] flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-96">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => removeToast(toast.id)}
          className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium shadow-soft backdrop-blur-sm transition-all duration-200 ${
            toast.type === 'success'
              ? 'border-pastel-mint/40 bg-emerald-50/90 text-emerald-800'
              : toast.type === 'error'
                ? 'border-pastel-rose/40 bg-rose-50/90 text-rose-800'
                : 'border-pastel-lavender/40 bg-violet-50/90 text-violet-800'
          }`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  )
}
