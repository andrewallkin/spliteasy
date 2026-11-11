export function LoadingSpinner({ className = 'h-7 w-7' }: { className?: string }) {
  return <div className={`animate-spin rounded-full border-[3px] border-pastel-lavender/50 border-t-pastel-purple-deep ${className}`} role="status" aria-label="Loading" />
}
