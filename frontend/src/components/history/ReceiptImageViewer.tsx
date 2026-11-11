import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react'

import { getReceiptImageBlob } from '@/api/groups'
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@/components/ui/icons'

function useReceiptImageBlobs(receiptId: string, imageCount: number, enabled: boolean) {
  const [blobUrls, setBlobUrls] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !receiptId || imageCount < 1) {
      let resetCancelled = false
      void Promise.resolve().then(() => {
        if (!resetCancelled) {
          setBlobUrls([])
          setIsLoading(false)
        }
      })
      return () => {
        resetCancelled = true
      }
    }

    let cancelled = false
    const created: string[] = []

    void Promise.resolve().then(() => {
      if (!cancelled) setIsLoading(true)
    })

    void Promise.all(
      Array.from({ length: imageCount }, (_, i) =>
        getReceiptImageBlob(receiptId, i).then((blob) => {
          if (cancelled) return null
          const u = URL.createObjectURL(blob)
          created.push(u)
          return u
        }),
      ),
    )
      .then((urls) => {
        if (cancelled) {
          created.forEach((u) => URL.revokeObjectURL(u))
          return
        }
        const filtered = urls.filter((u): u is string => u !== null)
        setBlobUrls(filtered)
      })
      .catch(() => {
        if (cancelled) return
        created.forEach((u) => URL.revokeObjectURL(u))
        setBlobUrls([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
      created.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [receiptId, imageCount, enabled])

  return { blobUrls, isLoading }
}

type ReceiptImageCarouselHandle = {
  goPrev: () => void
  goNext: () => void
}

export const ReceiptImageCarousel = forwardRef<ReceiptImageCarouselHandle, {
  receiptId: string
  imageCount: number
  imageUrls?: string[]
  variant: 'thumb' | 'modal'
  enabled?: boolean
}>(function ReceiptImageCarousel({
  receiptId,
  imageCount,
  imageUrls,
  variant,
  enabled = true,
}, ref) {
  const signedUrls = (imageUrls ?? []).filter(Boolean)
  const shouldFetch = enabled && Boolean(receiptId) && signedUrls.length === 0
  const { blobUrls, isLoading } = useReceiptImageBlobs(receiptId, imageCount, shouldFetch)
  const displayUrls = signedUrls.length > 0 ? signedUrls : blobUrls
  const count = Math.max(1, signedUrls.length || imageCount)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const w = el.clientWidth
    const idx = Math.round(el.scrollLeft / Math.max(w, 1))
    setCurrentIndex(Math.min(Math.max(0, idx), count - 1))
  }, [count])

  const jumpToIndex = useCallback((nextIndex: number) => {
    const el = scrollRef.current
    if (!el) return
    const clamped = Math.min(Math.max(0, nextIndex), count - 1)
    el.scrollTo({
      left: clamped * Math.max(el.clientWidth, 1),
      behavior: 'auto',
    })
    setCurrentIndex(clamped)
  }, [count])

  useImperativeHandle(ref, () => ({
    goPrev: () => jumpToIndex(currentIndex - 1),
    goNext: () => jumpToIndex(currentIndex + 1),
  }), [currentIndex, jumpToIndex])

  const resetKey = `${receiptId ?? ''}-${count}-${variant}`
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey)
    setCurrentIndex(0)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTo({
        left: 0,
        behavior: 'auto',
      })
    }
  }, [resetKey])

  const thumbBox = 'relative h-11 w-11 overflow-hidden rounded-2xl bg-surface-secondary'
  const thumbCaption =
    count > 1 && variant === 'thumb' ? (
      <div className="pointer-events-none absolute bottom-0.5 left-1/2 z-[1] -translate-x-1/2 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white">
        {currentIndex + 1}/{count}
      </div>
    ) : null
  const modalCaption =
    count > 1 && variant === 'modal' ? (
      <div className="pointer-events-none absolute left-1/2 top-4 z-[2] -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold tabular-nums text-white">
        {currentIndex + 1} / {count}
      </div>
    ) : null
  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < count - 1

  if (isLoading || displayUrls.length === 0) {
    return (
      <div
        className={
          variant === 'thumb'
            ? `${thumbBox} flex items-center justify-center border border-surface-tertiary px-1 text-center text-[10px] font-semibold text-ink-tertiary`
            : 'flex h-[60vh] w-full items-center justify-center text-sm text-white'
        }
      >
        {isLoading ? 'Loading...' : 'No image'}
      </div>
    )
  }

  if (count <= 1 || displayUrls.length === 1) {
    return (
      <div
        className={
          variant === 'thumb'
            ? `${thumbBox} group flex items-center justify-center border border-surface-tertiary`
            : 'relative max-h-[92vh] w-full'
        }
      >
        <img
          src={displayUrls[0]}
          alt="Receipt"
          className={
            variant === 'thumb'
              ? 'max-h-full max-w-full min-h-0 min-w-0 object-contain object-top transition-transform duration-200 group-hover:scale-105'
              : 'max-h-[92vh] w-full object-contain'
          }
        />
      </div>
    )
  }

  return (
    <div className={variant === 'thumb' ? `group ${thumbBox} border border-surface-tertiary` : 'relative w-full'}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={
          variant === 'thumb'
            ? 'flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
            : 'flex max-h-[92vh] w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
        }
        style={variant === 'modal' ? { touchAction: 'pan-x' } : undefined}
      >
        {displayUrls.map((url, i) => (
          <div
            key={i}
            className={
              variant === 'thumb'
                ? 'flex h-11 min-w-11 shrink-0 snap-center items-center justify-center'
                : 'flex min-h-[60vh] min-w-full shrink-0 snap-center items-center justify-center'
            }
          >
            <img
              src={url}
              alt=""
              className={
                variant === 'thumb'
                  ? 'max-h-full max-w-full min-h-0 min-w-0 object-contain object-top transition-transform duration-200 group-hover:scale-105'
                  : 'max-h-[92vh] w-full max-w-full object-contain'
              }
            />
          </div>
        ))}
      </div>
      {variant === 'modal' && (
        <>
          <button
            type="button"
            onClick={() => jumpToIndex(currentIndex - 1)}
            disabled={!canGoPrev}
            aria-label="Previous receipt image"
            className="absolute left-3 top-1/2 z-[2] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => jumpToIndex(currentIndex + 1)}
            disabled={!canGoNext}
            aria-label="Next receipt image"
            className="absolute right-3 top-1/2 z-[2] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </>
      )}
      {thumbCaption}
      {modalCaption}
    </div>
  )
})

ReceiptImageCarousel.displayName = 'ReceiptImageCarousel'

export function ReceiptImageModal({
  isOpen,
  receiptId,
  imageCount,
  imageUrls,
  onClose,
}: {
  isOpen: boolean
  receiptId: string
  imageCount: number
  imageUrls?: string[]
  onClose: () => void
}) {
  const count = Math.max(1, (imageUrls?.length ?? 0) || imageCount)
  const carouselRef = useRef<ReceiptImageCarouselHandle | null>(null)

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (count <= 1) {
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        carouselRef.current?.goPrev()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        carouselRef.current?.goNext()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose, count])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/90 p-4 pt-[calc(1rem+env(safe-area-inset-top))]"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-4xl items-center justify-center"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-0 top-0 z-10 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white transition hover:bg-white/25"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
        <ReceiptImageCarousel
          ref={carouselRef as RefObject<ReceiptImageCarouselHandle>}
          receiptId={receiptId}
          imageCount={count}
          imageUrls={imageUrls}
          variant="modal"
          enabled={isOpen && Boolean(receiptId)}
        />
      </div>
    </div>
  )
}
