import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type ConfirmDialogOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
}

type ConfirmDialogState = Required<ConfirmDialogOptions>

type ResolverRef = {
  resolve: (value: boolean) => void
} | null

const defaultLabels = {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
}

export function useConfirmDialog() {
  const resolverRef = useRef<ResolverRef>(null)
  const [dialogState, setDialogState] = useState<ConfirmDialogState | null>(null)

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.resolve(value)
    resolverRef.current = null
    setDialogState(null)
  }, [])

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current?.resolve(false)
      resolverRef.current = { resolve }
      setDialogState({
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? defaultLabels.confirmLabel,
        cancelLabel: options.cancelLabel ?? defaultLabels.cancelLabel,
      })
    })
  }, [])

  useEffect(() => {
    return () => {
      resolverRef.current?.resolve(false)
      resolverRef.current = null
    }
  }, [])

  const dialogProps = useMemo(
    () => ({
      isOpen: dialogState !== null,
      title: dialogState?.title ?? '',
      message: dialogState?.message ?? '',
      confirmLabel: dialogState?.confirmLabel ?? defaultLabels.confirmLabel,
      cancelLabel: dialogState?.cancelLabel ?? defaultLabels.cancelLabel,
      onConfirm: () => settle(true),
      onCancel: () => settle(false),
      onClose: () => settle(false),
    }),
    [dialogState, settle],
  )

  return { confirm, dialogProps }
}
