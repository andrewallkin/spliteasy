import { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type Toast = {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

type ToastContextType = {
  toasts: Toast[]
  addToast: (type: Toast['type'], message: string) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id))
  }, [])

  const addToast = useCallback(
    (type: Toast['type'], message: string) => {
      const id = crypto.randomUUID()
      setToasts((previous) => [...previous.slice(-2), { id, type, message }])
      window.setTimeout(() => removeToast(id), 3000)
    },
    [removeToast],
  )

  const value = useMemo(() => ({ toasts, addToast, removeToast }), [toasts, addToast, removeToast])
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
