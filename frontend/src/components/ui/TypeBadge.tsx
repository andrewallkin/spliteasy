type Kind = 'receipt' | 'entry' | 'settlement'

const styles: Record<Kind, { label: string; className: string }> = {
  receipt: { label: 'Receipt', className: 'bg-violet-100 text-violet-700' },
  entry: { label: 'Expense', className: 'bg-sky-100 text-sky-700' },
  settlement: { label: 'Settlement', className: 'bg-emerald-100 text-emerald-700' },
}

export function TypeBadge({ kind, className = '' }: { kind: Kind; className?: string }) {
  const style = styles[kind]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${style.className} ${className}`}>{style.label}</span>
}
