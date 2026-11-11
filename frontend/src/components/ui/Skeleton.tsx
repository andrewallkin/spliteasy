export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-ink-faint/30 ${className}`} aria-hidden="true" />
}
