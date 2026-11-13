import type { ReactNode } from 'react'

type Tone = 'neutral' | 'success' | 'danger'

const tones: Record<Tone, string> = {
  neutral: 'bg-violet-100 text-violet-600',
  success: 'bg-emerald-100 text-emerald-600',
  danger: 'bg-rose-100 text-rose-600',
}

export function EmptyState({ icon, title, description, action, tone = 'neutral', className = '' }: { icon: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; tone?: Tone; className?: string }) {
  return (
    <div className={`flex flex-col items-center rounded-3xl border-[1.5px] border-line bg-white px-6 py-10 text-center ${className}`}>
      <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] ${tones[tone]}`}>{icon}</div>
      <p className="text-base font-extrabold text-ink">{title}</p>
      {description && <div className="mt-1.5 max-w-xs text-sm text-ink-secondary">{description}</div>}
      {action && <div className="mt-5 w-full max-w-xs">{action}</div>}
    </div>
  )
}
